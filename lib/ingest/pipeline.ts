/**
 * Daily ingest pipeline (Node runtime).
 *
 * Per shard, this function: reads the team's universe and the shard's
 * podcasts → fans out parallel Particle queries (entity-mention search,
 * semantic content search) → dedupes results → groups by episode → for
 * each fresh episode, fetches the full transcript once and calls Claude
 * once to extract all relevant moments → persists episodes/segments/cards.
 *
 * U4 (cost-optimization plan) replaced the per-segment Claude pass with
 * a single per-episode `extractEpisodeMoments` call. The per-segment
 * fan-out is gone; the new shape calls Claude ~6× less often AND fetches
 * the transcript ~6× less often (one per episode vs one per segment).
 *
 * Idempotency is enforced at the schema level — `segments.particle_segment_id`
 * carries a UNIQUE constraint and `cards (user_id, team_id, episode_id)` is
 * unique. The extractor's contract requires every moment to carry a
 * `particle_segment_id` from the anchors list, so re-runs upsert the same
 * rows.
 */

import "server-only";

import type {
  ParticleSearchResult,
  ParticleSegment,
  ParticleEpisode,
  ParticleEpisodeAd,
  ParticleMentionResult,
  ParticleTranscriptLine,
} from "@/lib/particle/types";
import { paginateAll } from "@/lib/particle/client";
import { extractEpisodeMoments } from "@/lib/anthropic/extract-episode-moments";
import {
  EPISODE_EXTRACTION_PROMPT_VERSION,
  type EpisodeExtractionOutput,
  type EpisodeMoment,
  type MentionAnchor,
  type TeamContext,
  type TranscriptLine,
} from "@/lib/anthropic/types";

import type {
  IngestPipelineInput,
  IngestPipelineOutput,
  PipelineDeps,
} from "./types";

const PARTICLE_PAGE_LIMIT = 25;
const PARTICLE_MAX_PAGES = 4;
// Concurrency=2 paired with the deadline guard below. Two concurrent
// extractions can burst past Anthropic's Tier-1 50K-input-tokens/min
// rate limit on larger episodes; SDK maxRetries=5 (in lib/anthropic/
// client.ts) absorbs the resulting 429s via backoff. The deadline
// guard ensures the run always finishes inside Vercel's 300s budget
// even when retries stack up — it just persists fewer episodes that
// run.
const EPISODE_CONCURRENCY = 2;
// Wall-clock budget for the extraction loop. Vercel's route maxDuration
// is 300s; we stop dispatching new work at 240s so persistence + the
// terminal system_alerts insert have a 60s tail to finish cleanly.
// Without this, the function gets SIGKILLed mid-extraction and no
// `_complete` row is written — the "silent crash" pattern that hid
// the May 15+16 scheduled-run failures.
const PIPELINE_DEADLINE_MS = 240_000;

interface NormalisedSegment {
  episodeId: string;
  episode: ParticleEpisode;
  segment: ParticleSegment;
  matchSource: "keyword" | "semantic" | "entity";
  surfacingEntities: string[];
}

export async function runIngestPipeline(
  deps: PipelineDeps,
  input: IngestPipelineInput,
): Promise<IngestPipelineOutput> {
  const out: IngestPipelineOutput = {
    episodesPersisted: 0,
    segmentsPersisted: 0,
    cardsPersisted: 0,
    segmentsRejectedOffTopic: 0,
    segmentsFailedSummary: 0,
    particleCallsAttempted: 0,
    anthropicCallsAttempted: 0,
    episodesSkippedByDeadline: 0,
  };
  const startMs = Date.now();

  // 1. Load the team's universe (slugs + IDs cached at seed time).
  const team = await loadTeamContext(deps, input.teamId);

  // 2. Fan-out Particle queries. Discovery mode picks the path:
  //    - "mentions": mentions + semantic search produce pre-flagged
  //      moment windows Claude anchors on.
  //    - "list-episodes": cheaper standard-tier `episodes?entity_id=…`
  //      discovery; Claude finds moments freely from the full transcript.
  const discoveryMode = input.discoveryMode ?? "mentions";
  const since = input.sinceTimestamp;
  const until = input.untilTimestamp;
  const entityIds = Object.values(team.entityIdMap);

  let allNormalised: NormalisedSegment[];
  if (discoveryMode === "list-episodes") {
    const listEpisodesResults = (
      await Promise.all(
        entityIds.map(async (entityId) =>
          paginateAll<ParticleEpisode>(
            (cursor) => {
              out.particleCallsAttempted += 1;
              return deps.particle.listEpisodes({
                entityId,
                publishedAfter: since,
                publishedBefore: until,
                cursor,
                limit: PARTICLE_PAGE_LIMIT,
              });
            },
            { maxPages: PARTICLE_MAX_PAGES },
          ),
        ),
      )
    ).flat();
    allNormalised = dedupeSegments(
      listEpisodesResults.flatMap((ep) => normaliseFromListEpisode(ep)),
    );
  } else {
    const entityResults = (
      await Promise.all(
        entityIds.map(async (entityId) =>
          paginateAll<ParticleMentionResult>(
            (cursor) => {
              out.particleCallsAttempted += 1;
              return deps.particle.searchEntityMentions({
                entityId,
                since,
                until,
                cursor,
                limit: PARTICLE_PAGE_LIMIT,
              });
            },
            { maxPages: PARTICLE_MAX_PAGES },
          ),
        ),
      )
    ).flat();

    const semanticResults = (
      await Promise.all(
        team.storylines.map(async (storyline) =>
          paginateAll<ParticleSearchResult>(
            (cursor) => {
              out.particleCallsAttempted += 1;
              return deps.particle.searchByContent({
                semantic: storyline,
                since,
                until,
                cursor,
                limit: PARTICLE_PAGE_LIMIT,
              });
            },
            { maxPages: PARTICLE_MAX_PAGES },
          ),
        ),
      )
    ).flat();

    // 3. Normalise and dedupe across the two streams.
    allNormalised = dedupeSegments([
      ...entityResults.flatMap((m) => normaliseFromMention(m)),
      ...semanticResults.flatMap((s) => normaliseFromSearch(s)),
    ]);
  }

  // 3a. Filter to podcasts in our curated catalog. Particle's entity-
  //     mention search returns hits from across its entire universe,
  //     not just the podcasts we know about. Episodes from uncatalogued
  //     podcasts would FK-violate on the episodes.podcast_id column at
  //     persistence time, so we drop them here before paying for
  //     transcript fetches and Claude calls.
  const catalogParticleIds = new Set(
    (
      await deps.supabase.from("podcasts").select("particle_id")
    ).data?.map((row) => row.particle_id as string).filter(Boolean) ?? [],
  );
  const normalised = allNormalised.filter((s) =>
    catalogParticleIds.has(s.episode.podcast.id),
  );
  const droppedOutOfCatalog = allNormalised.length - normalised.length;
  if (droppedOutOfCatalog > 0) {
    console.log(
      `pipeline: dropped ${droppedOutOfCatalog} segment(s) from uncatalogued podcasts (kept ${normalised.length}).`,
    );
  }

  // 4. Filter to segments not already persisted (cross-run dedupe).
  //    Skipped entirely under forceReprocess — re-fetches every segment.
  const fresh = input.forceReprocess
    ? normalised
    : await filterAlreadyPersisted(deps.supabase, normalised);

  if (fresh.length === 0) return out;

  // 5. Group fresh anchors by episode. The unit of Claude work and
  //    transcript fetch is now an episode, not a segment.
  const byEpisode = new Map<string, { episode: ParticleEpisode; anchors: NormalisedSegment[] }>();
  for (const s of fresh) {
    const bucket = byEpisode.get(s.episodeId) ?? { episode: s.episode, anchors: [] };
    bucket.anchors.push(s);
    byEpisode.set(s.episodeId, bucket);
  }

  // 6. For each episode (bounded concurrency = EPISODE_CONCURRENCY):
  //    fetch full transcript once + extract all relevant moments in one
  //    Claude call. Concurrency=5 stays well inside the Vercel 300s
  //    budget at a typical ~8 episodes/day.
  type EpisodeResult = {
    episodeId: string;
    episode: ParticleEpisode;
    anchors: NormalisedSegment[];
    extraction: EpisodeExtractionOutput | null;
    transcript: readonly ParticleTranscriptLine[] | null;
    skippedByDeadline?: boolean;
  };

  let episodeKeys = [...byEpisode.keys()];
  if (input.maxEpisodes !== undefined && input.maxEpisodes >= 0) {
    episodeKeys = episodeKeys.slice(0, input.maxEpisodes);
  }
  const episodeResults = await mapWithConcurrency(
    episodeKeys,
    EPISODE_CONCURRENCY,
    async (epId): Promise<EpisodeResult> => {
      const bucket = byEpisode.get(epId)!;
      // Deadline guard: if we've already burned the wall-clock budget,
      // skip this episode rather than start work we can't finish.
      // The persistence loop below still runs for episodes that DID
      // complete, so the run writes a clean `_complete` row.
      if (Date.now() - startMs > PIPELINE_DEADLINE_MS) {
        out.episodesSkippedByDeadline += 1;
        return {
          episodeId: epId,
          episode: bucket.episode,
          anchors: bucket.anchors,
          extraction: null,
          transcript: null,
          skippedByDeadline: true,
        };
      }
      // Both calls are independent — fan them out. Saves one round-trip
      // of latency per episode. Ads-strip is best-effort, so its failure
      // path returns []; the transcript call's failure aborts this
      // episode.
      out.particleCallsAttempted += 2;
      const [transcriptResult, ads] = await Promise.all([
        deps.particle
          .getClipTranscript({ episodeId: epId })
          .then((t) => ({ ok: true as const, value: t }))
          .catch((err: unknown) => ({ ok: false as const, err })),
        fetchEpisodeAds(deps.particle, epId),
      ]);
      if (!transcriptResult.ok) {
        console.error(
          `pipeline: transcript fetch failed for episode ${epId}:`,
          transcriptResult.err instanceof Error ? transcriptResult.err.message : String(transcriptResult.err),
        );
        return { episodeId: epId, episode: bucket.episode, anchors: bucket.anchors, extraction: null, transcript: null };
      }
      const transcript = transcriptResult.value;
      if (transcript.lines.length === 0) {
        return { episodeId: epId, episode: bucket.episode, anchors: bucket.anchors, extraction: null, transcript: null };
      }

      // Same stripped lines must flow to Claude AND buildMomentTranscript
      // — pull-quote validation runs against the persisted text, so any
      // asymmetric reads drop quotes that landed in ads.
      const strippedLines = stripAdWindows(transcript.lines, ads);

      const transcriptLines: TranscriptLine[] = strippedLines.map((l) => ({
        start_seconds: l.start_seconds,
        end_seconds: l.end_seconds,
        speaker: l.speaker,
        text: l.text,
      }));
      // list-episodes mode passes no anchors; the post-process below
      // assigns each moment a synthetic `${episodeId}:${start}-${end}`
      // ID so the segments.particle_segment_id UNIQUE constraint holds
      // without anchor IDs from Particle.
      const anchors: MentionAnchor[] =
        discoveryMode === "list-episodes"
          ? []
          : bucket.anchors.map((a) => ({
              particle_segment_id: a.segment.id,
              start_seconds: a.segment.start_seconds,
              end_seconds: a.segment.end_seconds,
              title: a.segment.title,
              match_source: a.matchSource,
              surfacing_entities: a.surfacingEntities,
            }));

      out.anthropicCallsAttempted += 1;
      const extraction = await extractEpisodeMoments(deps.anthropic, {
        team: { name: team.name, sport: team.sport, entities: team.entities, storylines: team.storylines },
        podcast: { name: bucket.episode.podcast.title, kind: "national" },
        episode: { title: bucket.episode.title, published_at: bucket.episode.published_at },
        transcript: transcriptLines,
        anchors,
      });

      return {
        episodeId: epId,
        episode: bucket.episode,
        anchors: bucket.anchors,
        extraction,
        transcript: strippedLines,
      };
    },
  );

  // 7. Persist per episode.
  for (const result of episodeResults) {
    if (result.skippedByDeadline) {
      // Anchors weren't processed and aren't yet in DB at the current
      // prompt_version, so the next run's filterAlreadyPersisted will
      // surface them again. No counter bump — these aren't off-topic.
      continue;
    }
    if (!result.extraction || !result.transcript) {
      // Transcript fetch failed or extraction returned null after retries.
      // Anchors are treated as off-topic so we don't lose visibility.
      out.segmentsRejectedOffTopic += result.anchors.length;
      continue;
    }
    if (result.extraction.moments.length === 0) {
      // Extractor decided the episode has no relevant content.
      out.segmentsRejectedOffTopic += result.anchors.length;
      continue;
    }

    // 7a. Episode row.
    const { data: episodeRow, error: epErr } = await deps.supabase
      .from("episodes")
      .upsert(
        {
          podcast_id: await resolveLocalPodcastId(deps.supabase, result.episode.podcast.id),
          particle_episode_id: result.episode.id,
          title: result.episode.title,
          published_at: result.episode.published_at,
          audio_url: result.episode.audio_url,
          duration_seconds: result.episode.duration_seconds ?? null,
        },
        { onConflict: "particle_episode_id" },
      )
      .select("id")
      .single();
    if (epErr || !episodeRow) {
      console.error(
        `pipeline: episode upsert failed for ${result.episode.id}:`,
        epErr?.message ?? "no row",
      );
      continue;
    }
    out.episodesPersisted += 1;
    const episodeUuid = episodeRow.id as string;

    // 7b. Segment rows — one per extracted moment, keyed on
    //     particle_segment_id (the UNIQUE upsert column). Mentions mode
    //     reuses Claude's anchor-derived ID; list-episodes synthesizes
    //     `${episode}:${start}-${end}` since no Particle segment exists.
    const segmentRows = result.extraction.moments.map((moment) => {
      const anchor = result.anchors.find((a) => a.segment.id === moment.particle_segment_id);
      const rawTranscript = buildMomentTranscript(result.transcript!, moment);
      const segmentId =
        discoveryMode === "list-episodes"
          ? `${result.episode.id}:${moment.start_seconds}-${moment.end_seconds}`
          : moment.particle_segment_id;
      return {
        episode_id: episodeUuid,
        particle_segment_id: segmentId,
        start_seconds: moment.start_seconds,
        end_seconds: moment.end_seconds,
        audio_url: anchor?.segment.audio_url ?? null,
        match_source: anchor?.matchSource ?? "entity",
        raw_transcript: rawTranscript,
        summary: moment.summary,
        pull_quotes: [...moment.pull_quotes],
        bullets: [...moment.bullets],
        surfacing_entities: [...moment.surfacing_entities],
        // U5: tag every persisted row with the prompt version that
        // produced it. Future prompt bumps re-process on the next run.
        prompt_version: EPISODE_EXTRACTION_PROMPT_VERSION,
      };
    });
    const { error: segErr, count: segCount } = await deps.supabase
      .from("segments")
      .upsert(segmentRows, { onConflict: "particle_segment_id", count: "exact" });
    if (segErr) {
      console.error(`pipeline: segments upsert failed for ${result.episode.id}:`, segErr.message);
      continue;
    }
    out.segmentsPersisted += segCount ?? segmentRows.length;

    // 7c. Card row — uses the extractor's episode_rollup directly.
    const totalRelevantSeconds = result.extraction.moments.reduce(
      (sum, m) => sum + Math.max(0, m.end_seconds - m.start_seconds),
      0,
    );
    const { error: cardErr } = await deps.supabase
      .from("cards")
      .upsert(
        {
          user_id: deps.userId,
          team_id: input.teamId,
          episode_id: episodeUuid,
          surfaced_at: new Date().toISOString(),
          total_relevant_seconds: totalRelevantSeconds,
          episode_summary: result.extraction.episode_rollup || null,
        },
        { onConflict: "user_id,team_id,episode_id" },
      );
    if (cardErr) {
      console.error(`pipeline: card upsert failed for ${result.episode.id}:`, cardErr.message);
      continue;
    }
    out.cardsPersisted += 1;
  }

  return out;
}

/**
 * Best-effort fetch of ad timecodes for an episode. On any failure (404,
 * transient, schema), returns an empty array so the pipeline proceeds with
 * an unstripped transcript — ad-stripping is opportunistic, never required.
 */
async function fetchEpisodeAds(
  particle: PipelineDeps["particle"],
  episodeId: string,
): Promise<readonly ParticleEpisodeAd[]> {
  try {
    const response = await particle.listEpisodeAds(episodeId);
    return response.data;
  } catch (err) {
    console.warn(
      `pipeline: listEpisodeAds failed for episode ${episodeId} (continuing without ad-stripping):`,
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/**
 * Drop transcript lines whose time range overlaps any ad window.
 * Convention: a line is stripped if any overlap exists (even partial).
 * Same stripped array flows to Claude AND to `buildMomentTranscript`
 * downstream so pull-quote validation stays aligned.
 */
function stripAdWindows(
  lines: readonly ParticleTranscriptLine[],
  ads: readonly ParticleEpisodeAd[],
): readonly ParticleTranscriptLine[] {
  if (ads.length === 0) return lines;
  return lines.filter((line) => !ads.some((ad) => overlaps(line, ad)));
}

function overlaps(
  line: ParticleTranscriptLine,
  ad: ParticleEpisodeAd,
): boolean {
  return line.start_seconds <= ad.end_seconds && line.end_seconds >= ad.start_seconds;
}

/**
 * Slice the episode transcript to the lines that fall within a moment's
 * time range. Stored as `segments.raw_transcript` so the existing inspect
 * tools, audio-clip player, and downstream UI keep working unchanged.
 */
function buildMomentTranscript(
  lines: readonly ParticleTranscriptLine[],
  moment: EpisodeMoment,
): string {
  // Allow a small slop on each side to capture the lines that overlap
  // the moment boundary — the model rounds start down and end up but
  // transcript lines are speech-rate-variable.
  const TOLERANCE = 2;
  return lines
    .filter(
      (l) =>
        l.end_seconds >= moment.start_seconds - TOLERANCE &&
        l.start_seconds <= moment.end_seconds + TOLERANCE,
    )
    .map((l) => l.text)
    .join(" ")
    .trim();
}

interface LoadedTeam {
  name: string;
  sport: string;
  entities: readonly string[];
  storylines: readonly string[];
  entityIdMap: Record<string, string>;
}

async function loadTeamContext(deps: PipelineDeps, teamId: string): Promise<LoadedTeam> {
  const { data: team, error: teamErr } = await deps.supabase
    .from("teams")
    .select("id, name, sport, universe_id")
    .eq("id", teamId)
    .single();
  if (teamErr || !team) {
    throw new Error(`pipeline: team ${teamId} not found: ${teamErr?.message ?? "no row"}`);
  }
  const { data: universe, error: uniErr } = await deps.supabase
    .from("universes")
    .select("entities, storylines, entity_id_map")
    .eq("id", team.universe_id)
    .single();
  if (uniErr || !universe) {
    throw new Error(`pipeline: universe for team ${teamId} not found: ${uniErr?.message ?? "no row"}`);
  }
  return {
    name: team.name as string,
    sport: team.sport as string,
    entities: universe.entities as readonly string[],
    storylines: universe.storylines as readonly string[],
    entityIdMap: (universe.entity_id_map as Record<string, string>) ?? {},
  } satisfies LoadedTeam & TeamContext;
}

function normaliseFromMention(m: ParticleMentionResult): NormalisedSegment[] {
  // Mentions return windows nested under each result, each with a segment id.
  return (m.windows ?? []).flatMap((w) => {
    if (!w.segment) return [];
    return [
      {
        episodeId: m.episode.id,
        episode: m.episode,
        segment: {
          id: w.segment.id,
          type: w.segment.type,
          title: w.segment.title,
          start_seconds: w.start_seconds,
          end_seconds: w.end_seconds,
        },
        matchSource: "entity",
        surfacingEntities: m.mention_variants ?? [],
      } satisfies NormalisedSegment,
    ];
  });
}

/**
 * List-episodes discovery: convert each `ParticleEpisode` into a single
 * synthetic NormalisedSegment covering the full episode window. The
 * actual per-moment time bounds are refined later by the extractor.
 */
function normaliseFromListEpisode(ep: ParticleEpisode): NormalisedSegment[] {
  const endSeconds = ep.duration_seconds ?? 0;
  return [
    {
      episodeId: ep.id,
      episode: ep,
      segment: {
        id: `${ep.id}:0-${endSeconds}`,
        start_seconds: 0,
        end_seconds: endSeconds,
      },
      matchSource: "entity",
      surfacingEntities: [],
    } satisfies NormalisedSegment,
  ];
}

function normaliseFromSearch(s: ParticleSearchResult): NormalisedSegment[] {
  return [
    {
      episodeId: s.episode.id,
      episode: s.episode,
      segment: s.segment,
      matchSource:
        s.match?.source === "keyword"
          ? "keyword"
          : s.match?.source === "entity"
          ? "entity"
          : "semantic",
      surfacingEntities: [],
    },
  ];
}

function dedupeSegments(items: NormalisedSegment[]): NormalisedSegment[] {
  const seen = new Map<string, NormalisedSegment>();
  for (const item of items) {
    const key = `${item.episodeId}::${item.segment.id}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

async function filterAlreadyPersisted(
  supabase: PipelineDeps["supabase"],
  items: NormalisedSegment[],
): Promise<NormalisedSegment[]> {
  if (items.length === 0) return items;
  const segmentIds = items.map((i) => i.segment.id);
  const { data: existing, error } = await supabase
    .from("segments")
    .select("particle_segment_id, prompt_version")
    .in("particle_segment_id", segmentIds);
  if (error) {
    console.error(`pipeline: cross-run dedupe lookup failed: ${error.message}`);
    return items;
  }
  // U5: a row counts as "already persisted" only if its prompt_version
  // matches the current extraction prompt. Mismatched versions flow back
  // through extraction so prompt iterations don't require a manual
  // `?force=1` ceremony. Backfilled "legacy" rows from migration 0014
  // count as mismatches and get re-processed on the first post-U5 run.
  const rows = existing ?? [];
  const persistedAtCurrentVersion = new Set(
    rows
      .filter((row) => row.prompt_version === EPISODE_EXTRACTION_PROMPT_VERSION)
      .map((row) => row.particle_segment_id),
  );
  const versionMismatchCount = rows.length - persistedAtCurrentVersion.size;
  if (versionMismatchCount > 0) {
    console.log(
      `pipeline: re-extracting ${versionMismatchCount} segment(s) whose stored prompt_version ≠ "${EPISODE_EXTRACTION_PROMPT_VERSION}" (expected after a prompt bump; one-time cost).`,
    );
  }
  return items.filter((i) => !persistedAtCurrentVersion.has(i.segment.id));
}

/**
 * Bounded-concurrency map over an array. Used for per-segment transcript
 * fetch + summarize so wall time stays within the route's max-duration
 * budget without flooding upstream rate limits.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveLocalPodcastId(
  supabase: PipelineDeps["supabase"],
  particlePodcastId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("podcasts")
    .select("id")
    .eq("particle_id", particlePodcastId)
    .maybeSingle();
  if (error || !data) {
    console.warn(
      `pipeline: no local podcasts row for particle_id=${particlePodcastId}; episode upsert may fail FK`,
    );
    return null;
  }
  return data.id as string;
}
