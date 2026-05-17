/**
 * Voice memory type surface.
 *
 * Voice memory is the append-only history of what each curated voice
 * (Mina Kimes Show, Bill Simmons Podcast, etc.) has argued about
 * each (team, topic) in past episodes. The novelty gate compares a
 * new take against this history to decide whether to surface or
 * suppress.
 */

/** Stable identifier for a voice. Mirrors `voices.id` in DB. */
export type VoiceId = string;

/** Show-level (one voice per podcast) or host-level (one voice per
 *  individual). v1 ships show-level only. */
export type VoiceKind = "host" | "show";

/** A single recorded position of a voice on a (team, topic) pair. */
export interface VoicePosition {
  /** Row id. */
  id: string;
  /** Voice that made the position. */
  voice_id: VoiceId;
  /** Team the position is about. */
  team_id: string;
  /** Stable slug for the topic, derived deterministically at write
   *  time. Examples: "purdy-contract", "wr-room", "schedule-travel". */
  topic_key: string;
  /** 1-2 sentences capturing what the voice argued. */
  position_summary: string;
  /** Optional verbatim quote from the source transcript. */
  evidence_quote: string | null;
  /** Segment that produced this position. */
  segment_id: string | null;
  /** Prompt version that emitted this position. Used so prompt
   *  iterations auto-trigger re-processing. */
  prompt_version: string;
  /** ISO timestamp. */
  created_at: string;
}

/**
 * Classification produced by the novelty gate when comparing a new
 * take against a voice's prior positions on the same topic.
 *
 * - `new_voice`: voice has no prior positions on this topic → surface.
 * - `restate`: position substantially matches a prior position → suppress.
 * - `position_shift`: position contradicts or notably revises a prior
 *   position → surface, with a "shift" annotation on the card.
 */
export type ShiftKind = "new_voice" | "restate" | "position_shift";
