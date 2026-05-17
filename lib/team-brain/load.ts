import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TeamBrain } from "./types";

/**
 * Read the current team brain for a team. Returns null if the team has
 * no brain seeded yet (which should never happen in production, but
 * v1 development may hit it before the seed job runs).
 *
 * Callers that depend on the brain (every v2 Claude call) should
 * refuse to proceed without one — operating without a brain means
 * the voice has no grounding and the cache prefix doesn't fire.
 */
export async function loadTeamBrain(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamBrain | null> {
  const { data, error } = await supabase
    .from("team_brain")
    .select("payload, updated_at, prompt_version")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) {
    throw new Error(`loadTeamBrain(${teamId}) failed: ${error.message}`);
  }
  if (!data) return null;
  // payload is the typed body; updated_at lives on the row, not in payload
  return {
    ...(data.payload as Omit<TeamBrain, "updated_at">),
    updated_at: data.updated_at as string,
  };
}
