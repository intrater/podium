/**
 * One-shot diagnostic for U3 — confirms the entities.list/podcasts.list
 * calls in api_calls do NOT overlap with any ingestion run window
 * recorded in system_alerts. If they're outside the run windows, they
 * came from `npm run seed` activity or the live-DB seed test, not the
 * daily worker. Confirms the U3 hypothesis from the cost-optimization
 * plan; no code fix required.
 *
 * Usage:
 *   npm run inspect-list-calls
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

interface ApiCallRow {
  ts: string;
  endpoint: string;
  cost_usd: string | number;
}

interface SystemAlertWindow {
  kind: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

async function main() {
  // 1. All list calls.
  const { data: listCalls, error: listErr } = await supabase
    .from("api_calls")
    .select("ts, endpoint, cost_usd")
    .in("endpoint", ["entities.list", "podcasts.list"])
    .order("ts", { ascending: true });
  if (listErr) throw listErr;

  // 2. All ingestion-run windows.
  const { data: alerts, error: alertErr } = await supabase
    .from("system_alerts")
    .select("kind, started_at, finished_at, created_at")
    .in("kind", [
      "manual_run",
      "manual_run_complete",
      "manual_run_failed",
      "scheduled_run",
      "scheduled_run_complete",
      "scheduled_run_failed",
    ])
    .order("created_at", { ascending: true });
  if (alertErr) throw alertErr;

  // 3. Build run windows by pairing start/end markers.
  const windows: { start: string; end: string }[] = [];
  const starts = (alerts ?? []).filter(
    (a) => a.kind === "manual_run" || a.kind === "scheduled_run",
  ) as SystemAlertWindow[];
  for (const start of starts) {
    const startTs = (start.started_at ?? start.created_at) as string;
    // Find the next terminal row (complete/failed) for this kind family
    const family = start.kind === "manual_run" ? "manual" : "scheduled";
    const terminal = (alerts ?? []).find(
      (a) =>
        (a.kind === `${family}_run_complete` || a.kind === `${family}_run_failed`) &&
        new Date(a.created_at as string).getTime() >
          new Date(start.created_at as string).getTime(),
    ) as SystemAlertWindow | undefined;
    const endTs = terminal
      ? (terminal.finished_at ?? terminal.created_at) as string
      : new Date(
          new Date(startTs).getTime() + 10 * 60 * 1000,
        ).toISOString();
    windows.push({ start: startTs, end: endTs });
  }

  console.log(`\nFound ${listCalls?.length ?? 0} list calls and ${windows.length} ingest run windows.\n`);

  // 4. Classify each list call.
  let inWindow = 0;
  let outOfWindow = 0;
  const oow: ApiCallRow[] = [];
  for (const call of (listCalls ?? []) as ApiCallRow[]) {
    const t = new Date(call.ts).getTime();
    const matched = windows.find(
      (w) =>
        t >= new Date(w.start).getTime() && t <= new Date(w.end).getTime(),
    );
    if (matched) {
      inWindow += 1;
    } else {
      outOfWindow += 1;
      oow.push(call);
    }
  }

  const total = inWindow + outOfWindow;
  const oowPct = total > 0 ? (outOfWindow / total) * 100 : 0;
  console.log(`Inside an ingest run window:  ${inWindow}`);
  console.log(`Outside any ingest window:    ${outOfWindow}  (${oowPct.toFixed(1)}%)`);
  console.log("");

  if (outOfWindow > 0) {
    console.log("Sample of out-of-window list calls:");
    for (const r of oow.slice(0, 5)) {
      console.log(`  ${r.ts}  ${r.endpoint}  $${Number(r.cost_usd).toFixed(4)}`);
    }
    console.log("");
  }

  console.log("Interpretation:");
  if (outOfWindow > inWindow) {
    console.log(`  ✓ Most list calls (${outOfWindow}/${total}) fall OUTSIDE ingest run`);
    console.log(`    windows. They came from seed-time activity (npm run seed) or`);
    console.log(`    the live-DB seed test, not the daily worker. The repo research`);
    console.log(`    hypothesis is confirmed: no code fix needed in the ingest path.`);
  } else {
    console.log(`  ⚠ ${inWindow}/${total} list calls fall INSIDE ingest windows.`);
    console.log(`    This is unexpected — the daily worker shouldn't be calling`);
    console.log(`    list endpoints. Investigate pipeline.ts and seed-side calls`);
    console.log(`    for runtime leaks.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
