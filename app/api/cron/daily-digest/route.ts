/**
 * Cron-triggered daily digest run.
 *
 * Vercel Cron Jobs invoke this endpoint via GET on the schedule defined
 * in `vercel.json`. The Vercel runtime automatically attaches
 * `Authorization: Bearer ${CRON_SECRET}` when that env var is set, which
 * is the same gate the manual POST trigger uses — no separate secret
 * to manage.
 *
 * Architecturally this duplicates POST /api/ingest's run logic. The two
 * paths exist because Vercel Cron only supports GET; a future v2 admin
 * UI may also want a manual GET trigger that bypasses the rate limit
 * (cron jobs are inherently rate-limited by the schedule). Sharing
 * `runDailyIngestion` keeps the actual work in one place.
 *
 * **Why not Supabase Edge Function + pg_cron?** The original plan
 * called for that to leverage Supabase's 150s budget chained across
 * shards via pg_net. Vercel Pro gives us a single 300s window which
 * fits the v1 daily run with bounded-concurrency segment processing
 * (lib/ingest/pipeline.ts SEGMENT_CONCURRENCY). The Deno mirror saves
 * us hundreds of lines of duplicated code we'd otherwise maintain.
 * If the daily run ever exceeds 300s, the path forward is sharded
 * orchestration here, not a runtime swap.
 */

import { NextResponse } from "next/server";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { env } from "@/lib/env";
import { runDailyIngestion } from "@/lib/ingest/run";
import { createParticleClient } from "@/lib/particle/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

const TEAM_ID = "49ers";

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const particle = createParticleClient({ supabase, teamId: TEAM_ID });
  const anthropic = createAnthropicClient({ supabase, teamId: TEAM_ID });

  try {
    const result = await runDailyIngestion({
      supabase,
      particle,
      anthropic,
      teamId: TEAM_ID,
      userId: env.PODIUM_USER_ID,
      runKind: "scheduled_run",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("api/cron/daily-digest: run failed", message);
    return NextResponse.json({ error: "ingestion_failed", message }, { status: 500 });
  }
}
