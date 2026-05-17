/**
 * Stage 2 orchestrator — load the day's moments, cluster them via
 * Claude, compute signatures + manufactured-aggregation tags, persist
 * theme rows.
 *
 * Called once per (user, team) per pipeline run, AFTER Stage 1
 * (extract-episode-moments) has finished persisting segments + voice
 * positions. Runs within the same 240s pipeline deadline as Stage 1.
 */

import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnthropicClient } from "../anthropic/client.ts";
import { clusterThemes } from "../anthropic/cluster-themes.ts";
import { loadTeamBrain } from "../team-brain/load.ts";
import { extractTopicKey } from "../voice-memory/extract-topic-key.ts";

import { detectManufactured, liteFromMoment } from "./detect-manufactured.ts";
import { evaluateThemeNovelty } from "./novelty-gate.ts";
import {
  THEME_CLUSTERING_PROMPT_VERSION,
  type MomentForClustering,
  type ThemeCandidate,
} from "./types.ts";

export interface ClusterMomentsInput {
  userId: string;
  teamId: string;
  teamName: string;
  /** ISO timestamp lower bound (inclusive). Typically `surfaced_at - 24h`. */
  sinceTimestamp: string;
  /** ISO timestamp upper bound (exclusive). Typically the run start. */
  untilTimestamp: string;
}

export interface ClusterMomentsOutput {
  /** Moments fed into the clustering call. */
  momentsConsidered: number;
  /** Themes the model produced. */
  themesProduced: number;
  /** Themes the novelty gate suppressed (recurring without movement). */
  themesSuppressedByNovelty: number;
  /** Themes that landed as new rows (excluding cross-day duplicates that
   *  hit the per-day UNIQUE constraint and silently dropped). */
  themesPersisted: number;
  /** Themes tagged as manufactured news-echo. */
  newsEchoTagged: number;
}

/**
 * Run Stage 2 for a given user/team/window.
 *
 * - Reads moments from `segments` joined with `episodes` and `podcasts`
 *   so the clustering input carries voice_id, match_source,
 *   published_at, and surfacing_entities without N+1 lookups.
 * - Calls `clusterThemes` once (single Anthropic call, cacheable
 *   prefix).
 * - Computes per-theme signature (stable content hash) and applies
 *   the manufactured-aggregation tag.
 * - Persists themes via upsert; the per-day UNIQUE constraint silently
 *   absorbs same-theme-same-day re-runs.
 *
 * Returns counters for the run logs; doesn't throw on a null
 * clustering response (treats it as "no themes this run" and the
 * outer pipeline continues).
 */
export async function clusterMomentsForRun(
  supabase: SupabaseClient,
  anthropic: AnthropicClient,
  input: ClusterMomentsInput,
): Promise<ClusterMomentsOutput> {
  const out: ClusterMomentsOutput = {
    momentsConsidered: 0,
    themesProduced: 0,
    themesSuppressedByNovelty: 0,
    themesPersisted: 0,
    newsEchoTagged: 0,
  };

  const moments = await loadMomentsForWindow(supabase, input);
  out.momentsConsidered = moments.length;
  if (moments.length === 0) return out;

  const rawThemes = await clusterThemes(anthropic, {
    team_id: input.teamId,
    team_name: input.teamName,
    date_label: input.untilTimestamp.slice(0, 10),
    moments,
  });
  if (rawThemes === null) {
    console.warn("clusterMomentsForRun: clustering returned null; no themes this run");
    return out;
  }
  out.themesProduced = rawThemes.length;

  // Load team brain + voice display-names once for the novelty gate.
  // Brain is the cacheable system prefix; display-names render
  // signal detail copy on the card.
  const teamBrain = await loadTeamBrain(supabase, input.teamId);
  if (!teamBrain) {
    console.warn(
      `clusterMomentsForRun: no team brain for ${input.teamId} — surfacing all themes without novelty gating`,
    );
  }
  const voiceDisplayNames = await loadVoiceDisplayNames(supabase);

  const candidates: ThemeCandidate[] = rawThemes.map((raw) => {
    const members = moments.filter((m) => raw.member_segment_ids.includes(m.segment_id));
    const distinctVoiceIds = uniqueNonNull(members.map((m) => m.voice_id));
    const newsEcho = detectManufactured(members.map(liteFromMoment));
    if (newsEcho) out.newsEchoTagged += 1;
    return {
      label: raw.label,
      member_segment_ids: raw.member_segment_ids,
      surfacing_entities: raw.surfacing_entities,
      member_voice_ids: distinctVoiceIds,
      news_echo: newsEcho,
      theme_signature: computeThemeSignature(
        raw.member_segment_ids,
        raw.surfacing_entities,
        members,
      ),
    };
  });

  // Novelty gate: filter candidates to those representing actual
  // movement. Skipped entirely if the team brain isn't seeded —
  // surfacing all themes is the safer fallback than crashing.
  const gatedCandidates: ThemeCandidate[] = [];
  for (const candidate of candidates) {
    if (!teamBrain) {
      gatedCandidates.push(candidate);
      continue;
    }
    try {
      const decision = await evaluateThemeNovelty(
        { supabase, anthropic, teamBrain },
        {
          teamId: input.teamId,
          now: input.untilTimestamp,
          theme: candidate,
          members: moments,
          voiceDisplayNames,
        },
      );
      if (decision.surface) {
        gatedCandidates.push(candidate);
      } else {
        out.themesSuppressedByNovelty += 1;
        console.log(
          `clusterMomentsForRun: novelty gate suppressed "${candidate.label}" — ${decision.rationale}`,
        );
      }
    } catch (err) {
      console.warn(
        `clusterMomentsForRun: novelty gate error on "${candidate.label}" (surfacing as fail-safe):`,
        err instanceof Error ? err.message : String(err),
      );
      gatedCandidates.push(candidate);
    }
  }

  // Persist. Use ignoreDuplicates so the per-day UNIQUE constraint
  // absorbs same-theme-same-day re-runs cleanly (re-clustering an
  // already-surfaced day is a no-op rather than an error).
  for (const c of gatedCandidates) {
    const { error } = await supabase.from("themes").upsert(
      {
        user_id: input.userId,
        team_id: input.teamId,
        theme_signature: c.theme_signature,
        label: c.label,
        member_segment_ids: c.member_segment_ids,
        member_voice_ids: c.member_voice_ids,
        surfacing_entities: c.surfacing_entities,
        news_echo: c.news_echo,
        prompt_version: THEME_CLUSTERING_PROMPT_VERSION,
        surfaced_at: input.untilTimestamp,
      },
      // The unique index is on (user_id, team_id, theme_signature,
      // date(surfaced_at)). Supabase's onConflict needs a column
      // list — pass the column names; the partial-index match is
      // server-side.
      { onConflict: "user_id,team_id,theme_signature", ignoreDuplicates: true },
    );
    if (error) {
      console.warn(
        `clusterMomentsForRun: theme upsert failed for "${c.label}": ${error.message}`,
      );
      continue;
    }
    out.themesPersisted += 1;
  }

  return out;
}

/**
 * Pull all moments persisted in the window with the metadata clustering
 * needs. Joins through episodes → podcasts → voices so the input
 * carries voice_id (when Tier-A) inline.
 */
async function loadMomentsForWindow(
  supabase: SupabaseClient,
  input: ClusterMomentsInput,
): Promise<MomentForClustering[]> {
  const { data, error } = await supabase
    .from("segments")
    .select(
      `
      id,
      summary,
      pull_quotes,
      surfacing_entities,
      match_source,
      episodes!inner(
        id,
        published_at,
        podcasts!inner(
          id,
          tier
        )
      )
    `,
    )
    .gte("episodes.published_at", input.sinceTimestamp)
    .lt("episodes.published_at", input.untilTimestamp);
  if (error) {
    throw new Error(`loadMomentsForWindow failed: ${error.message}`);
  }

  // Second hop: build a podcast_id → voice_id map for Tier-A shows.
  const { data: voiceRows, error: vErr } = await supabase
    .from("voices")
    .select("id, podcast_id")
    .eq("tier", "A")
    .eq("kind", "show");
  if (vErr) {
    throw new Error(`loadMomentsForWindow voices read failed: ${vErr.message}`);
  }
  const voiceByPodcast = new Map<string, string>();
  for (const v of voiceRows ?? []) {
    if (v.podcast_id) voiceByPodcast.set(v.podcast_id as string, v.id as string);
  }

  return (data ?? []).map((row) => {
    const episode = row.episodes as unknown as {
      published_at: string;
      podcasts: { id: string };
    };
    const surfacingEntities = (row.surfacing_entities as string[] | null) ?? [];
    const pullQuotes = (row.pull_quotes as string[] | null) ?? [];
    return {
      segment_id: row.id as string,
      voice_id: voiceByPodcast.get(episode.podcasts.id) ?? null,
      topic_key: extractTopicKey(surfacingEntities),
      summary: (row.summary as string | null) ?? "",
      surfacing_entities: surfacingEntities,
      match_source: (row.match_source as string | null) ?? null,
      episode_published_at: episode.published_at,
      pull_quote: pullQuotes[0] ?? null,
    } satisfies MomentForClustering;
  });
}

/**
 * Deterministic content hash for a theme — same cluster on a different
 * day produces the same signature, which is the novelty gate's
 * cross-day dedupe key.
 *
 * Hash inputs are intentionally limited to *stable* signal: the
 * topic_keys of member moments (not segment_ids, which vary per
 * episode), plus the dominant surfacing entity (sluggified). Same
 * conversation across days → same topic_keys for its members → same
 * signature.
 */
export function computeThemeSignature(
  _memberSegmentIds: readonly string[],
  surfacingEntities: readonly string[],
  members: readonly MomentForClustering[],
): string {
  const topicKeys = [...new Set(members.map((m) => m.topic_key))].sort();
  const dominantEntity = (surfacingEntities[0] ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const seed = `${dominantEntity}::${topicKeys.join(",")}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function uniqueNonNull<T>(values: readonly (T | null)[]): T[] {
  const out = new Set<T>();
  for (const v of values) if (v != null) out.add(v);
  return [...out];
}

/**
 * Load a (voice_id → display_name) map for all voices in the catalog.
 * Used by the novelty gate to render signal detail copy.
 */
async function loadVoiceDisplayNames(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("voices")
    .select("id, display_name");
  if (error) {
    console.warn(`loadVoiceDisplayNames failed (using ids as labels): ${error.message}`);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id as string, (row.display_name as string) ?? (row.id as string));
  }
  return map;
}
