/**
 * Weekly team-brain refresh cron (U10).
 *
 * Vercel Cron invokes this endpoint via GET each Monday at 12:00 UTC
 * (after the Sunday daily-digest run has surfaced the weekend's
 * content, so the past-week summary the prompt receives is complete).
 *
 * The brain is the cacheable system prefix on every v2 Claude call.
 * Keeping it fresh week-over-week is what prevents the voice from
 * grounding in stale facts ("Hardy is finally healthy" after Hardy
 * has re-injured). v1 ships the initial seed via npm run
 * seed:team-brain; this cron takes over from there.
 *
 * Auth mirrors the daily cron — CRON_SECRET bearer token, no other
 * gate. Per-team failures continue to the next team rather than
 * killing the whole run.
 */

import { NextResponse } from "next/server";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { updateTeamBrain, type UpdateTeamBrainOutput } from "@/lib/team-brain/update";

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();

  const { data: teamRows, error: teamErr } = await supabase.from("teams").select("id");
  if (teamErr) {
    console.error("api/cron/weekly-brain-update: teams lookup failed", teamErr.message);
    return NextResponse.json(
      { error: "teams_lookup_failed", message: teamErr.message },
      { status: 500 },
    );
  }
  const teamIds = (teamRows ?? []).map((row) => row.id as string);
  if (teamIds.length === 0) {
    return NextResponse.json({ status: "no_teams", results: [] }, { status: 200 });
  }

  const runId = crypto.randomUUID();
  await writeSystemAlert(supabase, "weekly_brain_update", runId, {
    started_at: startedAt,
    notes: `Running brain update for ${teamIds.length} team(s)`,
  });

  const results: Array<{ teamId: string; result: UpdateTeamBrainOutput | { status: "errored"; error: string } }> = [];
  for (const teamId of teamIds) {
    const anthropic = createAnthropicClient({ supabase, teamId });
    try {
      const result = await updateTeamBrain(supabase, anthropic, teamId);
      results.push({ teamId, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`api/cron/weekly-brain-update: team ${teamId} failed`, message);
      results.push({ teamId, result: { status: "errored", error: message } });
    }
  }

  const finishedAt = new Date().toISOString();
  await writeSystemAlert(supabase, "weekly_brain_update_complete", runId, {
    started_at: startedAt,
    finished_at: finishedAt,
    notes: `Teams: ${results.map((r) => `${r.teamId}:${r.result.status}`).join(", ")}`,
  });

  return NextResponse.json({ runId, startedAt, finishedAt, results }, { status: 200 });
}

async function writeSystemAlert(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  kind: string,
  runId: string,
  fields: {
    started_at?: string;
    finished_at?: string;
    notes?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("system_alerts").insert({
    kind,
    started_at: fields.started_at ?? null,
    finished_at: fields.finished_at ?? null,
    notes: fields.notes ?? null,
    payload: { run_id: runId, kind, ...fields },
  });
  if (error) {
    console.error(`api/cron/weekly-brain-update: system_alerts insert (${kind}) failed: ${error.message}`);
  }
}
