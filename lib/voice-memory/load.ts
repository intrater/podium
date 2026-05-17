import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { VoiceId, VoicePosition } from "./types";

/**
 * Read all prior positions for a `(voice_id, team_id, topic_key)`
 * tuple, newest first. Returned to the novelty gate so it can compare
 * a new take to the voice's history.
 *
 * Sparse on day 1 (no positions yet) and densifies as v2 runs. The
 * novelty gate must tolerate an empty result by classifying the take
 * as `new_voice`.
 */
export async function loadVoicePositions(
  supabase: SupabaseClient,
  args: { voiceId: VoiceId; teamId: string; topicKey: string },
): Promise<VoicePosition[]> {
  const { data, error } = await supabase
    .from("voice_positions")
    .select(
      "id, voice_id, team_id, topic_key, position_summary, evidence_quote, segment_id, prompt_version, created_at",
    )
    .eq("voice_id", args.voiceId)
    .eq("team_id", args.teamId)
    .eq("topic_key", args.topicKey)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `loadVoicePositions(${args.voiceId}, ${args.teamId}, ${args.topicKey}) failed: ${error.message}`,
    );
  }
  return (data ?? []) as VoicePosition[];
}

/**
 * Convenience: does this voice have ANY prior position on this topic?
 * Cheap deterministic SQL check used by the novelty gate's first
 * classifier (new_voice check) before any LLM call fires.
 */
export async function voiceHasPriorPosition(
  supabase: SupabaseClient,
  args: { voiceId: VoiceId; teamId: string; topicKey: string },
): Promise<boolean> {
  const { count, error } = await supabase
    .from("voice_positions")
    .select("id", { count: "exact", head: true })
    .eq("voice_id", args.voiceId)
    .eq("team_id", args.teamId)
    .eq("topic_key", args.topicKey);
  if (error) {
    throw new Error(
      `voiceHasPriorPosition(${args.voiceId}, ${args.teamId}, ${args.topicKey}) failed: ${error.message}`,
    );
  }
  return (count ?? 0) > 0;
}
