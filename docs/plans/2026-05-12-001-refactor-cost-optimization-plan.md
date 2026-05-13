---
date: 2026-05-12
status: active
plan-id: 2026-05-12-001
type: refactor
title: "Drive Podium ingest cost to ≤$0.20/team/day"
origin: docs/strategy/unit-economics.md
revised: 2026-05-13 (Phase A executed — U1/U3/U8 verified live; U2 root cause diagnosed — dormant until U4 grows the prefix past Haiku 4.5's 4,096-token cache minimum)
prior-revisions:
  - 2026-05-13 (later) — Diagnosed the U2 cache miss. Root cause: Claude Haiku 4.5's documented minimum cacheable prefix is **4,096 tokens**, not the 2,048 the plan assumed. Our cacheable prefix (system + tools) is ~2,800 tokens — silently below the threshold. Anthropic returns 0/0 on both `cache_creation_input_tokens` and `cache_read_input_tokens` with no error when this happens. The marker placement was correct; the four "ranked suspects" in the prior revision were all wrong trees. Verified via `scripts/debug-cache.ts` — same code path with a ~7,921-token padded prefix cached perfectly. Decision: don't pad `SHARED_RULES` purely to clear the threshold; U4's per-episode extraction will rewrite the prompt with full episode transcripts in context, naturally clearing 4,096. U2 is marked dormant and will turn on automatically once U4 ships. Solutions doc at `docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md`.
  - 2026-05-13 — Phase A `/ce-work` autonomous overnight execution. Four commits on main pushed to origin. U2 (caching fix) shipped the structural marker placement on system + tools per Anthropic SDK types, and 5 new unit-test assertions pass; live verification run (24 Anthropic calls under `?force=1`) showed cache_creation_input_tokens=0 AND cache_read_input_tokens=0 on every row — Anthropic isn't honoring the marker. U1, U3, U8 verified end-to-end on live data. See "Next-session pickup" section below.
  - 2026-05-12 — interactive walkthrough of the 6-reviewer doc-review pass. 8 substantive decisions baked in (path-1 persistence shape, CE1 → 30-day window, U5 split into U5+U8, U4 Stage 1.5 A/B, U7 simplified + DeepSeek excluded, Phase A reordered U2-first, U6 multi-team-ready retained).
related-plans:
  - docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md (v1 build — landed)
---

# refactor: Drive Podium ingest cost to ≤$0.20/team/day

## Summary

Current Podium ingestion costs ~$0.90 per team-per-day. The $3.99/month Pro tier math requires ≤$0.20 per team-per-day in steady state. This plan delivers that reduction through one-line caching fix, a structural shift from per-segment to per-episode Claude pass, prompt-version-aware re-processing, per-team cadence policy, and a data-driven model evaluation across Anthropic / Google / OpenAI / xAI / DeepSeek. Cross-cutting: per-team cost attribution on `api_calls` so the success metric is actually measurable.

The biggest single lever is the per-episode pipeline — current architecture fetches a transcript ($0.008) and calls Claude ($0.004) per *segment*, and most days hit 50+ segments. Episode-level processing collapses that to 1 transcript + 1 Claude call per episode (~8 episodes/day), with a credible path to using inline `SearchResult.windows[].lines[]` data and eliminating the separate transcript fetch entirely.

(see origin: `docs/strategy/unit-economics.md`)

---

## Problem Frame

The v1 architecture works correctly but isn't economically viable beyond the builder's personal use. At $0.90/team/day, a single user paying $3.99/month covers ~4 days of their own ingestion cost. Pro-tier economics require either many users sharing one team (multi-tenant — separate v2 plan), or per-team cost falling below ~$0.20/day so even small subscriber counts make the math work.

Cost breakdown from `api_calls` on 2026-05-12 (2 days, $4.23 spend total):
- **Particle transcript fetches:** $2.03 (48%) — 254 calls @ $0.008/call. *The single biggest line item.*
- **Anthropic summarize_segment:** $0.76 (18%) — 179 calls @ $0.004/call. Should be ~$0.08 with caching (90% off cached input).
- **Particle mentions search:** $0.73 (17%) — 91 calls. Fixed cost per team per run.
- **Particle list endpoints (entities/podcasts):** $0.51 (12%) — investigated below.
- **Particle search (storyline):** $0.19 (5%).

Anthropic cache hit rate is 0% versus the ~90% U9 designed for — the cache breakpoint is misplaced in the message structure.

Cost-side and content-quality work converge in one architectural shift: the per-episode Claude pass both cuts the dominant cost line AND should produce better content (Claude sees the full episode context instead of chopped slices). Content shape has been an open concern since the U10–U13 ship; this plan is the place to address it.

---

## Requirements Traceability

This plan executes against the unit-economics anchor at `docs/strategy/unit-economics.md`. The doc carries the full target derivation and pricing model; this plan is the *how*. Key carry-forward requirements:

| ID | Requirement | Source |
|---|---|---|
| **CE1** | Per-team-per-day cost ≤ $0.20 in steady state (30-day rolling average — long enough to absorb in-season/off-season variance per the origin doc's cadence-averaging math, short enough to catch sustained regressions) | unit-economics §"Cost model" |
| **CE2** | Anthropic prompt caching hits the ~90% rate U9 designed for | unit-economics §"What we observed" |
| **CE3** | Per-team cost attribution exists on `api_calls` so CE1 is measurable | unit-economics §"Engineering decisions anchored to this doc" |
| **CE4** | per-episode Claude pipeline replaces per-segment summarization | unit-economics §"Engineering decisions anchored to this doc" |
| **CE5** | Prompt iteration doesn't require manual DB row deletion | plan-internal (added during planning to make U4 iteration affordable) |
| **CE6** | Cadence per team (in-season daily, off-season every 2–3 days) | unit-economics §"Engineering decisions anchored to this doc" |
| **CE7** | Model selection is data-driven, with evidence captured for the decision | plan-internal, supported by unit-economics §"Engineering decisions anchored to this doc" (model-agnostic architecture goal) |
| **CE8** | New card content shape is user-approved before the per-episode unit ships | plan-internal (user added during planning Q&A on 2026-05-12 — content-shape concern from U10–U13 ship) |

Plus inherited from the v1 plan's `Success Metrics`:
- "Cost stays under $30 for first 30 days of production-equivalent use" — this plan is the work to bring that into reach.
- "Zero cross-user data leakage in RLS smoke tests" — must not regress. Schema additions must preserve RLS posture.

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementer should treat it as context, not code to reproduce.*

### Pipeline shape today vs. target

```
TODAY (per-segment fan-out)
─────────────────────────────────────────────────────────────────
search entities (30 calls) ──┐
search storylines (8 calls)  ├─→ N raw segments
                             ↓
        for each segment (concurrency=5):
          ├─ getClipTranscript      [$0.008 × N segments]
          └─ summarizeSegment       [$0.004 × N segments]
                             ↓
        groupBy episode
                             ↓
        for each episode: summarizeEpisode (rollup)
                             ↓
        persist
```

```
TARGET (per-episode fan-out)
─────────────────────────────────────────────────────────────────
search entities (30 calls) ──┐
search storylines (8 calls)  ├─→ M episodes with mention metadata
                             ↓
        for each episode (concurrency=5):
          ├─ build context from inline windows[].lines[]   [$0/call]
          │  OR  getEpisodeTranscript when context insufficient   [$0.008 × M ≪ N]
          └─ extractEpisodeMoments        [$0.004 × M ≪ N]
                              returns: relevant moments with timestamps,
                              quotes, bullets, rollup — single Claude call
                             ↓
        persist (one episode → many segment rows + one card)
```

The cost delta: N segments (~50/day) → M episodes (~8/day). Roughly 6× reduction on the dominant cost lines, with content quality improvement as a side effect because Claude sees full episode context for each call.

### Why the inline-transcript hypothesis is high-stakes

`SearchResult` from Particle's mentions/search endpoints includes a `windows[].lines[]` array — line-level transcript text around each mention. If this context is rich enough for Claude to extract relevant moments, the separate `getClipTranscript` calls (the $2.03/day line item) become entirely unnecessary. Worst case: we still fetch per-episode transcripts (one call each, ~10× fewer than today). Best case: we eliminate them. The episode-level unit must investigate this before committing the prompt design.

### Decision flow for the model swap evaluation

```
                   Model Swap Evaluation (U7)
                  ────────────────────────────
              Cost baseline               Quality bar
              (per-episode             (user judges via
              call cost on a            inspect-card +
              real 49ers episode)       qa:screenshots)
                      │                     │
                      └──────────┬──────────┘
                                 ↓
            Comparison across at minimum:
            • Claude Haiku 4.5 (current baseline)
            • Gemini 2.5 Flash
            • Gemini 2.5 Flash-Lite
            • GPT-4.1 Nano
            • DeepSeek V4 Flash    (data-residency caveat)
            • Anthropic Batch API  (50% off Haiku, async)
                                 ↓
            Decision matrix:
            cost × structured-output-reliability × quality × latency
                                 ↓
            Output: model choice + evidence doc in docs/solutions/
```

---

## Unit Status

Last updated: 2026-05-13 (Phase A executed overnight; U2 root cause diagnosed later that day).

| Unit | Name | Status | Notes |
|------|------|--------|-------|
| **Phase A — Measurement, quick wins & iteration scaffolding** | | | |
| U2 | Anthropic prompt caching fix | **structurally shipped, DORMANT until U4** (commit `d4d605e`) | Marker placement is correct: `cache_control: { type: "ephemeral" }` on both `system[0]` and `tools[0]` in `summarize.ts:104,111` + `summarize-episode.ts:67,72`. 5 unit tests pass. **Root cause of the 0% cache hit rate: Claude Haiku 4.5's minimum cacheable prefix is 4,096 tokens, not the 2,048 the plan originally assumed.** Our current cacheable prefix (system + tools) is ~2,800 tokens, silently below the threshold; Anthropic returns 0/0 with no error when this happens. Verified via `scripts/debug-cache.ts` (kept in repo) — same code path with a padded ~7,921-token prefix caches perfectly. Decision: do NOT pad `SHARED_RULES` purely to clear the threshold — U4's per-episode extraction will rewrite the prompt with full episode transcripts in context, which naturally clears 4,096 tokens. U2 will activate automatically once U4 ships. Full learnings doc: `docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md`. |
| U1 | Per-team cost attribution on `api_calls` | **done** (commit `2fea304`) | Migration `0012_api_calls_team_id.sql` applied to live DB. `teamId` threaded factory-level through `createParticleClient` + `createAnthropicClient` + their inner `logCall`/`logApiCall` row-construction functions. Factory-time validation against `config/teams.ts` fails fast on misspelled team IDs. All three call sites pass `teamId: "49ers"`. `inspect-costs` gains `--group=team` and `--team=<id>` flags. 6 new unit tests. Live verified: every new api_calls row written under `team_id="49ers"`. |
| U3 | Verify list-call leak origin | **done** (commit `5802a0c`) | Built `scripts/inspect-list-calls.ts`. Diagnostic on live data: **127/127 list calls fall outside ingest run windows** — confirmed source is seed/test, not the daily worker. No code fix needed in the ingest path. Live-DB seed test now gated behind `PODIUM_RUN_LIVE_TESTS=true` env var (test suite went 40s → 2.2s). Solutions doc at `docs/solutions/2026-05-12-list-call-investigation.md`. |
| U8 | Force-reprocess flag (iteration scaffolding) | **done** (commit `705858c`) | `INGEST_FORCE_REPROCESS` env var added to `lib/env.ts` (mirrors `INGEST_DEV_MODE` pattern). `?force=1` query param parsed on `POST /api/ingest`, OR'd with env var, threaded to `runDailyIngestion` → `IngestPipelineInput.forceReprocess` → `filterAlreadyPersisted` bypass. 3 new unit tests: force=true propagates; default false; rate limit still fires under force. Live verified: `curl POST /api/ingest?force=1` re-summarized every segment ($0.97 in dev mode); rate-limit returned 429 on rapid repeat. |
| **Phase B — Structural cost reduction** | | | |
| U4 | Per-episode Claude pipeline (with content sign-off gate) | **code complete — awaiting live sign-off (blocked on Particle credits)** | Biggest lever. Stage 0 (2026-05-13): baseline ~$0.90/team/day, above $0.40 downscope threshold → proceed. Stage 1 (2026-05-13): full-episode transcript fetch + per-episode Claude call is the path. Stage 1.5 (2026-05-13): v0 A/B v0 verified quality-equivalent on cards [1] and [2]. User signed off. Stage 2 (2026-05-13): **built** `lib/anthropic/extract-episode-moments.ts` + types + system prompt (4,384 tokens, clears 4,096 cache minimum, verified cache_creation=4646 → cache_read=4646). Stage 3 (2026-05-13): **refactored `pipeline.ts`** to per-episode fan-out (`EPISODE_CONCURRENCY=5` replaces `SEGMENT_CONCURRENCY=5`); one `getClipTranscript` call per episode (no start/end filter — full transcript) + one `extractEpisodeMoments` call per episode → moments mapped to segment rows via `particle_segment_id`; `buildMomentTranscript` slices the full transcript per moment with 2s tolerance for `segments.raw_transcript`. Cleanup: deleted now-unused `summarize.ts`, `summarize-episode.ts`, `prompts/segment-summary.ts`, and `__tests__/lib/anthropic/summarize.test.ts`; moved shared helpers to `lib/anthropic/_helpers.ts`. 166 tests pass; build + lint clean. **U2 activates the moment a live ingest runs through this pipeline.** **Sign-off gate (blocked):** live ingest requires Particle credits, which were depleted by overnight force=1 runs. User flagged top-up as a deferred concern. Once credits restored, run one production-shape ingest → `npm run inspect-card -- all` → user reviews new card shape, prompt iterates until approved. |
| **Phase C — Iteration scaffolding** | | | |
| U5 | Prompt-version tagging (auto-refresh on prompt change) | **done — 2026-05-13** | Migration `0014_segments_prompt_version.sql` adds `segments.prompt_version text`, backfills existing rows to `'legacy'` so post-deploy filter is deterministic. `EPISODE_EXTRACTION_PROMPT_VERSION = "v1"` constant added to `lib/anthropic/types.ts`; bump manually when the prompt is intentionally changed. `filterAlreadyPersisted` now skips only rows whose stored version matches the current constant — mismatched (including legacy) rows flow back through extraction without a manual `?force=1`. Pipeline writes `prompt_version: EPISODE_EXTRACTION_PROMPT_VERSION` on every segment upsert. 2 new tests (version-mismatch re-process, write current version on insert). Existing cross-run-dedupe test updated to set `prompt_version: "v1"` on the fixture. 174 tests passing; build + lint clean. Migration applied to live DB. **First-deploy cost spike note:** the existing 4 cards' segments are now tagged `'legacy'` — the next live ingest (once Particle credits restored) will re-process them once under v1; subsequent runs return to baseline. |
| U6 | Cadence policy (per-team in-season/off-season) | **done — 2026-05-13** | Migration `0013_teams_cadence.sql` adds `teams.cadence_days` (default 1) as the canonical manual-override column. `config/teams.ts` carries the per-team season schedule: NFL `inSeasonMonths = [1,2,9,10,11,12]` (Sep–Feb) + `offSeasonCadenceDays = 3`. `effectiveCadenceDays(team, now)` returns 1 or 3 based on current UTC month. `runDailyIngestion` checks the most recent `*_run_complete` row in `system_alerts` for scheduled_run kind; short-circuits with kind=`skipped_cadence` when elapsed < cadence. Manual runs (POST /api/ingest) bypass cadence entirely. The cron route now iterates teams from the DB (single-team v1 unchanged, v2-ready). 6 new cadence tests + 4 new cron route tests pass. 172 tests total. Expected impact: ~50% reduction in scheduled-run cost during off-season (6 months × 1/3 frequency). |
| **Phase D — Model evaluation** | | | |
| U7 | Model swap evaluation | **not started** | Add `model` override to AnthropicClientOptions. Build evaluation harness running same 49ers episode through Claude Haiku 4.5, Gemini 2.5 Flash, Flash-Lite, GPT-4.1 Nano, DeepSeek V4 Flash, plus Anthropic Batch API. Score: cost, content quality (user judges), zod pass rate, latency, quote fidelity. **Eval-only API keys (Gemini, OpenAI, Grok, DeepSeek) live in `.env.local` only — explicitly NOT added to `lib/env.ts` or Vercel production env, to avoid bloating boot-time validation for keys production never uses.** **Hard call-count ceiling** (`MAX_EVAL_EPISODES = 5`, `MAX_EVAL_MODELS = 8`) in the harness, checked before the eval loop begins, to prevent runaway credit consumption if the loop is misconfigured. Output: data-backed decision + new solutions doc. |

### Next-session pickup (start here in a fresh chat)

Phase A is complete. U2 was diagnosed in a follow-up debugging session: the structural fix is correct but **dormant until U4 grows the prompt past Claude Haiku 4.5's 4,096-token caching minimum**. None of the four ranked suspects from the prior revision was the real cause — Anthropic was silently skipping caching because our ~2,800-token prefix is below the model's threshold. Full diagnosis and how-to-detect-this writeup at `docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md`. The diagnostic script `scripts/debug-cache.ts` is kept in-repo for future use (U7 model swap will need it to test each candidate's cache minimum).

**Start the next session on U4.** Stage 0 (clean baseline before refactor) is the very first step — read U4's section below for the staged plan. Stage 1 begins the investigation into `SearchResult.windows[].lines[]` as the transcript-fetch replacement. Multiple prompt iteration cycles are expected within U4 before user sign-off on content shape.

When U4 ships, **U2 verification gets reopened**: run `scripts/debug-cache.ts` against the new per-episode prompt (or watch `cache_creation_input_tokens` on the first live ingest call). If the episode-level prefix clears 4,096 tokens, caching will fire automatically and U2 graduates from dormant to verified.

### What's blocked on the user

1. **U4 Stage 1.5 quality verdict** (active, 2026-05-13) — user reviews `docs/solutions/2026-05-13-ab-output.txt` and confirms per-episode quality is at least equivalent to per-segment, OR directs U4 to downscope.
2. **U4 Stage 3 content-shape sign-off** — once Stage 2 builds the production module, user reviews `inspect-card` output and `qa:screenshots` after each prompt iteration; unit isn't done until user approves the shape.
3. **Model-swap decision in U7** — final pick requires user judgment on content quality from the side-by-side comparison.
4. **Particle credits depleted** — overnight force=1 runs exhausted credits. Need top-up before U4 can ship to production (the daily ingest depends on fresh transcript fetches). User has noted this as a deferred future blocker.

Nothing blocked on user for U1–U3, U5, U6 — those are mechanical. U2 is no longer blocked on diagnosis; it's parked until U4's larger prompt clears Haiku's 4,096-token cache minimum.

---

## Implementation Units

8 units across 4 phases. Phase A is foundational and must complete before Phase B. Within Phase A, order is **U2 → U1 → U3 → U8**: U2 first because it's the highest-confidence quick win (~1 hour, the visible Anthropic cost drop is the early evidence the plan's premise works); U1 second to precisely measure that win with per-team attribution; U3 third to verify the list-call leak is harmless; U8 fourth to land the iteration-loop scaffolding U4 will need. Phases C and D can run in parallel after Phase B.

---

### U1. Per-team cost attribution on `api_calls`

**Goal:** Make CE1 measurable. Add `team_id` to `api_calls` so the success metric is grounded in real per-team data, not estimated from total spend.

**Requirements:** CE1, CE3.

**Dependencies:** none.

**Files:**
- `supabase/migrations/0012_api_calls_team_id.sql` (new)
- `lib/particle/tracked-call.ts` (modify — add `teamId` to `TrackedCallOptions`; pass through to insert)
- `lib/anthropic/client.ts` (modify — add `teamId` to `AnthropicClientOptions`; pass through to `logApiCall`)
- `lib/particle/client.ts` (modify — `createParticleClient` accepts and propagates `teamId`)
- `lib/ingest/pipeline.ts` (modify — pass `input.teamId` to client factory or per-call options)
- `lib/ingest/run.ts` (modify — thread `teamId` into client construction)
- `app/api/ingest/route.ts`, `app/api/cron/daily-digest/route.ts`, `app/(app)/actions.ts` (modify — all client constructions pick up the new parameter)
- `scripts/inspect-costs.ts` (modify — add `group=team` and `team=<id>` flag support)
- `__tests__/lib/particle/tracked-call.test.ts` (modify — assert `team_id` written when option passed)
- `__tests__/lib/anthropic/client.test.ts` (modify — assert `team_id` written when option passed)

**Approach:**

1. Migration: `alter table api_calls add column if not exists team_id text;` Nullable, no FK (lightweight, avoids cascade entanglement). Backfill is not needed — historical rows stay null and inspect-costs treats null as "unknown team."
2. Thread `teamId` factory-level into `createParticleClient` and `createAnthropicClient`. Both factories already accept `{ supabase }` options objects — add `teamId?: string` to those. **Implementation detail:** `team_id` must thread all the way through to the row-construction functions — `logCall` in `lib/particle/tracked-call.ts` (lines 263–299) and `logApiCall` in `lib/anthropic/client.ts` (line 122) each build the `api_calls` insert object locally. Both need `team_id: opts.teamId` added to the insert payload. Adding only to the factory options is insufficient — the inner functions read from `TrackedCallOptions` / per-call operation metadata, which must carry the value through. **Validate `teamId` against `config/teams.ts`** at factory-construction time — assert it matches one of the known team IDs. Avoids future-v2 misattribution when multiple teams' pipelines run on shared factory instances. A nullable column tolerates `undefined` callers (legacy rows), but explicit `teamId` values must be valid.
3. Update inspect-costs to support `--group=team` and `--team=<id>` flags. Output adds a "by team" section when grouping is requested.
4. Update the `remainingStarterCreditUsd` query in `lib/ingest/run.ts` to optionally scope to a specific `team_id` (single-team v1 = same result either way; v2-ready).

**Patterns to follow:**
- Factory-pattern client construction (see existing `createParticleClient`, `createAnthropicClient`).
- Best-effort telemetry (insert failures log but don't propagate).
- Migration naming convention `00NN_descriptive_name.sql`.

**Test scenarios:**
- **Happy path:** `tracked-call` with `teamId: "49ers"` option writes `api_calls` row with `team_id: "49ers"`.
- **Backward compat:** `tracked-call` without `teamId` writes `api_calls` row with `team_id: null` (no crash).
- **Anthropic path:** same two scenarios on `AnthropicClient.createMessage`.
- **inspect-costs --group=team:** with seeded rows for two teams, the script outputs per-team subtotals correctly.
- **inspect-costs --team=49ers:** filters to only that team's rows.

**Verification:**
- Migration applies cleanly to the live project.
- After one ingest run, `select team_id, count(*) from api_calls where ts > now() - interval '1 hour' group by 1` shows `49ers` populated.
- `npm run inspect-costs -- group=team` runs without error.
- 178 existing tests still pass; new tests cover the additions.

---

### U2. Anthropic prompt caching fix

**Goal:** Drive Anthropic cache hit rate from 0% toward the designed ~90%. Required for CE2.

**Requirements:** CE2.

**Dependencies:** U1 (so we can verify per-team Anthropic cost drops in `inspect-costs`).

**Files:**
- `lib/anthropic/summarize.ts` (modify — line 107, add `cache_control` to tools entry)
- `lib/anthropic/summarize-episode.ts` (modify — line 70, same change)
- `__tests__/lib/anthropic/summarize.test.ts` (modify — assert tools entry carries `cache_control`)
- `__tests__/lib/anthropic/summarize-episode.test.ts` (modify — same assertion)

**Approach:**

The cacheable prefix in Anthropic's caching model is `system blocks + tools + initial messages`. The breakpoint (`cache_control` marker) must sit on the *last* element of the prefix you want cached. Today the marker is only on the system block, which means the tools array falls outside the cache key. Two calls with identical system + tools differ in cache lookup terms because the breakpoint position doesn't span the tools.

Fix: add `cache_control: { type: "ephemeral" }` to the `TOOL_DEFINITION` block in both summarizers. The SDK's `Tool` interface (`messages/messages.d.ts:1134`) already accepts this field.

**Alternative the SDK exposes:** `MessageCreateParams` has a top-level `cache_control` field (`messages.d.ts:1983`) that automatically applies a cache_control marker to the last cacheable block in the request. The plan's approach (annotating the tool directly) is more explicit and preferred — the auto-apply route is noted here in case the explicit annotation produces unexpected results during verification.

~~Token-count sanity check from repo research: `SHARED_RULES` alone is ~1,891 tokens; combined with team context (entity list + storyline list) the system block clears the 1,024-token minimum prefix requirement Anthropic enforces. The prefix is well over threshold — caching is viable.~~

**Correction (2026-05-13 diagnosis):** Claude Haiku 4.5's actual minimum cacheable prefix is **4,096 tokens, not 1,024**. The original sanity check used the wrong number. Our current prefix at ~2,800 tokens is below threshold; Anthropic silently skips caching when this happens, returning 0/0 on both cache_creation_input_tokens and cache_read_input_tokens with no error. U2's structural marker placement is correct and will activate automatically once U4's per-episode prompts (which carry full episode transcripts in the cached context) push the prefix past 4,096. See `docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md` for the full diagnosis and `scripts/debug-cache.ts` for the verification tool.

**Patterns to follow:**
- Existing cache_control marker pattern in `summarize.ts:100–106`.
- Anthropic SDK `Tool` type for the augmented shape.

**Test scenarios:**
- **Marker present on system block:** existing test, retained.
- **Marker present on tool definition:** new assertion — `baseParams.tools[tools.length - 1].cache_control` deeply equals `{ type: "ephemeral" }`.
- **Same change on summarize-episode:** parallel assertion.

**Verification:**
- After deploying the fix, trigger one ingestion run (the dev-mode path, ~$1).
- `npm run inspect-costs -- since=<today>` Anthropic detail section reports cache hit rate ≥80% (the first call per session primes the cache; subsequent calls hit). **AND** Anthropic cost component per ingest run drops by ≥50% vs prior runs. (Cache hit rate alone is necessary but not sufficient — if the cacheable prefix is small relative to the dynamic transcript context, 90% off prefix yields a smaller real cost reduction than the math suggests. Verify both metrics.)
- If the rate stays at 0%, or if the rate climbs but Anthropic cost barely moves, the bug or the impact assumption is wrong — investigate before proceeding.

---

### U3. Verify list-call leak origin

**Goal:** Confirm that `entities.list` + `podcasts.list` calls in `api_calls` come from seed-time activity (not the ingest runtime), and document the finding. Gate live-API tests behind an explicit opt-in flag if they're contributing to noise.

**Requirements:** None directly — this is a data-hygiene verification.

**Dependencies:** U1 (so future runs are team-attributed and easier to slice).

**Files:**
- `docs/solutions/2026-05-12-list-call-investigation.md` (new — captures the finding)
- `__tests__/lib/seed/index.test.ts` (potentially modify — strengthen the live-API gate)
- `package.json` (potentially modify — separate `test` and `test:live` scripts if the gate change requires it)

**Approach:**

1. Cross-reference all `entities.list` + `podcasts.list` entries in `api_calls` (currently 65 + 62 = 127 rows) against `system_alerts` rows of kind `manual_run` / `scheduled_run`. If list-call timestamps fall outside any ingest run window, they're not coming from the daily worker.
2. The repo research's prediction is that they come from:
   - `lib/seed/index.ts` runs via `npm run seed`
   - `__tests__/lib/seed/index.test.ts` — the `describe.skipIf(!haveEnv)` gate fires when `NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + PODIUM_USER_ID` are present (which they are locally), AND the `afterAll` block re-resolves real IDs when `PARTICLE_API_KEY` is in env.
3. If confirmed, the verification is the fix: no code change needed for the daily worker.
4. Recommend: add an explicit `PODIUM_RUN_LIVE_TESTS=true` env var to gate live-API tests so a casual `npm test` doesn't burn ~$0.25 in unintended list calls.
5. Write `docs/solutions/2026-05-12-list-call-investigation.md` capturing the cross-reference query, the conclusion, and any policy decisions.

**Patterns to follow:**
- `docs/solutions/` learning doc convention with frontmatter (date, topic, applicability).

**Test scenarios:**
- **Test expectation: none** — this is an investigation + documentation unit, not a behavioral change.
- If the live-test gate is strengthened, an existing test continues to pass under the new gate. Asserting on the gate itself adds little value.

**Verification:**
- Solutions doc exists with the cross-reference SQL query, the data showing list-call timestamps falling outside ingest run windows, and a clear conclusion.
- If gate-strengthening shipped, `npm test` no longer hits the live Particle API (verify by inspecting `api_calls` ts range after a test run).

---

### U8. Force-reprocess flag (iteration scaffolding for U4)

**Goal:** Ship the `INGEST_FORCE_REPROCESS` env var + `?force=1` query param BEFORE U4 so its 3–5 prompt iteration cycles don't require manual DB cleanup. Split from the original combined U5 to land in Phase A. Version-mismatch reprocessing remains in U5.

**Requirements:** CE5 (partial — covers the iteration-loop affordance; CE5's "auto-refresh on prompt change" lands in U5).

**Dependencies:** none (independent of U1/U2/U3).

**Files:**
- `lib/env.ts` (modify — add `INGEST_FORCE_REPROCESS` to optional server vars, default `false`)
- `lib/ingest/run.ts` (modify — read `INGEST_FORCE_REPROCESS` env var; accept `forceReprocess: boolean` in input; thread through to pipeline)
- `lib/ingest/pipeline.ts` (modify — `filterAlreadyPersisted` accepts a force flag; when true, returns all input segments unfiltered)
- `app/api/ingest/route.ts` (modify — accept `?force=1` query param; OR with env var; pass to `runDailyIngestion`)
- `__tests__/lib/ingest/run.test.ts` (modify — assert force flag propagates)
- `__tests__/lib/ingest/pipeline.test.ts` (modify — assert filter bypass under force)
- `__tests__/app/api/ingest/route.test.ts` (modify — assert `?force=1` parsed and threaded)

**Approach:**

1. `lib/env.ts`: `INGEST_FORCE_REPROCESS: z.enum(["true","false"]).default("false").transform((v) => v === "true")` (mirrors `INGEST_DEV_MODE` pattern).
2. `runDailyIngestion` accepts `forceReprocess?: boolean` in its input; resolves to `forceReprocess ?? env.INGEST_FORCE_REPROCESS`.
3. `filterAlreadyPersisted` accepts the force flag; when true, returns input unchanged (no dedup query).
4. POST `/api/ingest`: parse `new URL(request.url).searchParams.get("force") === "1"`; pass to `runDailyIngestion`.
5. **Preserve the 60s rate limit on `manual_run`:** force bypasses dedup only, not the rate limit. Verify with explicit test scenario.

**Patterns to follow:**
- Existing `INGEST_DEV_MODE` env var threading pattern.
- Existing query-param parsing on the manual ingest route.

**Test scenarios:**
- **Happy path (force off):** dedup runs as today; existing segments are skipped.
- **Env var on:** `INGEST_FORCE_REPROCESS=true` causes pipeline to re-process every found segment.
- **Query param on:** `POST /api/ingest?force=1` re-processes every found segment for that run, even without the env var.
- **Rate limit preserved under force:** two `?force=1` calls within 60s; second returns 429 like today's flow.
- **No DB write before auth:** unauthenticated request with `?force=1` returns 401; no `system_alerts` row, no DB activity.

**Verification:**
- `INGEST_FORCE_REPROCESS=true npm run dev` then triggering ingestion re-processes all existing segments (~$0.50–1.00 in dev mode).
- `npm run inspect-costs -- since=<run start>` shows a one-time bump; no recurring spike.

---

### U4. Per-episode Claude pipeline (with content-shape sign-off gate)

**Goal:** Replace the per-segment Claude pass with a per-episode pass. Cuts the dominant cost line (transcript fetches + segment Claude calls) by ~6×. Improves content quality by giving Claude full episode context. **Ships only when the user has approved the new card shape.**

**Requirements:** CE4, CE8. Also unblocks CE1 (this is the single biggest cost cut).

**Dependencies:** U1 (for measurement), U2 (caching must work — episode prompts have large system prefixes that depend on cache hits), U3 (clean cost baseline — list-call leak resolved before measuring U4's ≥50% reduction), U8 (force-reprocess flag — required for cheap prompt iteration within the unit's sign-off cycle).

**Files:**
- `lib/ingest/pipeline.ts` (significant modify — refactor lines 137–171 from segment-fan-out to episode-fan-out)
- `lib/anthropic/extract-episode-moments.ts` (new — replaces per-segment summarize; produces structured output covering all relevant moments in one call)
- `lib/anthropic/prompts/episode-extraction.ts` (new — system prompt for the new pass)
- `lib/anthropic/types.ts` (modify — add `EpisodeExtractionInput`, `EpisodeMoment`, `EpisodeExtractionOutput` types)
- `lib/anthropic/summarize.ts` (delete OR keep as fallback — TBD based on whether per-segment summarization still serves any code path)
- `lib/anthropic/summarize-episode.ts` (potentially merge into the new extraction call, or keep separate for the rollup)
- `__tests__/lib/anthropic/extract-episode-moments.test.ts` (new)
- `__tests__/lib/ingest/pipeline.test.ts` (significant modify — pipeline shape changes)
- `__tests__/lib/ingest/run.test.ts` (modify if necessary)
- `docs/solutions/2026-05-12-episode-extraction-prompt.md` (new — captures the prompt design and the iterations)

**Approach:**

This unit has three distinct sub-stages, each with verification:

**Stage 0 — Establish a clean baseline (pre-flight check).**
- Before committing to U4's refactor, take one clean production-shape baseline: trigger ONE ingestion run with no force flag, no dev-mode, no reprocessing. Wait for it to complete.
- Run `npm run inspect-costs -- since=<that run's start time>` and record the per-team daily cost.
- **Decision point:** if the post-U2 baseline is already within 2× of $0.20/day (i.e., ≤$0.40/day), U4's content-shape risk may not be worth taking. Consider downscoping to caching+inline-windows only and skipping the prompt-architecture refactor.
- Capture the decision and the baseline numbers in `docs/solutions/2026-05-12-episode-extraction-prompt.md`.

**Stage 1 — Investigate the inline-transcript hypothesis.**
- Pull a real episode's `SearchResult` from `searchEntityMentions` and inspect the `windows[].lines[]` payload size and content. **Important: investigate both mention sources separately** — `ParticleMentionResult` (returned by `searchEntityMentions`, per-entity) has `windows[].lines[]` but NOT a full segment object with `audio_url`/`title`/`description`/`summary`. `ParticleSearchResult` (returned by `searchByContent`, per-storyline) DOES have a proper segment object. The extraction prompt will need to work with both shapes; understand the context-richness difference before writing the prompt.
- Determine if the concatenated line-level transcript snippets surrounding each mention are sufficient context for Claude to write substantive summaries + accurate pull quotes.
- **Persistence shape decision (committed at plan time, 2026-05-12):** the extraction prompt MUST preserve Particle segment boundaries — each `EpisodeMoment` carries the originating `particle_segment_id`, the existing UNIQUE constraint + `onConflict` upsert path is unchanged, and idempotency is preserved. Stage 1 verifies the prompt can hold this constraint while still producing high-quality content; if Claude consistently wants to merge or split segments to produce better summaries, escalate as a Stage 1 contingency rather than auto-relaxing the constraint. The two alternatives considered and rejected: (a) adding a new `moment_id` column with its own uniqueness (rejected — requires schema migration + idempotency rewrite); (b) dropping the `particle_segment_id` UNIQUE constraint entirely (rejected — most flexible but largest implementation footprint and risks duplicate-row bugs on re-runs).
- Decision point on transcript source:
  - **If inline sufficient:** the new pipeline doesn't call `getClipTranscript` at all — eliminates the entire $2.03/2-day transcript-fetch line. Expected outcome.
  - **If insufficient (broader episode context needed):** add `getEpisodeTranscript` (one call per episode instead of per segment).
- **Also decide at Stage 2 conclusion:** the disposition of `lib/anthropic/summarize.ts` and `lib/anthropic/summarize-episode.ts` — deleted, kept as fallback, or merged into the new module. Capture the decision in the solutions doc so the file-list TBD doesn't carry through the unit.
- Capture all Stage 1 decisions and the underlying data in `docs/solutions/2026-05-12-episode-extraction-prompt.md`.

**Stage 1.5 — Quality A/B vs. current per-segment baseline.**
- Pick 3 representative 49ers episodes (one team-specific show with rich coverage, one national show with passing mentions, one borderline). Use the existing 4 cards in DB as candidates if they're representative.
- Run each through BOTH the current per-segment summarizer AND a v0 per-episode extraction prompt (built quickly for the A/B; doesn't need to be production-quality yet).
- User compares output blind via `npm run inspect-card -- N` for each pair: which version produces more substantive summaries, more accurate pull quotes, fewer hallucinated moments?
- **Decision point:**
  - **If per-episode is at least equivalent quality:** proceed to Stage 2 with the architectural shift.
  - **If per-episode is materially worse on the sample:** restructure U4 to KEEP per-segment summarization but ship the caching + inline-window optimizations. Loses the 6× call-count reduction but avoids quality regression. Update CE1 expectations downward in this case.
- A/B cost: ~$2 in eval spend. Cheap compared to discovering quality regression at Stage 3 after building the full pipeline.
- Capture the A/B output (sample cards, user assessment) in `docs/solutions/2026-05-12-episode-extraction-prompt.md`.

**Stage 2 — Build the extraction call.**
- New module `lib/anthropic/extract-episode-moments.ts` exposing `extractEpisodeMoments(input)` that returns one structured response covering all relevant moments for a single episode in a single Claude call.
- Forced tool use pattern (same shape as existing `submit_segment_analysis`), but the tool output is an array of moments per call, not one moment per call.
- Each moment carries: start_seconds, end_seconds, summary, pull_quotes, bullets, surfacing_entities. Plus optional episode-level rollup if we keep the dual-pass model.
- Tool definition carries `cache_control: { type: "ephemeral" }` from the start (U2 pattern).

**Stage 3 — Refactor the pipeline and iterate on shape with the user.**
- Pipeline groups mentions by episode FIRST, then runs episode-level extraction in bounded concurrency.
- New constant `EPISODE_CONCURRENCY = 5` replaces `SEGMENT_CONCURRENCY = 5` in pipeline.ts.
- Persistence shape: episode-level moments → segment rows (compatible with existing `cards`/`segments` schema). The `summarizeEpisode` rollup either merges into the extraction call or stays as a separate call.
- **Sign-off gate:** after shipping the new prompt, run `npm run inspect-card -- all` and `npm run qa:screenshots -- card=N` for at least 2–3 cards. Share output with the user. Iterate on the prompt based on user feedback until the content shape is approved. Unit is NOT done until user signs off.

**Execution note:** Stage 1 is investigation-only — no implementation until the inline-transcript decision is made. Stages 2–3 are tightly coupled and may iterate multiple times before user sign-off.

**Patterns to follow:**
- Forced tool use pattern from existing `summarize.ts`.
- Quote fidelity check (substring match after curly→straight quote normalization) from `summarize.ts`.
- Single retry on schema/fidelity failures via `tool_result` block.
- `server-only` import marker convention.

**Test scenarios:**
- **Happy path:** mock Anthropic returning a valid `EpisodeExtractionOutput` with 3 moments; assert all 3 are returned as parsed objects matching the schema.
- **Quote fidelity:** mock response includes a pull_quote not present in transcript; assert the helper rejects and retries; after second failure, returns null for that moment (but other valid moments survive).
- **Off-topic episode:** mock response with `is_team_relevant: false` (or moments array empty); assert pipeline drops the episode (no card created).
- **Schema failure recovery:** mock prose-instead-of-tool-call on first attempt, valid tool-call on retry; assert success.
- **Pipeline integration:** mock 3 episodes each with 5 mentions; assert exactly 3 Anthropic calls fire (one per episode), 3 cards persisted.
- **Concurrency bound:** mock 12 episodes, assert no more than 5 Anthropic calls in flight at once (verified via call-order assertions).
- **Inline transcript path:** if Stage 1 concludes inline is sufficient, mock a search response with `windows[].lines[]` populated; assert pipeline does NOT call `getClipTranscript` for that episode.
- **Episode-transcript fallback path:** if Stage 1 concludes broader context is needed, mock the fallback path; assert one transcript call per episode (not per segment).
- **Cost telemetry:** after a run, `api_calls` shows one `anthropic/extract_episode_moments` row per episode, with `team_id` populated (from U1).

**Verification:**
- All tests pass.
- `npm run inspect-card -- 0` (and ≥1 other card) produces output that the user reviews and signs off on.
- `npm run qa:screenshots -- card=0` produces a rendered card image; user signs off on visual shape.
- `npm run inspect-costs -- since=<date> group=team` shows the per-team Anthropic + Particle transcript cost dropping by ≥50% vs. pre-U4 baseline.
- Solutions doc `2026-05-12-episode-extraction-prompt.md` captures the final prompt, the inline-vs-fetched-transcript decision, and key iteration history.

**Contingencies:**
- **If the inline transcript proves insufficient and full episode transcripts are too expensive (e.g., $0.04/episode):** fall back to fetching only when mentions count >2 per episode (the cases that justify the extra fetch); use inline-only for single-mention episodes.
- **If user can't approve any prompt iteration after 5 attempts:** stop iterating and escalate. The unit is genuinely blocked on content shape, not engineering. Two paths from here: (a) accept the current per-segment content quality and ship the caching + inline-window cost wins only (skip the prompt-architecture shift), or (b) escalate to a content-architecture redesign as a separate plan. Do NOT iterate indefinitely — a sixth iteration is rarely meaningfully different from the fifth.

---

### U5. Prompt-version tagging (auto-refresh on prompt change)

**Goal:** Future prompt changes auto-trigger re-processing on the next daily run, without manual force-flag intervention. Catches prompt drift at the daily cron without per-deploy ceremony.

**Requirements:** CE5 (the auto-refresh half — U8 covers the iteration-loop half).

**Dependencies:** U4 (the prompt shape stabilizes here; versioning catches future iterations), U8 (the force flag is the manual-override path; U5's auto-refresh is the automatic-on-change path).

**Files:**
- `supabase/migrations/0013_segments_prompt_version.sql` (new)
- `lib/anthropic/types.ts` (modify — add `EPISODE_EXTRACTION_PROMPT_VERSION` constant)
- `lib/ingest/pipeline.ts` (modify — write `prompt_version` on segment rows; pipeline filter respects `prompt_version != current_version`)
- `__tests__/lib/ingest/pipeline.test.ts` (modify — assert filterAlreadyPersisted bypasses re-process when version changed)

**Approach:**

1. Migration: `alter table segments add column if not exists prompt_version text;` (also `cards` if we keep the rollup separate).
2. Version constant: `export const EPISODE_EXTRACTION_PROMPT_VERSION = "v1" as const;` in `lib/anthropic/types.ts`. Bump manually when the prompt is intentionally changed.
3. Pipeline write: every segment row written carries the current version.
4. Pipeline filter (modifies the existing `filterAlreadyPersisted`): skip segments already in DB IF version matches current; re-process if version differs. Force flag from U8 still bypasses this filter entirely.

**First-deploy cost spike:** When U5 ships, all existing segment rows have `prompt_version = null`. PostgREST equality semantics treat `null != "v1"` as null (not true), so the version-equality filter `eq("prompt_version", CURRENT_VERSION)` will NOT skip null-version rows — every existing segment qualifies as "unprocessed" on the first run after U5 ships. Expect a one-time re-processing event covering all historical segments (~50–200 segments × per-segment cost). Plan for this either by (a) using `?force=1` explicitly on the first run after deploy to control the spike, or (b) running a one-time backfill setting `prompt_version` on existing rows to a sentinel (e.g., `"legacy"`) so the version-mismatch filter behaves deterministically. Backfill is the recommended path.

**Patterns to follow:**
- Existing version constant pattern (`ANTHROPIC_MODEL` at `lib/anthropic/types.ts:113`).
- Existing `INGEST_DEV_MODE` env var threading pattern.

**Test scenarios:**
- **Happy path — version match:** existing segment in DB at v1, current code v1; segment is skipped on re-run.
- **Version mismatch:** existing segment at v0, current code at v1; segment is re-processed (re-fetches transcript, re-extracts).
- **Legacy backfill sentinel:** existing segment with `prompt_version = 'legacy'`, current code at v1; segment is re-processed.
- **Force from U8 still works:** `?force=1` re-processes regardless of version match (verifies U8 still functions after U5's filter change).

**Verification:**
- Migration applies cleanly.
- Run the one-time backfill setting historical rows to `prompt_version = 'legacy'`.
- Bumping the version constant + re-running the cron causes existing segments to be re-extracted (verify by checking `prompt_version` updates in DB).
- `npm run inspect-costs` shows a one-time bump on first deploy (if backfill skipped) or on intentional version bumps; baseline returns afterward.

---

### U6. Cadence policy (per-team in-season/off-season)

**Goal:** Reduce off-season ingestion frequency to cut ~50% of annual cost. Per-team-aware so different sports' seasons are respected.

**Requirements:** CE6.

**Dependencies:** none (independent of U4/U5).

**Files:**
- `supabase/migrations/0014_teams_cadence.sql` (new — add `cadence_days int default 1` to teams)
- `config/teams.ts` (modify — add per-team season metadata: `inSeasonMonths: number[]`, `offSeasonCadenceDays: number`)
- `lib/ingest/run.ts` (modify — `computeSinceTimestamp` or new `shouldRunForTeam` short-circuits the run when too soon)
- `lib/ingest/types.ts` (modify if new types needed)
- `app/api/cron/daily-digest/route.ts` (modify — iterates teams; calls runDailyIngestion only for teams whose cadence elapsed)
- `__tests__/lib/ingest/run.test.ts` (modify — assert short-circuit behavior)

**Approach:**

1. Migration adds `cadence_days int not null default 1` to teams. v1 single-team stays at default 1 (no behavior change until config is set).
2. Season config in `config/teams.ts`: per-team `inSeasonMonths: number[]` (e.g., 49ers in-season = Aug–Feb) and `offSeasonCadenceDays: number` (e.g., 3 days for NFL off-season). The cron handler computes "today's cadence" as 1 if in-season-month, otherwise `offSeasonCadenceDays`. **NFL season note: regular season + playoffs is roughly September through early February (~6 months in-season, ~6 months off-season).** This is shorter than some descriptions in this doc imply — the cost-averaging math should be checked against a 6/6 split, not 5/7.
3. `runDailyIngestion` checks the latest successful run's timestamp from `system_alerts` and short-circuits if `(now - lastSuccess) < cadenceDays * 24 * 3600`. Writes a `system_alerts` row of kind `skipped_cadence` for observability. **Auth invariant:** the cadence check and `system_alerts.skipped_cadence` write happen INSIDE `runDailyIngestion`, which is called only after the route's auth check passes. The route handler must not call `runDailyIngestion`, query `system_alerts` cadence state, or write any DB row before the bearer-token check.
4. Manual override always available: `POST /api/ingest` ignores cadence (or `?force=1` from U5).
5. **Cron team-iteration design (decided at plan time):** the cron route (`app/api/cron/daily-digest/route.ts`) currently hardcodes `TEAM_ID = "49ers"`. After U6, the route queries the `teams` table for all teams via the admin client, iterates them, and calls `runDailyIngestion` for each whose cadence has elapsed. In v1 single-team this returns one row and is operationally equivalent to today; the iteration loop is structural prep for v2. `app/(app)/actions.ts`'s `retryDailyIngestion` keeps its hardcoded team (manual override is intentionally per-team) and is NOT modified by U6 — list it under Patterns to follow as a deliberate non-change.

**Patterns to follow:**
- Existing `system_alerts` event types convention (add `skipped_cadence`).
- Existing `config/teams.ts` shape.

**Test scenarios:**
- **In-season run:** `inSeasonMonths` includes current month; `lastSuccess` is 25 hours ago; cadence is 1; run proceeds.
- **Off-season short-circuit:** `inSeasonMonths` excludes current month; `offSeasonCadenceDays` = 3; `lastSuccess` is 25 hours ago; run short-circuits with `skipped_cadence` row.
- **Off-season cadence elapsed:** same as above but `lastSuccess` is 72 hours ago; run proceeds.
- **Manual override:** `?force=1` on the POST route bypasses cadence regardless.
- **First run (no lastSuccess):** cadence check passes (no prior run to compare to); run proceeds.
- **Cross-team independence:** in v1 single-team this is academic, but a unit test should assert different teams' cadences are evaluated independently.

**Verification:**
- Migration applies cleanly.
- For v1 single team in off-season, the cron stops firing daily (visible in `system_alerts` — `skipped_cadence` rows on most days, `scheduled_run_complete` every 3 days).
- `npm run inspect-costs` shows the per-day cost drop during the off-season window.

---

### U7. Model swap evaluation

**Goal:** Data-driven decision on which LLM serves Podium's use case best. Either commit to a model swap with evidence, or commit to staying on Claude Haiku with evidence.

**Requirements:** CE7.

**Dependencies:** U4 (we evaluate the per-episode prompt across providers, so the prompt shape must be stable).

**Files:**
- `lib/anthropic/client.ts` (modify — add `model` override to `AnthropicClientOptions`; change `ANTHROPIC_MODEL` from `const` to runtime-configurable)
- `scripts/eval-models.ts` (new — single throwaway script: runs the same 49ers episode through multiple models inline using each provider's SDK directly. Captures cost/latency/output per (model × episode))
- `docs/solutions/2026-05-12-model-evaluation.md` (new — captures the matrix and the decision)
- `package.json` (modify — add `eval-models` script, plus deps for the chosen evaluation SDKs)

**Approach:**

This unit is structured as an evaluation, not a production code change. Output is a decision documented in `docs/solutions/`. If the decision is to switch, a small follow-up commit (or a Phase E unit) does the switch.

1. **Single throwaway script at `scripts/eval-models.ts`** — calls each provider's SDK inline (no shared abstraction). Captures cost, latency, structured-output result, and an `inspect-card`-style output dump per (model × episode). Throwaway code; if a swap is adopted, the production code path gets its own clean abstraction in a follow-up. If no swap, the script is deleted.

2. **Models to evaluate at minimum:**
   - Claude Haiku 4.5 (current baseline, with caching from U2)
   - Anthropic Batch API with Haiku 4.5 (50% off, async — evaluate if tolerable for daily-digest UX)
   - Gemini 2.5 Flash ($0.30 / $2.50, with $0.03 cached input)
   - Gemini 2.5 Flash-Lite ($0.10 / $0.40)
   - GPT-4.1 Nano ($0.10 / $0.40 with 75% cache discount)

3. **Optional second batch if budget permits:**
   - Grok 3 Mini ($0.30 / $0.50, 131K context — tight for our use case)
   - GPT-5.4 Nano ($0.20 / $1.25 with 90% cache discount)

**Explicitly excluded from this evaluation:** DeepSeek V4 Flash. Even though it's the cheapest viable option on raw token pricing, its API is hosted in China and podcast transcripts (player quotes, opinions about teams, potentially sensitive editorial content) would transit a cross-jurisdiction data boundary. Decision made at plan time (2026-05-12): not worth the data-residency risk for a US sports app. Revisit if Podium ever offers a self-hostable mode or DeepSeek opens a non-China region.

4. **Evaluation matrix (per model):**
   - Per-episode call cost (real measurement against a 49ers podcast episode)
   - Structured output reliability (zod validation pass rate over 5+ episodes)
   - Latency (p50, p95)
   - Quote fidelity (substring match rate; how often does the model invent quotes?)
   - Content quality (user judges via inspect-card output — same episode, side-by-side comparison)
   - Prompt caching support + observed hit rate
   - Total cost projection per-team-per-day at production scale

5. **Decision output:** `docs/solutions/2026-05-12-model-evaluation.md` with the matrix, scored cells, and a recommendation. User makes the final call based on the data; agent can recommend but does not unilaterally switch.

6. **Explicit cost-trigger threshold for adoption:** the recommendation should be framed as "switch IF winner beats Claude by ≥30% on per-team-per-day cost projection AND content-quality is at least equivalent in user blind comparison." Below that threshold, the engineering cost of swapping providers (rewriting tool-calling format, integrating new SDK, validating in production) is not justified by the savings. State this threshold up front so the matrix is read against it.

7. **Particle paid-tier checkpoint:** before running the eval harness, verify Particle's paid-tier per-call pricing matches the pricing model in `unit-economics.md`. If pricing has shifted from the Starter-tier numbers used in the cost model, update CE1's per-team-day projections (and possibly CE1's target) before proceeding. Otherwise the model-eval matrix will be projecting against stale Particle pricing.

6. **If decision is to swap:** the matrix doc itself flags follow-up work; switch lands in a separate commit (or new mini-unit U8). If decision is to stay on Claude: doc captures the evidence backing the decision.

**Patterns to follow:**
- `docs/solutions/` doc convention for the evaluation writeup.
- Forced tool use / JSON-mode for structured output across all providers.
- Existing inspect-card output as the comparison medium (user reads the actual generated content per model).

**Test scenarios:**
- **Eval harness sanity test:** running the harness with a stubbed provider returns expected `ModelEvalResult` shape.
- **Schema validation:** the harness rejects model outputs that fail zod parsing AND records the failure in the matrix (rather than crashing).
- **Cost measurement:** harness reads provider response metadata (token counts, headers, etc.) and computes USD spend per the documented pricing table.

**Verification:**
- The eval harness runs end-to-end against ≥4 models on ≥3 different 49ers episodes (different shows, different segment counts).
- `docs/solutions/2026-05-12-model-evaluation.md` exists with the matrix populated, evidence for each cell, and a clear recommendation.
- User reviews the recommendation and approves either (a) commit a model swap as a follow-up, or (b) stay on Claude with the evidence on file.
- The Anthropic `model` override is wired and functional (independent of which model we end up using).

---

## Scope Boundaries

### In scope (this plan)

- All seven workstreams above.
- Per-team cost attribution as the measurement foundation.
- Content-shape sign-off as a hard gate on the biggest unit.

### Deferred for later (separate v2 plan: multi-tenant ingest sharing)

**Multi-tenant ingest sharing — explicitly out of scope; gets its own plan.**

The architecture today runs one ingestion per (team, user). When v2 opens to a second user, we need to run ingestion once per team and share the resulting cards/segments across all users following that team. This is required for the unit-economics math at scale (`docs/strategy/unit-economics.md` §"How multi-tenant sharing makes the math work").

This work touches: RLS policies (cards become a shared content model with per-user feedback overlay, or a copy-on-read model with shared upstream), the ingest runner (needs to know about subscribers, not just userId), the schema (`cards.user_id` semantics shift, maybe a new `team_card` table), and the cost-attribution path from U1 (per-team cost spreads across user subscribers).

**Capture for future plan:** when "open to 2nd user" is on the horizon, create `docs/plans/YYYY-MM-DD-NNN-refactor-multi-tenant-ingest-plan.md`. This sentence is the breadcrumb.

### Outside this product's identity (carry-forward from v1 plan)

- Hosting podcast audio.
- General-purpose podcast app or "Spotify for sports."

### Deferred to Follow-Up Work (plan-local)

- **Multi-provider abstraction layer in production code.** U7's eval harness uses a throwaway abstraction. If we adopt a swap, the production path gets a proper abstraction in a follow-up unit (call it U8 if it lands).
- **`segments.raw_transcript` jsonb/string type mismatch.** Repo research surfaced a latent bug: the column is typed `jsonb` in `0001_init_schema.sql` but the pipeline writes a plain string. Not a cost issue; correctness cleanup. File as a separate small fix.
- **Off-season cadence config per sport.** U6 ships per-team cadence with NFL boundaries for the 49ers. NBA/MLB/etc. boundaries get filled in when those teams onboard.
- **Per-segment Claude path retirement.** After U4 ships, `lib/anthropic/summarize.ts` (the per-segment summarizer) may be entirely unused. Mark it deleted in a follow-up commit if so.
- **Payment-method upgrade beyond Particle Starter** ($10 credit). Operational, not architectural. User-task before launch.
- **Free-tier weekly-cadence scaffolding.** Future product work — when the free tier becomes a real feature, the cadence-policy infra from U6 is the foundation.

---

## Key Technical Decisions

- **Per-team factory-level cost attribution** (U1) **over per-call options.** `createParticleClient({ supabase, teamId })` closes over the teamId; every call automatically attributes. Cleaner than threading teamId through every call site. Trade-off: one client per (team, request) lifecycle. Acceptable — clients are cheap to construct. `teamId` is validated against `config/teams.ts` at factory construction so a misspelled or stale team identifier fails fast rather than corrupting cost data.

- **U2 (caching fix) ships before U1 (cost attribution)**, even though U1 is the "measurement foundation." Reason: U2's verification doesn't require per-team attribution — `inspect-costs` already reports cache hit rate. Shipping U2 first delivers the highest-confidence quick win (~1 hour of work, biggest single-line Anthropic cost cut) and generates evidence the plan's premise works before committing to U1's cross-cutting refactor. Phase A intra-ordering: U2 → U1 → U3 → U8.

- **`refactor` plan type framing.** Several workstreams ship genuinely new behavior (cadence policy, force-reprocess flag, model evaluation, prompt versioning) — `feat` or `perf` could be more accurate. Kept as `refactor` because the primary intent and largest unit (U4 per-episode pipeline) is structural reshaping of existing code. Naming-only call; doesn't affect the work.

- **Per-episode pipeline using inline `windows[].lines[]` if sufficient** (U4) **over per-episode transcript fetch.** Particle returns inline line-level context with every mention. The cheapest possible pipeline uses *only* that context. The investigation in U4 Stage 1 determines whether to commit fully or fall back to per-episode transcript fetches. Either path is 6× cheaper than per-segment.

- **Forward-only prompt versioning** (U5) **over migration-style version compatibility.** When the prompt changes, segments tagged with old versions get re-processed. No "compatibility mode" where old prompts still work. Trade-off: every prompt bump costs a re-process. Acceptable — prompt bumps are intentional events, not accidental.

- **`cadence_days` per team** (U6) **over global cadence.** Different sports have different seasons. Same plan that adds the column also makes ad-hoc per-team overrides natural (e.g., higher cadence during a team's playoff push).

- **Throwaway provider abstraction for evaluation, not production** (U7). Building a real multi-provider abstraction up front would pre-commit to swapping. The cheap path: thin adapters that exist only for the eval harness. If we adopt a swap, the production abstraction is a follow-up. If we stay on Claude, the throwaway code can be deleted.

- **`team_id` on `api_calls` is nullable, no FK** (U1). Historical rows stay null. No cascade entanglement. Future v3 might add a constraint after backfill. For now: simplicity over rigor.

---

## Risks & Mitigations

- **Risk: Caching fix in U2 doesn't drop the cache hit rate to ≥80%.** The bug analysis is best-guess based on Anthropic's published model. Mitigation: U2's verification step checks the metric directly; if rate stays at 0%, investigate further before claiming the unit done. Probability: low. Impact: medium (the largest single-line fix doesn't work; have to dig deeper).

- **Risk: Inline `windows[].lines[]` context in U4 isn't enough for substantive summaries.** The hypothesis is high-leverage but unverified against the prompt's actual quality needs. Mitigation: U4 Stage 1 explicitly investigates this before commit; if insufficient, the fallback (one transcript fetch per episode) still cuts cost ~6× from today. Probability: medium. Impact: low (fallback is still a big win).

- **Risk: User cannot approve any prompt iteration in U4's sign-off gate.** Possible if the content shape requires a different architecture entirely (e.g., per-quote-card instead of per-episode-card). Mitigation: U4 contingency calls out escalation; this may require a different planning conversation, not engineering changes. Probability: low. Impact: high (could block the whole plan).

- **Risk: Model swap evaluation in U7 finds no winner.** Possible — Claude Haiku may already be best for this workload at this volume. Mitigation: that IS the output. The evidence on file justifies staying. The unit isn't "we must swap"; it's "we must decide with data." Probability: medium. Impact: low (still useful output).

- **Risk: Cadence policy in U6 short-circuits a run the user wanted.** Possible if season boundaries are wrong, or in-season vs. off-season transitions are sloppy. Mitigation: manual override (`?force=1`) always available. The `skipped_cadence` system_alerts rows make it observable. Probability: low. Impact: low.

- **Risk: U1's `team_id` threading breaks existing tests or routes.** Adding parameters to widely-used factory functions can ripple. Mitigation: U1 ships first specifically so the rest of the plan builds on stable factories; tests get updated in the same unit. Probability: low. Impact: low (caught at unit test time).

- **Risk: $0.20/team/day target is too aggressive.** Particle's `mentions` calls alone are fixed cost ~$0.30/day (30 entities × $0.008 with one search per entity per run). If our entity count grows, the floor rises. Mitigation: revisit unit-economics doc when adding teams with substantially different entity counts; target may need to flex. Probability: medium long-term. Impact: medium (could require additional architectural moves to hit the goal at scale).

- **Risk: this plan succeeds against CE1 but unit economics still don't work at user scale.** CE1 measures per-team-per-day cost in a single-user reality where "per-team" and "per-user" are the same number. The Pro-tier $3.99 pricing only makes margin once multiple users share a team's ingestion cost (multi-tenant sharing, deferred to a v2 plan). This plan is **necessary but not sufficient** for unit economics. The second necessary leg — multi-tenant ingest sharing so per-user cost amortizes across subscribers — is captured as a follow-up in `docs/strategy/unit-economics.md` and must ship before paid launch. Without it, the plan's success doesn't actually prove the $3.99 economics work in practice. Probability: this is true by definition. Impact: high (could mislead post-plan launch-readiness assessment).

- **Risk: `team_id` misattribution corrupts cost-aggregation math.** U1 adds `team_id` as a free-form text column on `api_calls` with no FK and no validation. In v1 the only writer is the server-side pipeline, so misattribution is hard to introduce. In v2+ when multiple teams' pipelines run, a code path passing the wrong `teamId` (or `undefined` falling back to `null`) silently corrupts the per-team-cost numbers CE1 depends on. Mitigation: U1's factory-level validation should assert `teamId` is one of the known team IDs from `config/teams.ts` before constructing the client. Probability: low in v1, medium in v2. Impact: low (corrupted metric, not data loss).

- **Risk: cost gate fails open + force flag = runaway cost potential.** `remainingStarterCreditUsd` in `lib/ingest/run.ts` returns `STARTER_CREDIT_USD` ($10) on any Supabase read error, effectively disabling the cost gate. Combined with U8's `?force=1` flag (which intentionally bypasses dedup), a period of intermittent DB connectivity during aggressive dev iteration creates a window where multiple full-reprocess runs proceed without cost-gate protection. Mitigation: add a secondary circuit breaker in `runDailyIngestion` that counts recent `system_alerts.kind = 'manual_run'` rows (not `api_calls`, which is the cost gate's data source) to detect "already ran in the last N minutes" independently of the cost calculation. Lands as a small follow-up to U8 if rate-limit testing reveals the gap. Probability: low. Impact: medium ($10 starter credit exhaustion in a single dev session).

---

## Dependencies / Prerequisites

- **Live API keys in `.env.local`:** Particle, Anthropic. Also (for U7 model evaluation): Gemini API key, OpenAI API key, DeepSeek API key, optional Grok / xAI API key. User obtains.
- **Supabase project access:** v1 single project (`fszzncbglomjtsardyej`); all migrations apply directly. No staging.
- **Existing tooling:** `npm run inspect-card`, `npm run inspect-costs`, `npm run qa:screenshots` — all wired from prior work, used throughout this plan's verification steps.
- **Particle Starter credit:** ~$5 remaining of original $10. Each ingestion run during development consumes ~$1. Plan execution may exhaust the starter credit; budget for an early Particle paid-tier upgrade if so.
- **Anthropic API credit:** trivial spend per evaluation pass. No concern.
- **U4 sign-off availability:** the user must be available to review prompt iterations and approve content shape. The unit can't progress without them.

---

## Success Metrics

The plan succeeds when ALL of the following are true:

- [ ] **CE1 met:** `npm run inspect-costs -- since=<30 days ago> group=team` reports per-team-per-day cost ≤ $0.20 for the 49ers team, over a 30-day rolling window of real ingestion runs. (Note: in-season floor is ~$0.30/day per origin cost model; the ≤$0.20 target depends on cadence-policy off-season reduction averaging into the 30-day window. CE1 cannot be evaluated against a window that's purely in-season — wait for at least one cadence cycle.)
- [ ] **CE2 met:** Anthropic cache hit rate ≥ 80% on `npm run inspect-costs` Anthropic detail.
- [ ] **CE3 met:** `api_calls` table has `team_id` populated for all rows written by the ingest pipeline after U1 lands. `inspect-costs --group=team` is functional.
- [ ] **CE4 met:** Per-segment Claude calls are eliminated from the runtime pipeline (verified via `api_calls` having zero `anthropic/summarize_segment` rows in a post-U4 ingestion window; only `anthropic/extract_episode_moments` remains).
- [ ] **CE5 met:** Bumping `EPISODE_EXTRACTION_PROMPT_VERSION` triggers re-processing on the next run, verified end-to-end.
- [ ] **CE6 met:** Off-season days show `skipped_cadence` system_alerts rows; in-season days run normally. v1 single-team config produces expected behavior.
- [ ] **CE7 met:** `docs/solutions/2026-05-12-model-evaluation.md` exists with a populated matrix and a clear recommendation backed by data.
- [ ] **CE8 met:** User has explicitly approved the new card content shape after U4 sign-off iteration.

Plus regression-protection:
- [ ] All 178 pre-plan tests still pass after every unit ships.
- [ ] RLS smoke tests pass — no cross-user leakage introduced by schema additions.
- [ ] `npm run lint` and `npm run build` clean throughout.

---

## Operational / Rollout Notes

- **Order matters.** Phase A (U1, U2, U3) must complete before Phase B (U4). U1 is the measurement foundation; U2 is a precondition for U4 (caching has to work). Phases C and D can run in parallel after Phase B.

- **Per-unit re-validation against real data is required.** Every unit ends with a `npm run inspect-costs` check confirming the unit moved the metric in the expected direction. A unit isn't "done" just because tests pass — the cost number is the final arbiter.

- **U4 will require multiple iteration cycles.** Budget for 3–5 prompt versions before user sign-off. Each iteration is ~$0.50–1.00 in dev-mode re-ingest cost. Worth it.

- **Don't skip the sign-off gate.** The plan's stated goal is "cost AND content quality." Approving a cost win on content the user hates fails the plan. The gate exists for a reason.

- **Migrations are additive only.** Per project convention, never modify applied migrations. Three new migrations land in this plan: `0012_api_calls_team_id.sql`, `0013_segments_prompt_version.sql`, `0014_teams_cadence.sql`.

- **Schema additions preserve RLS posture.** All three new columns are on tables with existing RLS; ensure the policies don't need amendment. (Likely they don't — `team_id`, `prompt_version`, `cadence_days` are not user-scoped fields.)

- **Pre-launch action carried forward from v1:** Particle dashboard credit-weight inspection. Useful before U7's evaluation harness so we have authoritative per-call pricing for Particle in the matrix.

- **Observability:** `system_alerts` gains a new kind (`skipped_cadence`) in U6. Update `KIND_TO_STATUS` map in `lib/digest/load-cards.ts` to handle it. Update the residual reviewers' findings if any reference the map.

---

## Verification

This plan is ready to execute when:

- ✅ The unit-economics anchor doc (`docs/strategy/unit-economics.md`) exists and is current — it does (`21b3938`).
- ✅ Real cost baseline data exists in `api_calls` — it does (covering 2026-05-10 onward).
- ✅ Tooling for measurement (`inspect-card`, `inspect-costs`, `qa:screenshots`) is wired — it is.
- ✅ Each unit's `Approach` and `Files` are concrete enough that an implementer can run `ce-work` against the unit without inventing scope.

The plan is "done" when all eight success metrics above are met AND the user has signed off on the post-U4 content shape.

A future deepening pass (`/ce-plan` re-invocation with `deepen`) can strengthen any unit whose implementation surfaces unexpected complexity — particularly U4 (the largest unit with the most unknowns) and U7 (the open-ended evaluation work).
