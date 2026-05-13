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
  ParticleMentionResult,
  ParticleEpisodeTranscript,
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
const EPISODE_CONCURRENCY = 5;

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
  };

  // 1. Load the team's universe (slugs + IDs cached at seed time).
  const team = await loadTeamContext(deps, input.teamId);

  // 2. Fan-out Particle queries.
  const entityIds = Object.values(team.entityIdMap);
  const since = input.sinceTimestamp;
  const until = input.untilTimestamp;

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
  const normalised = dedupeSegments([
    ...entityResults.flatMap((m) => normaliseFromMention(m)),
    ...semanticResults.flatMap((s) => normaliseFromSearch(s)),
  ]);

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
    transcript: ParticleTranscriptLine[] | null;
  };

  const episodeKeys = [...byEpisode.keys()];
  const episodeResults = await mapWithConcurrency(
    episodeKeys,
    EPISODE_CONCURRENCY,
    async (epId): Promise<EpisodeResult> => {
      const bucket = byEpisode.get(epId)!;
      out.particleCallsAttempted += 1;
      let transcript: ParticleEpisodeTranscript;
      try {
        // No start/end → full episode transcript. Same endpoint, same
        // $0.008/call as the per-segment fetches U4 replaced.
        transcript = await deps.particle.getClipTranscript({ episodeId: epId });
      } catch (err) {
        console.error(
          `pipeline: transcript fetch failed for episode ${epId}:`,
          err instanceof Error ? err.message : String(err),
        );
        return { episodeId: epId, episode: bucket.episode, anchors: bucket.anchors, extraction: null, transcript: null };
      }
      if (transcript.lines.length === 0) {
        return { episodeId: epId, episode: bucket.episode, anchors: bucket.anchors, extraction: null, transcript: null };
      }

      const transcriptLines: TranscriptLine[] = transcript.lines.map((l) => ({
        start_seconds: l.start_seconds,
        end_seconds: l.end_seconds,
        speaker: l.speaker,
        text: l.text,
      }));
      const anchors: MentionAnchor[] = bucket.anchors.map((a) => ({
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
        transcript: transcript.lines,
      };
    },
  );

  // 7. Persist per episode.
  for (const result of episodeResults) {
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

    // 7b. Segment rows — one per extracted moment, mapped via particle_segment_id.
    const segmentRows = result.extraction.moments.map((moment) => {
      const anchor = result.anchors.find((a) => a.segment.id === moment.particle_segment_id);
      const rawTranscript = buildMomentTranscript(result.transcript!, moment);
      return {
        episode_id: episodeUuid,
        particle_segment_id: moment.particle_segment_id,
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
  const persistedAtCurrentVersion = new Set(
    (existing ?? [])
      .filter((row) => row.prompt_version === EPISODE_EXTRACTION_PROMPT_VERSION)
      .map((row) => row.particle_segment_id),
  );
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
