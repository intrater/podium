/**
 * Daily ingestion wrapper.
 *
 * Turns `runIngestPipeline` (which is a pure per-shard function) into a
 * production-callable run by adding the surrounding policy:
 *
 *   - Reads the curated podcast catalog from the DB and resolves
 *     particle_id for each (the daily worker takes IDs, not slugs).
 *   - Computes `sinceTimestamp` — first-run auto-seed (3 days back if
 *     the user has zero cards) or incremental (max(cards.surfaced_at)
 *     minus a safety margin).
 *   - Applies INGEST_DEV_MODE — when true, filter to the first 2
 *     podcasts and a 1-day window so test runs stay cheap.
 *   - Pre-flight cost gate — estimates worst-case spend; if > 60% of
 *     remaining starter credit, abort with a `system_alerts` row of
 *     kind `cost_abort`.
 *   - Writes `system_alerts` rows at run start and run end with totals.
 *
 * Kept separate from the pipeline core so the Edge Function can call the
 * pipeline in sharded mode without re-running the wrapper logic per
 * shard.
 */

import "server-only";

import { estimateCost } from "@/lib/particle/cost-estimate";
import { env } from "@/lib/env";

import { runIngestPipeline } from "./pipeline";
import type { IngestPipelineOutput, PipelineDeps } from "./types";

const FIRST_RUN_WINDOW_DAYS = 3;
const DEV_MODE_WINDOW_DAYS = 1;
const DEV_MODE_PODCAST_LIMIT = 2;
const SAFETY_MARGIN_HOURS = 6;
const STARTER_CREDIT_USD = 10;
const COST_GATE_RATIO = 0.6;

export interface DailyIngestionDeps extends PipelineDeps {
  /** Team to run for. v1 single-team uses '49ers'. */
  teamId: string;
  /** Where to mark the run kind in system_alerts. Defaults to 'manual_run'. */
  runKind?: "manual_run" | "scheduled_run";
  /** Override the dev-mode flag (for tests). Defaults to env.INGEST_DEV_MODE. */
  devMode?: boolean;
  /** Inject `now()` for tests. */
  now?: () => Date;
}

export interface DailyIngestionResult {
  runId: string;
  status: "completed" | "cost_aborted" | "no_podcasts";
  podcastsScanned: number;
  pipeline?: IngestPipelineOutput;
  estimatedCostUsd?: number;
  /** Reason string when status is non-completed; null on success. */
  reason?: string;
}

export async function runDailyIngestion(
  deps: DailyIngestionDeps,
): Promise<DailyIngestionResult> {
  const now = (deps.now ?? (() => new Date()))();
  const runId = crypto.randomUUID();
  const devMode = deps.devMode ?? env.INGEST_DEV_MODE;
  const runKind = deps.runKind ?? "manual_run";

  // 1. Load the resolved-id catalog. Skip rows whose particle_id is null —
  //    those are unresolved at seed time and the worker would 404 on
  //    listEpisodes.
  const { data: podcastsRaw, error: podErr } = await deps.supabase
    .from("podcasts")
    .select("particle_id")
    .not("particle_id", "is", null);
  if (podErr) {
    throw new Error(`runDailyIngestion: podcasts catalog read failed: ${podErr.message}`);
  }
  let podcastIds = (podcastsRaw ?? [])
    .map((row) => row.particle_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (devMode) {
    podcastIds = podcastIds.slice(0, DEV_MODE_PODCAST_LIMIT);
  }
  if (podcastIds.length === 0) {
    return {
      runId,
      status: "no_podcasts",
      podcastsScanned: 0,
      reason: "no podcasts have particle_id resolved — run `npm run seed` to populate",
    };
  }

  // 2. Compute sinceTimestamp. First-run auto-seed when the user has zero
  //    cards; otherwise incremental from last surfaced card.
  const sinceTimestamp = await computeSinceTimestamp(deps, now, devMode);

  // 3. Load universe for cost estimate.
  const { data: team, error: teamErr } = await deps.supabase
    .from("teams")
    .select("universe_id")
    .eq("id", deps.teamId)
    .single();
  if (teamErr || !team) {
    throw new Error(`runDailyIngestion: team ${deps.teamId} not found`);
  }
  const { data: universe, error: uniErr } = await deps.supabase
    .from("universes")
    .select("entities, storylines")
    .eq("id", team.universe_id)
    .single();
  if (uniErr || !universe) {
    throw new Error(`runDailyIngestion: universe for ${deps.teamId} not found`);
  }
  const universeShape = {
    entities: (universe.entities as string[]) ?? [],
    storylines: (universe.storylines as string[]) ?? [],
  };

  // 4. Pre-flight cost gate.
  const windowDays = devMode
    ? DEV_MODE_WINDOW_DAYS
    : Math.max(1, Math.ceil((now.getTime() - new Date(sinceTimestamp).getTime()) / (24 * 60 * 60 * 1000)));
  const estimate = estimateCost({
    universe: universeShape,
    podcastCount: podcastIds.length,
    windowDays,
  });
  const remaining = await remainingStarterCreditUsd(deps, now);
  const budget = remaining * COST_GATE_RATIO;

  if (estimate.totalUsd > budget) {
    const ratioPct = (COST_GATE_RATIO * 100).toFixed(0);
    const reason =
      `pre-flight cost estimate $${estimate.totalUsd.toFixed(4)} exceeds ${ratioPct}% of remaining ` +
      `$${remaining.toFixed(4)} starter credit (budget $${budget.toFixed(4)})`;
    await writeSystemAlert(deps, {
      kind: "cost_abort",
      runId,
      runKind,
      sinceTimestamp,
      podcastIds,
      estimatedCostUsd: estimate.totalUsd,
      remainingCreditUsd: remaining,
      reason,
    });
    return {
      runId,
      status: "cost_aborted",
      podcastsScanned: 0,
      estimatedCostUsd: estimate.totalUsd,
      reason,
    };
  }

  // 5. Run start + run end markers in system_alerts. Always write a
  //    terminal marker so the status endpoint never reports `running`
  //    indefinitely if the pipeline throws.
  await writeSystemAlert(deps, {
    kind: runKind,
    runId,
    sinceTimestamp,
    podcastIds,
    estimatedCostUsd: estimate.totalUsd,
    startedAt: now.toISOString(),
  });

  let pipeline: IngestPipelineOutput;
  try {
    pipeline = await runIngestPipeline(deps, {
      teamId: deps.teamId,
      podcastIds,
      sinceTimestamp,
      untilTimestamp: now.toISOString(),
      runId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeSystemAlert(deps, {
      kind: `${runKind}_failed`,
      runId,
      sinceTimestamp,
      podcastIds,
      reason: `pipeline threw: ${message}`,
      finishedAt: new Date().toISOString(),
    });
    throw err;
  }

  await writeSystemAlert(deps, {
    kind: `${runKind}_complete`,
    runId,
    sinceTimestamp,
    podcastIds,
    pipeline,
    finishedAt: new Date().toISOString(),
  });

  return {
    runId,
    status: "completed",
    podcastsScanned: podcastIds.length,
    pipeline,
    estimatedCostUsd: estimate.totalUsd,
  };
}

async function computeSinceTimestamp(
  deps: DailyIngestionDeps,
  now: Date,
  devMode: boolean,
): Promise<string> {
  const windowDays = devMode ? DEV_MODE_WINDOW_DAYS : FIRST_RUN_WINDOW_DAYS;
  const { data: latest, error } = await deps.supabase
    .from("cards")
    .select("surfaced_at")
    .eq("user_id", deps.userId)
    .eq("team_id", deps.teamId)
    .order("surfaced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`runDailyIngestion: cards lookup failed (${error.message}); using ${windowDays}-day window`);
  }
  if (!latest) {
    return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  }
  const last = new Date(latest.surfaced_at as string);
  const safetyMs = SAFETY_MARGIN_HOURS * 60 * 60 * 1000;
  return new Date(last.getTime() - safetyMs).toISOString();
}

async function remainingStarterCreditUsd(deps: DailyIngestionDeps, now: Date): Promise<number> {
  // Sum cost_usd for the current calendar month — Particle's billing
  // period is monthly and the starter credit is monthly. If an api_calls
  // read fails we err on the side of "lots of headroom" so the gate
  // doesn't false-positive on a transient DB blip.
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { data, error } = await deps.supabase
    .from("api_calls")
    .select("cost_usd")
    .eq("provider", "particle")
    .gte("ts", monthStart.toISOString());
  if (error) {
    console.warn(
      `runDailyIngestion: api_calls read failed (${error.message}); cost gate fail-open`,
    );
    // Surface the bypass via system_alerts so an operator can see that
    // the gate was disabled this run — silent fail-open is the worst
    // thing we could do for cost telemetry.
    await deps.supabase.from("system_alerts").insert({
      kind: "cost_gate_bypassed",
      notes: `api_calls read failed (${error.message}); proceeding without cost gate`,
      payload: { reason: "db_read_failed", error: error.message },
    });
    return STARTER_CREDIT_USD;
  }
  const spent = (data ?? []).reduce((sum, row) => {
    const value = (row as { cost_usd: number | string | null }).cost_usd;
    if (value === null || value === undefined) return sum;
    const n = Number(value);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  return Math.max(0, STARTER_CREDIT_USD - spent);
}

interface SystemAlertPayload {
  kind: string;
  runId: string;
  runKind?: string;
  sinceTimestamp?: string;
  podcastIds?: readonly string[];
  estimatedCostUsd?: number;
  remainingCreditUsd?: number;
  reason?: string;
  startedAt?: string;
  finishedAt?: string;
  pipeline?: IngestPipelineOutput;
}

async function writeSystemAlert(
  deps: DailyIngestionDeps,
  payload: SystemAlertPayload,
): Promise<void> {
  const { kind, runId, ...rest } = payload;
  const { error } = await deps.supabase.from("system_alerts").insert({
    kind,
    started_at: rest.startedAt ?? null,
    finished_at: rest.finishedAt ?? null,
    episodes_count: rest.pipeline?.episodesPersisted ?? null,
    segments_count: rest.pipeline?.segmentsPersisted ?? null,
    cost_usd: rest.estimatedCostUsd ?? null,
    notes: rest.reason ?? null,
    payload: { run_id: runId, ...rest, pipeline: rest.pipeline ?? null },
  });
  if (error) {
    console.error(`runDailyIngestion: system_alerts insert (${kind}) failed: ${error.message}`);
  }
}
