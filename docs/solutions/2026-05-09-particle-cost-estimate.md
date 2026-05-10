---
date: 2026-05-09
topic: particle-cost-model-and-budget-estimate
applicability: U7 client cost telemetry, U8 ingestion pipeline, U1 cost dry-run, plan Risks & Mitigations
status: pricing model verified from docs; rate limits confirmed from live API (10k/min); specific credit-per-call rates still pending dashboard inspection
plan-ref: docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md
sibling-docs:
  - docs/solutions/2026-05-09-particle-api-shape.md
---

# Particle API Cost Model and Budget Framework

**Headline:** Particle uses a **two-tier credit model** (`standard` vs. `premium`) — endpoints are explicitly weighted, NOT flat-priced. This materially changes how U7's cost-tracker and U8's pre-flight gate must be structured. Audio CDN fetches are FREE (not API calls). Credit exhaustion produces a hard 402 block with no overage on Starter tier. Specific credit-per-call rates are not in public docs and must be confirmed via the dashboard during the laptop-session U1 work.

---

## Source

Read by proxy through Claude on iOS (sandbox blocks `docs.particle.pro`). Pulled from the Concepts guide, error catalog (`credits_depleted`, `spend_limit_exceeded`, `plan_does_not_support_overage_usage`), OpenAPI tags on each endpoint, and the billing/spend-limits administrative endpoints.

---

## Verified findings

### Endpoints are tiered, not flat-priced

From the Concepts guide:

> "Every endpoint is available on every account — there is no tier lock. Endpoints are **priced differently**, though: heavier endpoints (full transcripts, transcript mentions, advertising analytics, cross-podcast clip search, competitor lookups) consume **more credits per call** than lighter ones (entity, topic, and podcast metadata; episode lookups and sub-resources; clip listings; embed)."

Each endpoint carries an OpenAPI tag declaring its pricing class:

- **`tier:standard`** — entity/topic/podcast metadata, episode lookups, clip listings, embed.
- **`tier:premium`** — full transcripts, transcript mentions, advertising analytics, cross-podcast clip search, competitor lookups.

### Endpoint-by-endpoint mapping for our pipeline

| Endpoint | Plan unit | Tier | Per-run frequency |
|---|---|---|---|
| `GET /v1/podcasts/episodes` (list-episodes) | U8 ingestion | **standard** | Once per podcast per run (~31/day) |
| `GET /v1/entities` | U8 ingestion (slug resolution) | **standard** | Initial seed only |
| `GET /v1/podcasts/mentions` (entity-mention search) | U8 ingestion | **premium** | Once per universe entity per run (~30/day) |
| `GET /v1/podcasts/search` (semantic content search) | U8 ingestion | **premium** | Once per storyline per run (~6/day) |
| `GET /v1/podcasts/clips/{id}` (get-a-clip) | U8 + U12 | **premium** | Once per surfaced segment (~50–200/day) |
| `GET /v1/podcasts/clips/{id}/transcript` (get-clip-transcript) | U8 ingestion | **premium** | Once per segment (~50–200/day) |
| `GET /v1/podcasts/episodes/{id}/transcript/words` (word-level) | U8 informational; U12 v2 | **premium** | Once per segment (~50–200/day; deferred until v2 player) |

**Bottom line:** of the calls our pipeline makes daily, the vast majority are **premium-tier**. The cost model needs to weight accordingly.

### Audio URL fetches are FREE

The `audio_url` value returned in clip JSON is a direct CDN path on `cdn.particle.pro`. **Fetching that URL is a CDN request, not an API request — it does NOT consume credits.** This is significant for U12: even if the user plays 100 clips, zero API credit is consumed. Only the JSON-fetching API calls count toward the meter.

### Credit exhaustion behavior — hard block, no graceful degrade

From the error catalog:

> *"The organization's credit allocation for the current billing period has been fully consumed. API requests are blocked until you upgrade to a higher plan or credits replenish at the start of the next billing period."*

- HTTP status: **`402 Payment Required`**
- The API **blocks all requests immediately** — no queue, no degraded mode.
- Resolve: upgrade plan OR wait for next billing period.

A separate user-configurable spend cap (`spend_limit_exceeded`) produces the same block at the user-set ceiling. It's adjustable via `PATCH /v1/organizations/{orgId}/billing/spend-limits` with OWNER role.

### Overage only on Growth plan

> *"Overage usage is only supported on the Growth plan. Other plans cap usage at the plan limit and do not support additional billing beyond that."*

- **Starter (this account):** hard cap. No overage. 402 at depletion.
- **Growth:** opt-in via `PATCH /v1/organizations/{orgId}` with `{"overage_enabled": true}`, billed beyond plan allocation.
- **No graceful slowdown** anywhere in the model — runs are binary success/depleted.

### What's NOT in public docs

- The actual credit cost of a `standard` vs `premium` call (e.g., 1× vs. 5×).
- The total credit allocation per plan tier.
- The dollar value of a credit.
- The exact metered units behind "100,000 requests/month" on Growth.

These live in the dashboard. Confirm during the laptop-session U1 work.

### What we know about the user's account from prior context

- **Tier:** Starter
- **Credit balance:** $10 (interpreted as a USD-denominated allocation; Particle may internally use credits with a $-conversion).
- **Payment method:** none on file (per the dashboard screenshot earlier in the conversation).
- **Implication:** when the $10 is consumed, the API hard-blocks until the user adds a payment method, upgrades to Growth, or waits for the next billing period.

---

## Plan implications

### Concrete updates that flow into U7 (Particle client + cost telemetry)

The plan describes "a hardcoded price table." That table now has structure:

```
priceTable = {
  standard: {
    creditsPerCall: <unknown — fill from dashboard>,
    usdPerCall:     <derived from creditsPerCall × usdPerCredit>
  },
  premium: {
    creditsPerCall: <unknown — fill from dashboard>,
    usdPerCall:     <derived>
  }
}

endpointTiers = {
  '/v1/podcasts/episodes': 'standard',
  '/v1/entities': 'standard',
  '/v1/podcasts/mentions': 'premium',
  '/v1/podcasts/search': 'premium',
  '/v1/podcasts/clips/{id}': 'premium',
  '/v1/podcasts/clips/{id}/transcript': 'premium',
  '/v1/podcasts/episodes/{id}/transcript/words': 'premium',
}
```

The `tracked-call` wrapper looks up the endpoint's tier, computes cost, writes both `cost_usd` and `tier` (new column) to `api_calls`. Adds modest schema breadth to U5's `api_calls` definition: an optional `tier` column.

### Updates that flow into U8 (ingestion pipeline)

- **Pre-flight cost gate** (already in the plan) must use tier-weighted cost. A naive flat-rate estimate would severely under-count; weighted estimate gives the real exposure.
- **Explicit 402 handling.** When the API returns `credits_depleted` or `spend_limit_exceeded`, the worker must:
  1. Stop issuing new requests immediately (don't burn through retries).
  2. Mark the current `ingest_jobs` shard as `failed` with reason `credits_depleted`.
  3. Write a `system_alerts` row of kind `credits_depleted` so the user sees it on next app open.
  4. Skip the `pg_net` chain to the next shard (don't accidentally retry).
- **Steady-state vs seed math.** Steady-state daily run is ~67 base calls + 50–100 segment-detail calls. Auto-seed is 3× the date window AND the cold-cache state (no segments cached yet), so it's effectively 5–10× the steady-state spend.

### Cost dry-run framework (to be filled in from dashboard rates)

Once we have actual rates, the formula is:

```
worst_case_seed_cost_usd =
  (n_podcasts × calls_to_list_episodes × usdPerCall.standard)            # ~31 standard
+ (n_entities × calls_to_mentions      × usdPerCall.premium)             # ~30 premium
+ (n_storylines × calls_to_search      × usdPerCall.premium)             # ~6 premium
+ (n_segments_first_seed × calls_for_clip_+_transcript × usdPerCall.premium)  # ~150–600 premium

Where for the 3-day seed:
  n_segments_first_seed ≈ entity_hit_rate × n_episodes_3d × avg_segments_per_episode
                       ≈ ~150–300 premium calls (rough order)
```

Steady-state daily run drops the segment-detail term significantly (Supabase cache eliminates re-fetches), so most of the seed-day cost is one-time.

**Until rates land:** the plan's existing $10/Starter credit framing remains the operational ceiling. The plan's cost-conscious mitigations (dev mode, pre-flight gate, request-counter-based budget alarm, payment method decision before first full seed) all stand and may even be more important than originally framed given the no-overage hard-block model.

### Updated risk treatment

The plan currently lists "Particle Starter $10 credit runs out during build/test" with mitigation "dev-mode in U8 caps query volume." That mitigation is correct but should be augmented:

**New mitigation list for the credit-exhaustion risk:**

1. **Dev-mode** caps testing volume (existing).
2. **Pre-flight cost gate** with tier-aware math aborts before any real call when worst-case > 60% of remaining credit (existing in revised plan).
3. **402-handler** in U8 stops ingestion cleanly and surfaces a `system_alerts` row (NEW from this finding).
4. **`/api/feedback`-equivalent for "I added payment"** UX flow — an in-app affordance to retry a credits-depleted run after adding payment, rather than waiting until next billing cycle (NEW; minor, defer to v1+ if not blocking).
5. **Pre-launch checklist gate** confirming payment method is on file before the first non-dev-mode run (existing in plan).

### Audio playback caveat

The plan's MVP audio player (U12) involves the user tapping play and the browser fetching the `audio_url` from `cdn.particle.pro`. Because that's a CDN call (not an API call), **U12's interaction patterns do NOT consume API credits.** This means:

- The "is the player worth U12 of 13?" adversarial concern is partially mitigated — the player has zero ongoing API cost regardless of how often users play clips.
- We can be generous about preloading audio in the UI (preload="metadata") without worrying about budget.
- Only the JSON layer (`get-a-clip` and `get-clip-transcript` calls) costs credits, and those happen at ingestion time, not playback time.

### Updates to U1 contingency H

The plan's contingency H (worst-case cost > 50% credit) is now expressible:

- **Trigger:** worst-case seed cost (computed in U1's cost dry-run with verified rates) exceeds 50% of the $10 starter credit.
- **Action:** seed window shrinks from 3 days to 1 day; payment method added before first full daily run; OR upgrade to Growth before any production run.
- **Threshold may need to drop from 50% to 40%** given the no-overage hard-block — once we exceed the credit, the API is dead until next billing cycle. We don't want to skate close to the line.

---

## Remaining U1 cost work (laptop session)

1. **Confirm credit-per-call rates** for `standard` and `premium` tiers from `platform.particle.pro/billing` or by sampling a real call and watching the dashboard delta.
2. **Confirm USD-per-credit conversion.** $10 starter credit; how many credits is that?
3. **Confirm the steady-state vs seed daily cost** with verified rates — fill the dry-run formula above.
4. **Decide:** add payment method, upgrade to Growth pre-launch, or stay on Starter and accept hard-cap behavior.
5. **(Optional) configure spend limit** via `PUT /v1/organizations/{orgId}/billing/spend-limits` to set a project-specific hard cap as a safety net.

---

## What this enables once filled in

- U7 ships a price table that produces accurate per-call costs.
- U8 ships a 402-aware ingestion pipeline that doesn't silently burn credit.
- U1's pre-flight gate and dry-run produce a real number, not an asterisk.
- The user sees exact cost per run in `api_calls` and can make an informed plan decision (Starter vs Growth) based on observed spend after the first week.

This finding does not require a structural plan revision — the plan's existing accommodations (price table, pre-flight gate, dev mode, cost telemetry) all hold; they just need to be tier-aware. Worth a brief note in U7 + U8 when /ce-work executes them.

---

# Round 2 update: rate limits and header inspection (2026-05-10)

Live verification against the API confirmed:

- **Rate limit: 10,000 requests/minute** (per `x-ratelimit-limit` header on every endpoint tested). The Round 1 doc-based assumption of 1,000/min was conservative by 10×. **Daily-run headroom is enormous** — a worst-case daily spend of ~270 calls is 0.045% of one minute's ceiling.
- **No credit/spend info is exposed in HTTP response headers.** Only rate-limit headers are present (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`). Cost tracking is therefore entirely client-side via the price table in `lib/particle/tracked-call.ts`. The dashboard remains the sole source of truth for credit balance.
- **`/v1/organizations` and `/v1/me` style endpoints exist (401 vs 404 split) but require organization-owner JWT auth** — the API key is insufficient. In-app credit-balance display is therefore **not feasible in v1** without a separate auth mechanism. Acceptable: the user has the dashboard for balance checks.

These findings reinforce the existing plan, with one minor refinement:

**Refined rate-limit handling for U7:** since the daily spend is well under 1% of the per-minute ceiling, **a complex token-bucket/backoff layer is overkill**. A simple "log the headers; respect Retry-After on 429s" implementation is sufficient. Document this in U7's client.

**Open question still deferred:** per-call credit weights for `standard` vs `premium` tiers. Still needs a dashboard inspection. Not blocking U5–U9 code work — the price table can be a stub with sensible placeholders during development; populated accurately before the first non-dev-mode run.
