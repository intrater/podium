/**
 * Honest cost breakdown — what every API call we've ever made actually cost.
 *
 * Usage:
 *   npm run inspect-costs                   # all-time, by provider/endpoint
 *   npm run inspect-costs -- since=2026-05-10
 *   npm run inspect-costs -- detail         # per-call list
 *   npm run inspect-costs -- group=team     # per-team subtotals (post-U1)
 *   npm run inspect-costs -- team=49ers     # filter to one team only
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const argMap = new Map<string, string>();
const flags = new Set<string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  if (v) argMap.set(k, v);
  else flags.add(k);
}

async function main() {
  let query = supabase
    .from("api_calls")
    .select("ts, provider, endpoint, tier, model, input_tokens, output_tokens, cost_usd, team_id, metadata")
    .order("ts", { ascending: false });

  const since = argMap.get("since");
  if (since) query = query.gte("ts", since);
  const teamFilter = argMap.get("team");
  if (teamFilter) query = query.eq("team_id", teamFilter);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  if (rows.length === 0) {
    console.log("No api_calls rows found.");
    return;
  }

  const total = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  console.log(`\nTotal: ${rows.length} calls, $${total.toFixed(4)}`);
  console.log(`Range: ${rows[rows.length - 1].ts} → ${rows[0].ts}\n`);

  // By provider
  const byProvider = new Map<string, { calls: number; usd: number }>();
  rows.forEach((r) => {
    const k = r.provider as string;
    const cur = byProvider.get(k) ?? { calls: 0, usd: 0 };
    cur.calls += 1;
    cur.usd += Number(r.cost_usd ?? 0);
    byProvider.set(k, cur);
  });
  console.log("By provider:");
  for (const [k, v] of byProvider) {
    console.log(
      `  ${k.padEnd(12)} ${String(v.calls).padStart(4)} calls  $${v.usd.toFixed(4).padStart(8)}  ${((v.usd / total) * 100).toFixed(1)}%`,
    );
  }

  // By team (post-U1 attribution)
  if (argMap.get("group") === "team" || teamFilter) {
    const byTeam = new Map<string, { calls: number; usd: number }>();
    rows.forEach((r) => {
      const k = (r.team_id as string | null) ?? "(unattributed)";
      const cur = byTeam.get(k) ?? { calls: 0, usd: 0 };
      cur.calls += 1;
      cur.usd += Number(r.cost_usd ?? 0);
      byTeam.set(k, cur);
    });
    console.log("\nBy team:");
    for (const [k, v] of byTeam) {
      console.log(
        `  ${k.padEnd(20)} ${String(v.calls).padStart(4)} calls  $${v.usd.toFixed(4).padStart(8)}  ${((v.usd / total) * 100).toFixed(1)}%`,
      );
    }
  }

  // By endpoint
  console.log("\nBy provider + endpoint:");
  const byEndpoint = new Map<string, { calls: number; usd: number; avg: number }>();
  rows.forEach((r) => {
    const k = `${r.provider}/${r.endpoint ?? "(unknown)"}`;
    const cur = byEndpoint.get(k) ?? { calls: 0, usd: 0, avg: 0 };
    cur.calls += 1;
    cur.usd += Number(r.cost_usd ?? 0);
    byEndpoint.set(k, cur);
  });
  const sorted = [...byEndpoint.entries()].sort(
    (a, b) => b[1].usd - a[1].usd,
  );
  for (const [k, v] of sorted) {
    const avg = v.usd / v.calls;
    console.log(
      `  ${k.padEnd(40)} ${String(v.calls).padStart(4)} calls  $${v.usd.toFixed(4).padStart(8)}  (avg $${avg.toFixed(4)}/call)`,
    );
  }

  // Anthropic token analysis
  const anthropicRows = rows.filter((r) => r.provider === "anthropic");
  if (anthropicRows.length > 0) {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    anthropicRows.forEach((r) => {
      totalInput += r.input_tokens ?? 0;
      totalOutput += r.output_tokens ?? 0;
      const m = r.metadata as Record<string, unknown> | null;
      const cacheRead = (m?.cache_read_input_tokens as number | undefined) ?? 0;
      totalCacheRead += cacheRead;
    });
    console.log("\nAnthropic token detail:");
    console.log(`  input  (fresh)     : ${totalInput.toLocaleString().padStart(10)}`);
    console.log(`  input  (cache hit) : ${totalCacheRead.toLocaleString().padStart(10)}`);
    console.log(`  output             : ${totalOutput.toLocaleString().padStart(10)}`);
    const cachePct = totalCacheRead / (totalCacheRead + totalInput) || 0;
    console.log(`  cache hit rate     : ${(cachePct * 100).toFixed(1)}%`);
  }

  if (flags.has("detail")) {
    console.log("\nDetail (newest first):");
    rows.forEach((r) => {
      console.log(
        `  ${r.ts}  ${(r.provider as string).padEnd(10)} ${(r.endpoint as string ?? "").padEnd(30)} $${Number(r.cost_usd).toFixed(4)}`,
      );
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
