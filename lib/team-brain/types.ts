/**
 * Per-team brain payload shape.
 *
 * The brain is Podium's running model of a team — what a fan knows in
 * their bones, surfaced explicitly so it can ground voice and gate
 * novelty. Serialized to a stable text block via
 * `serialize-for-prompt.ts` and inlined as the cacheable system prefix
 * on every v2 Claude call.
 *
 * Fields are intentionally ordered. The serializer renders them in
 * declaration order so the cache prefix is byte-stable across runs;
 * never reorder or rename fields without bumping
 * TEAM_BRAIN_PROMPT_VERSION (which forces all dependents to
 * re-cache).
 */

/** Current prompt-shape version. Bump on any structural change. */
export const TEAM_BRAIN_PROMPT_VERSION = "v1";

/** A notable name + role on the roster. */
export interface RosterEntry {
  /** Display name as fans refer to them. */
  name: string;
  /** Position abbreviation (QB, WR, LT, CB, etc.) or coaching role. */
  role: string;
  /** Optional context — "veteran starter", "rookie", "free-agent signing", "injured 2025". */
  note?: string;
}

/** A long-running storyline that spans multiple weeks of discourse. */
export interface NarrativeArc {
  /** Short label fans would recognize, e.g., "Purdy contract", "WR room". */
  label: string;
  /** 1-3 sentence summary of the current state of this arc. */
  summary: string;
  /** Optional tone signal — `hot` if currently in the news, `simmering`
   *  if persistent background, `cold` if resolved/dormant. Helps the
   *  novelty gate weight recurring themes. */
  state?: "hot" | "simmering" | "cold";
}

/** A recent theme picked up by Podium itself, populated by the weekly
 *  brain update job. Empty at seed; grows over time. */
export interface RecentTheme {
  /** Internal theme signature for cross-day dedupe. */
  signature: string;
  /** Short human label. */
  label: string;
  /** ISO date when this theme first appeared. */
  first_seen: string;
  /** ISO date when this theme last appeared. */
  last_seen: string;
  /** Currently active in podcast discourse. */
  hot: boolean;
}

export interface TeamBrain {
  /** Team identifier — matches teams.id. */
  team_id: string;
  /** Display name fans use ("the 49ers", "the Niners"). */
  team_name: string;
  /** Sport context — for cross-sport disambiguation later. */
  sport: string;
  /** Where the team sits in the calendar right now — "offseason",
   *  "training camp", "regular season Week N", "playoffs". */
  season_context: string;
  /** 3-6 sentence narrative of the season-to-date. The story a fan
   *  would tell about how the year has gone. */
  season_storyline: string;
  /** Notable roster — not exhaustive, focused on the figures
   *  podcasts discuss. Order: stars first, then notable role
   *  players, then coaching staff. */
  roster: readonly RosterEntry[];
  /** Active narrative arcs. The recurring debates fans cycle through. */
  narrative_arcs: readonly NarrativeArc[];
  /** 3-5 bullets on what THIS fanbase obsesses over — the triggers,
   *  the long-standing grievances, the identity. Distinct from
   *  generic NFL fandom. */
  fan_psychology: readonly string[];
  /** Themes Podium has surfaced recently. Empty at seed. */
  recent_themes: readonly RecentTheme[];
  /** ISO timestamp of last update. NOT included in the serialized
   *  prompt prefix so the cache stays stable across days. */
  updated_at: string;
}
