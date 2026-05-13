/**
 * Daily ingest pipeline (Node runtime).
 *
 * Per shard, this function: reads the team's universe and the shard's
 * podcasts → fans out parallel Particle queries (entity-mention search,
 * semantic content search) → dedupes the segment results → fetches a
 * transcript per new segment → summarizes via Claude Haiku → persists
 * episodes/segments/cards in per-episode batches.
 *
 * Idempotency is enforced at the schema level — `segments.particle_segment_id`
 * carries a UNIQUE constraint and `cards (user_id, team_id, episode_id)` is
 * unique — so the conflict-do-nothing semantics here mean re-running the
 * same window produces zero new rows the second time.
 *
 * The Deno mirror at `supabase/functions/daily-digest/_pipeline-deno.ts`
 * is logically identical — same input/output, same DB shape — and runs
 * inside the scheduled Edge Function. Both consume `IngestPipelineInput`
 * from `./types.ts`.
 */

import "server-only";

import type {
  ParticleSearchResult,
  ParticleSegment,
  ParticleEpisode,
  ParticleMentionResult,
  ParticleEpisodeTranscript,
} from "@/lib/particle/types";
import { paginateAll } from "@/lib/particle/client";
import { summarizeEpisode } from "@/lib/anthropic/summarize-episode";
import { summarizeSegment } from "@/lib/anthropic/summarize";
import type { SegmentSummary, TeamContext } from "@/lib/anthropic/types";

import type {
  IngestPipelineInput,
  IngestPipelineOutput,
  PipelineDeps,
} from "./types";

const PARTICLE_PAGE_LIMIT = 25;
const PARTICLE_MAX_PAGES = 4;
const SEGMENT_CONCURRENCY = 5;

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

  // 5. For each fresh segment, fetch transcript + summarize. Bounded
  //    concurrency so the wall time stays well inside the Vercel 300s
  //    budget at full catalog (31 podcasts) — at concurrency=5 a typical
  //    daily run of ~150 candidate segments completes in ~150s with
  //    headroom. Higher concurrency would risk Anthropic rate-limit
  //    bursts; lower would leave money on the table.
  type SegmentResult = {
    item: NormalisedSegment;
    summary: SegmentSummary | null;
    transcript: string | null;
  };
  const segmentResults = await mapWithConcurrency(fresh, SEGMENT_CONCURRENCY, async (item) => {
    out.particleCallsAttempted += 1;
    let transcript: ParticleEpisodeTranscript;
    try {
      transcript = await deps.particle.getClipTranscript({
        episodeId: item.episodeId,
        start: Math.floor(item.segment.start_seconds),
        end: Math.ceil(item.segment.end_seconds),
      });
    } catch (err) {
      console.error(
        `pipeline: transcript fetch failed for segment ${item.segment.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      return { item, summary: null, transcript: null } satisfies SegmentResult;
    }
    const transcriptText = transcript.lines.map((line) => line.text).join(" ").trim();
    if (!transcriptText) {
      return { item, summary: null, transcript: null } satisfies SegmentResult;
    }

    out.anthropicCallsAttempted += 1;
    const summary = await summarizeSegment(deps.anthropic, {
      team: { name: team.name, sport: team.sport, entities: team.entities, storylines: team.storylines },
      podcast: { name: item.episode.podcast.title, kind: "national" },
      episode: { title: item.episode.title, published_at: item.episode.published_at },
      segment: {
        title: item.segment.title,
        description: item.segment.description,
        transcript: transcriptText,
      },
    });

    return { item, summary, transcript: transcriptText } satisfies SegmentResult;
  });

  const byEpisode = new Map<string, {
    episode: ParticleEpisode;
    segments: Array<{ raw: NormalisedSegment; summary: SegmentSummary; transcript: string }>;
  }>();
  for (const result of segmentResults) {
    if (result.summary === null) {
      out.segmentsRejectedOffTopic += 1;
      continue;
    }
    if (result.transcript === null) {
      // Transcript fetch failed; segment is dropped silently. Already
      // logged at the source.
      continue;
    }
    const bucket = byEpisode.get(result.item.episodeId) ?? {
      episode: result.item.episode,
      segments: [],
    };
    bucket.segments.push({ raw: result.item, summary: result.summary, transcript: result.transcript });
    byEpisode.set(result.item.episodeId, bucket);
  }

  // 6. Persist per episode (one logical transaction worth of writes).
  for (const [, group] of byEpisode) {
    if (group.segments.length === 0) continue;

    // 6a. Episode row — fetch or upsert.
    const { data: episodeRow, error: epErr } = await deps.supabase
      .from("episodes")
      .upsert(
        {
          podcast_id: await resolveLocalPodcastId(deps.supabase, group.episode.podcast.id),
          particle_episode_id: group.episode.id,
          title: group.episode.title,
          published_at: group.episode.published_at,
          audio_url: group.episode.audio_url,
        },
        { onConflict: "particle_episode_id" },
      )
      .select("id")
      .single();
    if (epErr || !episodeRow) {
      console.error(
        `pipeline: episode upsert failed for ${group.episode.id}:`,
        epErr?.message ?? "no row",
      );
      continue;
    }
    out.episodesPersisted += 1;
    const episodeUuid = episodeRow.id as string;

    // 6b. Segment rows — bulk upsert (one row per fresh segment).
    const segmentRows = group.segments.map(({ raw, summary, transcript }) => ({
      episode_id: episodeUuid,
      particle_segment_id: raw.segment.id,
      start_seconds: Math.floor(raw.segment.start_seconds),
      end_seconds: Math.ceil(raw.segment.end_seconds),
      audio_url: raw.segment.audio_url,
      match_source: raw.matchSource,
      raw_transcript: transcript,
      summary: summary?.summary ?? null,
      pull_quotes: summary?.pullQuotes ?? null,
      bullets: summary?.bullets ?? null,
      surfacing_entities: summary?.surfacingEntities ?? raw.surfacingEntities,
    }));
    const { error: segErr, count: segCount } = await deps.supabase
      .from("segments")
      .upsert(segmentRows, { onConflict: "particle_segment_id", count: "exact" });
    if (segErr) {
      console.error(`pipeline: segments upsert failed for ${group.episode.id}:`, segErr.message);
      continue;
    }
    out.segmentsPersisted += segCount ?? segmentRows.length;

    // 6c. Episode-level rollup → card row.
    const summaries = group.segments.filter((s) => s.summary !== null);
    if (summaries.length === 0) continue;

    out.anthropicCallsAttempted += 1;
    const rollup = await summarizeEpisode(deps.anthropic, {
      team: { name: team.name, sport: team.sport, entities: team.entities, storylines: team.storylines },
      podcast: { name: group.episode.podcast.title },
      episode: { title: group.episode.title },
      segmentSummaries: summaries.map((s) => ({
        title: s.raw.segment.title,
        summary: s.summary!.summary,
      })),
    });

    const totalRelevantSeconds = summaries.reduce(
      (sum, s) => sum + Math.ceil(s.raw.segment.end_seconds - s.raw.segment.start_seconds),
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
          episode_summary: rollup?.summary ?? null,
        },
        { onConflict: "user_id,team_id,episode_id" },
      );
    if (cardErr) {
      console.error(`pipeline: card upsert failed for ${group.episode.id}:`, cardErr.message);
      continue;
    }
    out.cardsPersisted += 1;
  }

  return out;
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
    .select("particle_segment_id")
    .in("particle_segment_id", segmentIds);
  if (error) {
    console.error(`pipeline: cross-run dedupe lookup failed: ${error.message}`);
    return items;
  }
  const persisted = new Set((existing ?? []).map((row) => row.particle_segment_id));
  return items.filter((i) => !persisted.has(i.segment.id));
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
