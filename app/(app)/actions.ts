"use server";

import { revalidatePath } from "next/cache";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { env } from "@/lib/env";
import { runDailyIngestion } from "@/lib/ingest/run";
import { createParticleClient } from "@/lib/particle/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TEAM_ID = "49ers";
const RATE_LIMIT_SECONDS = 60;

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
 * The action mirrors the 60s recency check from app/api/ingest/route.ts
 * so two open tabs (or rapid retry clicks) can't fan out concurrent
 * paid Particle + Anthropic runs. Per-user concurrency is not strictly
 * atomic — two simultaneous invocations could both pass the check before
 * either writes a manual_run row — but at v1 single-user with rate-
 * limited clicks the practical race window is sub-millisecond. A
 * `pg_try_advisory_lock` keyed on user_id is the pre-multi-user upgrade.
 *
 * v3 swaps this for a session-cookie-gated server action that resolves
 * the user from the real auth context. The pipeline call already takes
 * `userId` as a parameter, so the only change is sourcing it from
 * `getSession()` instead of `env.PODIUM_USER_ID`.
 */
export async function retryDailyIngestion(): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: recent } = await supabase
    .from("system_alerts")
    .select("created_at")
    .eq("kind", "manual_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.created_at) {
    const elapsedSeconds =
      (Date.now() - new Date(recent.created_at as string).getTime()) / 1000;
    if (elapsedSeconds < RATE_LIMIT_SECONDS) {
      // Silently no-op rather than throw — the page-level loader will
      // pick up the in-flight run via /api/ingest/status polling. The
      // user sees the existing run continue rather than a confusing
      // "already running" error.
      return;
    }
  }

  const particle = createParticleClient({ supabase, teamId: TEAM_ID });
  const anthropic = createAnthropicClient({ supabase, teamId: TEAM_ID });
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
