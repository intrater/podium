/**
 * Theme card shapes — produced by Stage 2 clustering, consumed by the
 * novelty gate (U6), card writer (U7), and surfacing (U8/U9).
 */

/** Current prompt-shape version for theme clustering. */
export const THEME_CLUSTERING_PROMPT_VERSION = "v1";

/**
 * One moment fed into the clustering call. The shape is what the
 * model needs to group + the metadata downstream stages (novelty gate,
 * card writer, manufactured-aggregation tag) need without re-querying.
 */
export interface MomentForClustering {
  /** segments.id — the persisted local id. */
  segment_id: string;
  /** Which voice produced this moment. May be a Tier-A voice id (host or
   *  show level) or null for Tier B/C podcasts that have no voice row. */
  voice_id: string | null;
  /** Slugified topic key (lib/voice-memory/extract-topic-key.ts). */
  topic_key: string;
  /** 1-2 sentence moment summary from extraction. */
  summary: string;
  /** Entities the moment surfaces. */
  surfacing_entities: readonly string[];
  /** segments.match_source — "keyword" / "semantic" / "entity". Drives
   *  the manufactured-aggregation heuristic. */
  match_source: string | null;
  /** Episode's published_at — proximity input for news_echo. */
  episode_published_at: string;
  /** Verbatim quote from the moment (first pull_quote, may be null). */
  pull_quote: string | null;
}

/**
 * The clustering call's per-theme output, before persistence. The
 * model groups moments and emits a human-readable label + the
 * member-segment list.
 */
export interface RawThemeCandidate {
  /** Short headline like "49ers schedule release reactions". */
  label: string;
  /** Segments grouped under this theme. */
  member_segment_ids: readonly string[];
  /** Entities common across cluster members. */
  surfacing_entities: readonly string[];
}

/**
 * A theme candidate after the orchestrator has computed signature +
 * voice membership + the news_echo tag. Ready to persist.
 */
export interface ThemeCandidate extends RawThemeCandidate {
  /** Deterministic content hash for cross-day dedupe. */
  theme_signature: string;
  /** Distinct voice ids represented in the cluster (excluding nulls). */
  member_voice_ids: readonly string[];
  /** Manufactured-aggregation tag (KD5). */
  news_echo: boolean;
}

/** Persisted theme row shape (mirrors `themes` table columns). */
export interface Theme {
  id: string;
  user_id: string;
  team_id: string;
  theme_signature: string;
  label: string;
  member_segment_ids: readonly string[];
  member_voice_ids: readonly string[];
  surfacing_entities: readonly string[];
  news_echo: boolean;
  prompt_version: string;
  surfaced_at: string;
}
