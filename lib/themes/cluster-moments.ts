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
import {
  THEME_CARD_PROMPT_VERSION,
  writeThemeCard,
  type ThemeCardOutput,
} from "../anthropic/write-theme-card.ts";
import {
  NOTABLE_TAKE_CARD_PROMPT_VERSION,
  writeNotableTakeCard,
  type NotableTakeCardOutput,
} from "../anthropic/write-notable-take-card.ts";
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
  /** Theme cards written via writeThemeCard + persisted to cards table. */
  themeCardsWritten: number;
  /** Notable-take cards written + persisted to cards table. */
  notableTakeCardsWritten: number;
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
    themeCardsWritten: 0,
    notableTakeCardsWritten: 0,
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

  // Persist themes + write cards. For each gate-passed theme:
  //   1. Upsert the theme row (gives us the theme_id).
  //   2. Decide card_type:
  //        member_voice_ids.length === 1 AND voice is Tier-A → notable_take
  //        else                                              → theme
  //   3. Call the appropriate card writer (Anthropic).
  //   4. Persist a `cards` row with the structured card_body.
  //
  // Card-writer failures (transient or schema) return null; we log
  // and skip the cards row for that theme rather than crashing the
  // run. The theme row still lands so U8's surface layer can fall
  // back to a minimal display if needed.
  const tierAIds = await tierAVoiceIds(supabase);
  const tierAVoiceSet = new Set<string>(Object.keys(tierAIds));
  for (const c of gatedCandidates) {
    const themeId = await persistTheme(supabase, input, c);
    if (!themeId) continue;
    out.themesPersisted += 1;

    if (!teamBrain) continue; // can't write cards without brain context

    const isSoloTierA =
      c.member_voice_ids.length === 1 && tierAVoiceSet.has(c.member_voice_ids[0]);

    try {
      if (isSoloTierA) {
        const written = await writeAndPersistNotableTakeCard(
          supabase,
          anthropic,
          teamBrain,
          input,
          c,
          moments,
          voiceDisplayNames,
        );
        if (written) out.notableTakeCardsWritten += 1;
      } else {
        const written = await writeAndPersistThemeCard(
          supabase,
          anthropic,
          teamBrain,
          input,
          c,
          themeId,
          moments,
          voiceDisplayNames,
        );
        if (written) out.themeCardsWritten += 1;
      }
    } catch (err) {
      console.warn(
        `clusterMomentsForRun: card writer failed for "${c.label}" (theme persisted, no card):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return out;
}

/** Upsert a theme row, return its id (or null on failure). */
async function persistTheme(
  supabase: SupabaseClient,
  input: ClusterMomentsInput,
  c: ThemeCandidate,
): Promise<string | null> {
  // Two-step: try insert first; on conflict (theme + day exists), select
  // the existing row's id so the card-write path can still associate to
  // a theme row. The per-day partial unique index handles the conflict.
  const { data: inserted, error: insErr } = await supabase
    .from("themes")
    .upsert(
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
      { onConflict: "user_id,team_id,theme_signature", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (insErr) {
    console.warn(`persistTheme: insert failed for "${c.label}": ${insErr.message}`);
    return null;
  }
  if (inserted?.id) return inserted.id as string;

  // ignoreDuplicates returned no row — fetch the existing one.
  const utcDate = new Date(input.untilTimestamp).toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("themes")
    .select("id")
    .eq("user_id", input.userId)
    .eq("team_id", input.teamId)
    .eq("theme_signature", c.theme_signature)
    .gte("surfaced_at", `${utcDate}T00:00:00Z`)
    .lt("surfaced_at", `${utcDate}T23:59:59Z`)
    .maybeSingle();
  return (existing?.id as string) ?? null;
}

async function writeAndPersistThemeCard(
  supabase: SupabaseClient,
  anthropic: AnthropicClient,
  teamBrain: import("../team-brain/types.ts").TeamBrain,
  input: ClusterMomentsInput,
  candidate: ThemeCandidate,
  themeId: string,
  allMoments: readonly MomentForClustering[],
  voiceDisplayNames: Map<string, string>,
): Promise<boolean> {
  const members = candidate.member_voice_ids.map((vid) => {
    const memberMoments = allMoments.filter(
      (m) => m.voice_id === vid && candidate.member_segment_ids.includes(m.segment_id),
    );
    return {
      voice_id: vid,
      voice_display_name: voiceDisplayNames.get(vid) ?? vid,
      summary: memberMoments[0]?.summary ?? "",
      available_pull_quotes: memberMoments
        .map((m) => m.pull_quote)
        .filter((q): q is string => q !== null),
    };
  });

  const output: ThemeCardOutput | null = await writeThemeCard(anthropic, {
    teamBrain,
    theme_label: candidate.label,
    theme_surfacing_entities: candidate.surfacing_entities,
    members,
    novelty_rationale: null, // could thread from the gate decision; v1 keeps simple
  });
  if (!output) return false;

  // Pick a representative episode_id for the card (first member's
  // episode). For theme cards this is informational only — the audio
  // player picks the right segment by member_segment_ids[i].
  const firstMember = allMoments.find(
    (m) => candidate.member_segment_ids[0] === m.segment_id,
  );
  const representativeEpisodeId = await resolveEpisodeIdForSegment(
    supabase,
    firstMember?.segment_id ?? null,
  );

  const { error } = await supabase.from("cards").upsert(
    {
      user_id: input.userId,
      team_id: input.teamId,
      episode_id: representativeEpisodeId,
      card_type: "theme",
      theme_id: themeId,
      surfaced_at: input.untilTimestamp,
      card_title: output.title,
      card_body: output,
      prompt_version: THEME_CARD_PROMPT_VERSION,
      total_relevant_seconds: null,
      episode_summary: null,
    },
    {
      onConflict: "user_id,team_id,theme_id",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    console.warn(`writeAndPersistThemeCard: upsert failed: ${error.message}`);
    return false;
  }
  return true;
}

async function writeAndPersistNotableTakeCard(
  supabase: SupabaseClient,
  anthropic: AnthropicClient,
  teamBrain: import("../team-brain/types.ts").TeamBrain,
  input: ClusterMomentsInput,
  candidate: ThemeCandidate,
  allMoments: readonly MomentForClustering[],
  voiceDisplayNames: Map<string, string>,
): Promise<boolean> {
  const voiceId = candidate.member_voice_ids[0];
  const memberMoment = allMoments.find(
    (m) => m.voice_id === voiceId && candidate.member_segment_ids.includes(m.segment_id),
  );
  if (!memberMoment) return false;

  const output: NotableTakeCardOutput | null = await writeNotableTakeCard(anthropic, {
    teamBrain,
    voice_display_name: voiceDisplayNames.get(voiceId) ?? voiceId,
    summary: memberMoment.summary,
    available_pull_quotes: memberMoment.pull_quote ? [memberMoment.pull_quote] : [],
    novelty_rationale: null,
  });
  if (!output) return false;

  const episodeId = await resolveEpisodeIdForSegment(supabase, memberMoment.segment_id);
  if (!episodeId) return false;

  const { error } = await supabase.from("cards").upsert(
    {
      user_id: input.userId,
      team_id: input.teamId,
      episode_id: episodeId,
      card_type: "notable_take",
      notable_take_voice_id: voiceId,
      surfaced_at: input.untilTimestamp,
      card_title: output.title,
      card_body: output,
      prompt_version: NOTABLE_TAKE_CARD_PROMPT_VERSION,
      total_relevant_seconds: null,
      episode_summary: null,
    },
    {
      onConflict: "user_id,team_id,notable_take_voice_id,episode_id",
      ignoreDuplicates: true,
    },
  );
  if (error) {
    console.warn(`writeAndPersistNotableTakeCard: upsert failed: ${error.message}`);
    return false;
  }
  return true;
}

async function resolveEpisodeIdForSegment(
  supabase: SupabaseClient,
  segmentId: string | null,
): Promise<string | null> {
  if (!segmentId) return null;
  const { data } = await supabase
    .from("segments")
    .select("episode_id")
    .eq("id", segmentId)
    .maybeSingle();
  return (data?.episode_id as string) ?? null;
}

/** Cached lookup for Tier-A voice ids; one DB query per run. */
async function tierAVoiceIds(supabase: SupabaseClient): Promise<Record<string, true>> {
  const { data } = await supabase.from("voices").select("id").eq("tier", "A");
  const out: Record<string, true> = {};
  for (const row of data ?? []) out[row.id as string] = true;
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
