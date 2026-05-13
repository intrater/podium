/**
 * Ingestion status endpoint.
 *
 * GET /api/ingest/status returns the most recent ingestion run's outcome:
 * either an in-flight start row, a completion row, a failed row, or a
 * cost-abort row, whichever is most recent. Used by the first-run
 * loading UI (Q8) and any future "run now" affordance to show progress.
 *
 * **v1 single-user note.** This endpoint is currently unauthenticated.
 * The original spec called for stub-JWT gating; that path was deferred
 * to U5 residual #15 (shared-secret check on `/api/*` in middleware,
 * landing before the custom domain goes live). Until then the response
 * exposes operational metadata (cost figures, podcast IDs, run IDs) and
 * should not be reachable from the public internet. Domain wiring is
 * gated by U4 — `podiumsports.app` is not yet pointing at Vercel.
 */

import { NextResponse } from "next/server";

import {
  KIND_TO_STATUS,
  type DigestRunStatus,
} from "@/lib/digest/load-cards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 5;

const TRACKED_KINDS = Object.keys(KIND_TO_STATUS);

interface LastRun {
  kind: string;
  startedAt: string | null;
  finishedAt: string | null;
  episodesCount: number | null;
  segmentsCount: number | null;
  costUsd: number | null;
  notes: string | null;
  payload: unknown;
  createdAt: string | null;
}

export async function GET(): Promise<Response> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("system_alerts")
    .select("kind, started_at, finished_at, episodes_count, segments_count, cost_usd, notes, payload, created_at")
    .in("kind", TRACKED_KINDS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("api/ingest/status: lookup_failed", error.message);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ status: "no_runs", lastRun: null }, { status: 200 });
  }
  const status: DigestRunStatus =
    typeof data.kind === "string" && data.kind in KIND_TO_STATUS
      ? KIND_TO_STATUS[data.kind]
      : "unknown";
  const lastRun: LastRun = {
    kind: data.kind as string,
    startedAt: (data.started_at as string | null) ?? null,
    finishedAt: (data.finished_at as string | null) ?? null,
    episodesCount: (data.episodes_count as number | null) ?? null,
    segmentsCount: (data.segments_count as number | null) ?? null,
    costUsd: data.cost_usd === null || data.cost_usd === undefined ? null : Number(data.cost_usd),
    notes: (data.notes as string | null) ?? null,
    payload: data.payload,
    createdAt: (data.created_at as string | null) ?? null,
  };
  return NextResponse.json({ status, lastRun }, { status: 200 });
}
