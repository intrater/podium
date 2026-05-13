---
date: 2026-05-12
topic: U3 — verifying the origin of entities.list + podcasts.list calls in api_calls
tags: [particle, cost, ingest, dedup, observability]
applicability: cost-optimization plan U3
status: resolved (verified hypothesis; no code fix needed; live-test gate strengthened)
---

# U3 list-call investigation — finding & resolution

## The puzzle

`npm run inspect-costs` on 2026-05-12 reported 127 calls to Particle's `entities.list` and `podcasts.list` endpoints — totaling $0.51 over 2 days. These calls are slug→ID resolution and should run **once at seed time**, never at runtime. The plan's U3 unit was created to investigate whether the daily worker was leaking these calls.

## What we did

Built `scripts/inspect-list-calls.ts`. The diagnostic:

1. Pulls all `entities.list` + `podcasts.list` rows from `api_calls`.
2. Pulls all `manual_run` / `scheduled_run` start markers and their terminal counterparts from `system_alerts`.
3. Pairs starts with terminals to compute ingestion-run windows.
4. Classifies each list call as **inside** or **outside** an ingest run window.

The hypothesis being tested: if list calls are inside ingest windows, the daily worker is calling them at runtime (a real cost leak that needs a code fix). If list calls are outside ingest windows, they came from seed/test activity and there is no runtime leak — the cost discipline issue is "when do we run seed and live tests."

## What we found

```
Found 127 list calls and 3 ingest run windows.
Inside an ingest run window:  0
Outside any ingest window:    127  (100.0%)
```

**100% of list calls fall outside any ingest window.** No runtime leak in the daily worker.

Repo research from the cost-optimization plan had predicted this — the daily worker's pipeline (`lib/ingest/pipeline.ts`) only calls `searchEntityMentions`, `searchByContent`, `getClipTranscript`, etc., and never invokes `listEntities` or `listPodcasts`. The list calls originate from:

1. **`npm run seed`** runs (the seed runner via `lib/seed/index.ts` and `lib/seed/particle-resolver.ts`)
2. **The live-DB seed test** (`__tests__/lib/seed/index.test.ts`) — its `afterAll` block conditionally re-resolves real IDs when `PARTICLE_API_KEY` is in env, which calls listEntities/listPodcasts against the live API

## What we changed

No code fix to the ingest path — there's nothing to fix there.

**One discipline change:** gated the live-DB seed test behind an explicit opt-in env var.

```diff
-const haveEnv = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && PODIUM_USER_ID);
+const LIVE_TESTS_ENABLED = process.env.PODIUM_RUN_LIVE_TESTS === "true";
+const haveEnv = LIVE_TESTS_ENABLED && Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && PODIUM_USER_ID);
```

Casual `npm test` no longer fires the live-DB seed test (and no longer accidentally hits the live Particle API). To run live tests intentionally: `PODIUM_RUN_LIVE_TESTS=true npm test`.

## What this means for the cost target

U3's expected savings ($0.15/day) don't actually materialize as "ingest cost drops" because the ingest never had this cost in the first place. They materialize as "test-run cost stops accidentally hitting prod APIs." Over the cost-optimization plan's lifecycle (multiple `npm test` runs per day during U2/U4/U5/U7 work), the gate change saves ~$0.20-0.50 per day of dev work.

## Reproducing the diagnostic

```
npm run inspect-list-calls
```

The script can be re-run anytime to verify no new leaks appear. Expected output: 100% out-of-window. If "in-window" count climbs above 0, something in the pipeline has started calling `listEntities` or `listPodcasts` at runtime and needs investigation.
