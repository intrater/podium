"use server";

import { revalidatePath } from "next/cache";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { env } from "@/lib/env";
import { runDailyIngestion } from "@/lib/ingest/run";
import { createParticleClient } from "@/lib/particle/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TEAM_ID = "49ers";

/**
 * Re-run the daily ingestion from the digest page's first-run loader,
 * the timeout retry button, and the failed-run retry button.
 *
 * Browser-driven retry can't go through `POST /api/ingest` cleanly: that
 * route is `CRON_SECRET`-gated, and we don't want the secret in the
 * client bundle. The action runs in a privileged server context and
 * calls the same backing pipeline, so the user gets the same effect
 * without exposing the secret.
 *
 * v3 swaps this for a session-cookie-gated server action that resolves
 * the user from the real auth context. The pipeline call already takes
 * `userId` as a parameter, so the only change is sourcing it from
 * `getSession()` instead of `env.PODIUM_USER_ID`.
 */
export async function retryDailyIngestion(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const particle = createParticleClient({ supabase });
  const anthropic = createAnthropicClient({ supabase });
  await runDailyIngestion({
    supabase,
    particle,
    anthropic,
    teamId: TEAM_ID,
    userId: env.PODIUM_USER_ID,
    runKind: "manual_run",
  });
  revalidatePath("/");
}
