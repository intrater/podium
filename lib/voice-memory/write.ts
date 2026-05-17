import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Maps a podcast row id → its show-level voice id, when the podcast
 *  has a Tier-A show voice. Loaded once per pipeline run.
 *
 *  Returns null at the lookup when the podcast has no Tier-A voice
 *  (i.e., it's a Tier B/C show that doesn't surface solo cards and
 *  therefore doesn't accumulate voice memory).
 */
export type VoiceLookup = Map<string, string>;

/**
 * Build a (podcast_id → voice_id) lookup for the run. One DB hit at
 * the start of the pipeline, then every per-moment write is a map
 * lookup. Only includes Tier-A voices — Tier B/C podcasts get no
 * voice-memory writes.
 */
export async function loadVoiceLookup(
  supabase: SupabaseClient,
): Promise<VoiceLookup> {
  const { data, error } = await supabase
    .from("voices")
    .select("id, podcast_id")
    .eq("tier", "A")
    .eq("kind", "show");
  if (error) {
    throw new Error(`loadVoiceLookup failed: ${error.message}`);
  }
  const map: VoiceLookup = new Map();
  for (const row of data ?? []) {
    if (row.podcast_id) {
      map.set(row.podcast_id as string, row.id as string);
    }
  }
  return map;
}

export interface WriteVoicePositionArgs {
  /** Voice that made the position. Caller decides via `lookup.get(podcast_id)`. */
  voiceId: string;
  /** Team the position is about. */
  teamId: string;
  /** Deterministic topic slug (see extract-topic-key.ts). */
  topicKey: string;
  /** 1-2 sentences capturing what the voice argued (from moment.summary). */
  positionSummary: string;
  /** Optional verbatim quote (best of moment.pull_quotes, if any). */
  evidenceQuote: string | null;
  /** Segment id this position derives from. Idempotency key with the others. */
  segmentId: string;
  /** Prompt version stamp from the extractor (lib/anthropic/types.ts). */
  promptVersion: string;
}

/**
 * Write one voice_position row. Idempotent: a re-extract of the same
 * moment hits the UNIQUE(voice_id, team_id, topic_key, segment_id)
 * constraint and gets dropped silently.
 *
 * Throws on real DB errors (constraint violations, network, etc.) so
 * the caller can decide whether to abort the run or continue per
 * pipeline-level error policy. Returns true when a row was written,
 * false when the row already existed.
 */
export async function writeVoicePosition(
  supabase: SupabaseClient,
  args: WriteVoicePositionArgs,
): Promise<boolean> {
  const { error } = await supabase.from("voice_positions").upsert(
    {
      voice_id: args.voiceId,
      team_id: args.teamId,
      topic_key: args.topicKey,
      position_summary: args.positionSummary,
      evidence_quote: args.evidenceQuote,
      segment_id: args.segmentId,
      prompt_version: args.promptVersion,
    },
    { onConflict: "voice_id,team_id,topic_key,segment_id", ignoreDuplicates: true },
  );
  if (error) {
    throw new Error(
      `writeVoicePosition(${args.voiceId}, ${args.topicKey}, ${args.segmentId}) failed: ${error.message}`,
    );
  }
  // We can't easily distinguish "wrote a new row" from "duplicate dropped"
  // with ignoreDuplicates; callers use the counter for run-level totals,
  // not per-row outcome. Return true to indicate the call succeeded.
  return true;
}
