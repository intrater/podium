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
import { runDailyIngestion, type DailyIngestionResult } from "@/lib/ingest/run";
import { createParticleClient } from "@/lib/particle/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  // AUTH MUST COME FIRST — no DB reads, no team enumeration, no work of
  // any kind before the bearer token is verified.
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // U6: iterate all teams. Cadence is enforced inside runDailyIngestion
  // per team (in-season → daily, off-season → every N days from config).
  // v1 single-team this loop runs once; v2 multi-team it just keeps
  // working without changes here.
  const { data: teamRows, error: teamErr } = await supabase
    .from("teams")
    .select("id");
  if (teamErr) {
    console.error("api/cron/daily-digest: teams lookup failed", teamErr.message);
    return NextResponse.json(
      { error: "teams_lookup_failed", message: teamErr.message },
      { status: 500 },
    );
  }
  const teamIds = (teamRows ?? []).map((row) => row.id as string);
  if (teamIds.length === 0) {
    return NextResponse.json({ status: "no_teams", results: [] }, { status: 200 });
  }

  const results: Array<{ teamId: string; result: DailyIngestionResult }> = [];
  for (const teamId of teamIds) {
    const particle = createParticleClient({ supabase, teamId });
    const anthropic = createAnthropicClient({ supabase, teamId });
    try {
      const result = await runDailyIngestion({
        supabase,
        particle,
        anthropic,
        teamId,
        userId: env.PODIUM_USER_ID,
        runKind: "scheduled_run",
      });
      results.push({ teamId, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`api/cron/daily-digest: team ${teamId} failed`, message);
      // Continue to next team rather than failing the whole cron — one
      // team's pipeline error shouldn't kill another team's run.
      results.push({
        teamId,
        result: {
          runId: "",
          status: "completed", // placeholder; real status is the error
          podcastsScanned: 0,
          reason: `pipeline threw: ${message}`,
        } as DailyIngestionResult,
      });
    }
  }

  return NextResponse.json({ results }, { status: 200 });
}
