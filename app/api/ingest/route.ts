/**
 * Manual ingestion trigger.
 *
 * POST /api/ingest with `Authorization: Bearer ${CRON_SECRET}` runs the
 * daily ingestion synchronously. Single-shard for v1 — sharded
 * orchestration arrives with the Edge Function commit. Rate-limited to
 * one successful invocation per 60 seconds via a recency check on
 * `system_alerts.kind = 'manual_run'`.
 *
 * The route is a thin wrapper around `runDailyIngestion`. All policy
 * (cost gate, dev-mode filter, auto-seed window) lives there.
 */

import { NextResponse } from "next/server";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { env } from "@/lib/env";
import type { DailyIngestionResult } from "@/lib/ingest/run";
import { runDailyIngestion } from "@/lib/ingest/run";
import { createParticleClient } from "@/lib/particle/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RATE_LIMIT_SECONDS = 60;
const TEAM_ID = "49ers";

// Vercel Pro: extend the per-invocation budget so the synchronous pipeline
// run has room. Values <= 300 are accepted on Pro; the runtime defaults
// to 10s otherwise. The Edge Function path (separate commit) uses pg_cron
// with sharded execution; this route is the manual-trigger path that
// runs the pipeline in one go.
export const maxDuration = 300;

/**
 * Public response shape for POST /api/ingest. Mirrors `DailyIngestionResult`
 * but is declared explicitly so renames inside the pipeline don't silently
 * become breaking API changes.
 */
export type PostIngestResponse = DailyIngestionResult;

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const recent = await mostRecentManualRun(supabase);
  if (recent) {
    const elapsedSeconds = (Date.now() - new Date(recent).getTime()) / 1000;
    if (elapsedSeconds < RATE_LIMIT_SECONDS) {
      const retryAfter = Math.ceil(RATE_LIMIT_SECONDS - elapsedSeconds);
      return NextResponse.json(
        { error: "rate_limited", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  const particle = createParticleClient({ supabase });
  const anthropic = createAnthropicClient({ supabase });

  try {
    const result: PostIngestResponse = await runDailyIngestion({
      supabase,
      particle,
      anthropic,
      teamId: TEAM_ID,
      userId: env.PODIUM_USER_ID,
      runKind: "manual_run",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("api/ingest: run failed", message);
    return NextResponse.json({ error: "ingestion_failed", message }, { status: 500 });
  }
}

async function mostRecentManualRun(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("system_alerts")
    .select("created_at")
    .eq("kind", "manual_run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`api/ingest: rate-limit lookup failed (${error.message}); allowing the call`);
    return null;
  }
  return (data?.created_at as string | undefined) ?? null;
}
