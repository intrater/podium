---
title: refactor: Particle API optimizations — slug GETs, search filters, ad-stripping, list-episodes discovery
type: refactor
status: completed
date: 2026-05-14
---

# Particle API optimizations — slug GETs, search filters, ad-stripping, list-episodes discovery

## Summary

Land 5 Particle API improvements identified in the 2026-05-14 audit against `docs/reference/particle-api.md`: three free-win client surface additions (direct slug GETs for podcasts and entities, single-episode lookup by ID, expose entity/company filters on search) and two cost-cutting pipeline changes (strip ad timecodes from transcripts before Claude extraction, optional list-episodes-by-entity discovery as an A/B alternative to premium mentions calls). Closes call-count and Claude-input gaps that today put us at ~$0.55/team/day vs the $0.20 CE1 target.

---

## Problem Frame

Today's audit cross-referenced `lib/particle/client.ts` against the freshly vendored Particle docs and surfaced five concrete gaps:

1. Seed flow uses search-then-match for slug→id resolution; direct slug GETs exist and are simpler.
2. There's no single-episode lookup helper; today's duration backfill needed list-and-match per podcast.
3. `/podcasts/search` accepts `entity_id` and `company_id` filters per the docs that we don't expose.
4. Ad blocks (60–180s per episode) flow through Claude as input tokens; Particle has an ad-detection endpoint that lets us strip them first.
5. Mentions calls (premium tier) drive moment discovery today; list-episodes-by-entity (standard tier, ~10× cheaper) could cover the discovery role differently — episode-level only, no mention windows — and an A/B test would show whether Claude can find moments from full transcripts without quality loss.

Cadence gate was removed today, eliminating the prior frequency lever. CE1 ($0.20/team/day) now depends on cost-per-run reductions like these.

---

## Requirements

- **R1.** Particle client exposes direct slug/id GET methods for podcasts, entities, and episodes
- **R2.** Seed flow uses direct slug GETs for podcast and entity resolution (replaces `listPodcasts({ q })` + `listEntities({ q })` + match-in-code)
- **R3.** Particle client search method accepts `entity_id` and `company_id` filters (surface ships even if live behavior is unconfirmed; consumer-side usage gated on verification)
- **R4.** Ingest pipeline strips ad timecodes from the transcript before sending it to Claude `extractEpisodeMoments` and before persisting `raw_transcript`
- **R5.** Ingest pipeline supports an A/B-flagged discovery mode that uses `/episodes?entity_id=…` instead of `/mentions` for candidate-episode discovery, preserving the existing mention path as default until quality is validated

---

## Scope Boundaries

- New client methods are surface-expanding, not behavior-changing — existing `searchByContent`, `searchEntityMentions`, `listEntities`, `listPodcasts`, `listEpisodes` callers stay unchanged
- No pipeline core refactor — `mentions`-based discovery stays the default and remains tested
- Ad-stripping is ephemeral (drops lines from the array passed to Claude and to `buildMomentTranscript`) — ad timecodes themselves are not persisted
- Cost-saving claims tracked in call-count deltas, not dollar deltas, until per-call credit weights are pinned (per `docs/solutions/2026-05-09-particle-cost-estimate.md`)
- No DB schema migrations — segment ID stability for the list-episodes path uses a synthetic stable ID derived from episode + time bounds, which fits the existing `particle_segment_id` UNIQUE TEXT constraint

### Deferred to Follow-Up Work

- Audit findings 6–8 (topic pre-filter, structural segments, speaker attribution): separate planning unit
- Promoting list-episodes discovery to default and retiring mentions: pending A/B quality validation
- Sponsor/advertising endpoints, chart rankings, brand suitability: off-strategy
- Persisting ad timecodes for analytics surfaces: separate brainstorm

---

## Context & Research

### Relevant Code and Patterns

- `lib/particle/client.ts:121–148` — `ParticleClient` interface + `ENDPOINT_TIER` map. New endpoint keys register here for tier-aware billing.
- `lib/particle/client.ts:181` — `id()` URL-segment encoder; wraps every `{slug}`/`{id}` path interpolation.
- `lib/particle/client.ts:184–254` — existing method shape `async (opts) => call(endpointKey, pathString)`. All new methods mirror this.
- `lib/seed/index.ts:204–211` — `lookupPodcastId` uses `listPodcasts({ q, limit: 5 })` + find-by-slug; replaceable with `getPodcastBySlug(slug)`.
- `lib/seed/index.ts:253–278` — `lookupEntityId` tries up to 3 name-variants of the slug because `listEntities` is free-text; direct slug GET eliminates the variant loop.
- `lib/seed/particle-resolver.ts` — narrower `SeedParticleResolver` interface (server-only-free). New methods must be mirrored here too.
- `lib/ingest/pipeline.ts:197–212` — per-episode transcript fetch. Natural ad-strip insertion point sits between the fetch (line 209) and the `transcriptLines` mapping (line 214).
- `lib/ingest/pipeline.ts:220–227` — `MentionAnchor[]` construction. The list-episodes discovery path needs synthetic anchors and a relaxed extractor contract.
- `lib/ingest/pipeline.ts:290–298` — `segments.particle_segment_id` UNIQUE upsert key. The list-episodes path uses a synthetic ID strategy to preserve idempotency without a migration.
- `__tests__/lib/particle/client.test.ts` — `makeSupabaseStub(recorded)` + `jsonResponse(...)` + `makeClient(fetcher, recorded)` patterns for new method tests.
- `__tests__/lib/ingest/pipeline.test.ts` — `makeParticleStub({ mentions, search, transcripts })` + `makeAnthropicStub` patterns to extend.

### Institutional Learnings

- `docs/solutions/2026-05-09-particle-api-shape.md` — Round-2 live response captured no `entity_id`/`company_id` fields on `/podcasts/search` results. **Implication:** R3 (expose filters on search) ships the surface but needs live verification before downstream consumers use it. Slugs are deterministic by `name.toLowerCase().replace(/'/g,'').replace(/\./g,'').replace(/\s+/g,'-')` (15/15 hit rate on 49ers roster).
- `docs/solutions/2026-05-09-particle-cost-estimate.md` — `endpointTiers` confirmed `/episodes` standard, `/mentions` and `/search` premium. R5's savings claim depends on `/episodes?entity_id=` being standard tier (vendored docs say yes; verify in OpenAPI tag during U4 probe).
- `docs/solutions/2026-05-12-list-call-investigation.md` — `listEntities`/`listPodcasts` are seed-only at runtime (100% out-of-window). R2 has zero daily-worker risk. `npm run inspect-list-calls` is the post-change regression diagnostic.
- `docs/solutions/2026-05-12-episode-extraction-prompt.md` — pull-quote validation requires verbatim transcript substrings. R4 ad-stripping must pass the same stripped lines to both Claude AND `buildMomentTranscript` (the `raw_transcript` source) or quotes will fail fidelity.
- `docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md` — Haiku 4.5 cache prefix threshold is 4,096 tokens. Ad-stripping shortens transcript length but does not affect the cacheable prefix (system+tools). Short episodes may drop below threshold post-strip; monitor `cache_creation = 0` AND `cache_read = 0` signal.

### External References

- `docs/reference/particle-api.md` — vendored Particle docs (snapshot 2026-05-14). Source of truth for endpoint shapes, parameter names, and tier hints.
- `docs/strategy/unit-economics.md` — $0.20/team/day target; observation that runtime never touches `listEntities`/`listPodcasts` (R2's no-runtime-risk claim).
- `docs/plans/2026-05-12-001-refactor-cost-optimization-plan.md` — CE1 target and the cost-attribution / prompt-version-bump conventions this plan honors.

---

## Key Technical Decisions

- **All three new GET methods land at standard tier.** `ENDPOINT_TIER` gets `podcasts.get`, `entities.get`, `podcasts.episodes.get` all set to `"standard"`. Rationale: single-resource GETs mirror existing list endpoints (also standard); only search/mentions/transcript are premium.
- **Slug methods take the slug or ID interchangeably** (Particle treats them as fungible identifiers per docs). Method names use `BySlug` for clarity; callers pass slugs from `config/podcasts.ts` directly.
- **R3 unit ships the surface even if live behavior is unconfirmed.** The TypeScript surface is harmless to add; if `entity_id` filters don't narrow results, the consumer-side use simply doesn't roll out until verified.
- **Ad-stripping mutates the transcript array passed to both Claude AND `buildMomentTranscript`.** Stripped lines are removed from both code paths to keep pull-quote validation aligned. `particle_segment_id` and Particle-native time bounds on `segments` are NOT affected.
- **List-episodes discovery uses a synthetic segment ID.** Format: `${particle_episode_id}:${start_seconds}-${end_seconds}`. Fits the existing `particle_segment_id` TEXT UNIQUE constraint without schema change. `match_source` = `"entity"` for these rows.
- **A/B for R5 is controlled by an env var (`INGEST_DISCOVERY_MODE`).** Default `"mentions"` preserves today's path; `"list-episodes"` swaps discovery. No DB schema change; comparison is operator-driven across two manual runs.
- **Prompt version bumps from `v1` to `v2`** when U4 lands because the extractor contract relaxes (anchors become optional hints, not required selection set). Bump auto-reprocesses existing segments per U5 of the cost-optimization plan.
- **Cost-saving claims tracked in call-count deltas** in commit messages and follow-up notes, not dollars, until per-call credit weights are pinned.

---

## Open Questions

### Resolved During Planning

- **Should slug methods replace or augment the existing list methods?** → Augment. Free-text catalog search is still useful when slug is unknown.
- **Should ad-stripping persist ad timecodes for later analytics?** → No; out of scope. Separate brainstorm covers analytics surfaces.
- **How does the list-episodes discovery path avoid breaking `particle_segment_id` UNIQUE idempotency without a schema migration?** → Synthetic ID `${particle_episode_id}:${start_seconds}-${end_seconds}` fits the existing TEXT-typed UNIQUE constraint.
- **Should R3 block on live verification?** → No. Ship the surface; gate consumer-side usage on a separate probe.
- **Where does ad-stripping insert in the pipeline?** → Between transcript fetch (`getClipTranscript`) and the `transcriptLines.map(...)` call at `lib/ingest/pipeline.ts:214`. Same stripped lines flow into `buildMomentTranscript`.

### Deferred to Implementation

- **Exact `/podcasts/episodes/{id}/ads` response shape.** Vendored docs describe fields (sponsor, read type, placement) but no full JSON example. Implementation begins with a one-shot probe call against a recent episode to capture the actual shape, then defines the type.
- **Does `/podcasts/search` actually respect `entity_id`/`company_id` filters?** Vendored docs claim yes; prior live verification on 2026-05-09 found no such fields on responses. U2 ships the surface; a separate one-shot probe (run by the implementer, not committed) confirms whether the filter narrows results.
- **Quality threshold for promoting list-episodes discovery to default.** Pending A/B output comparison in a follow-up after U4 ships.
- **Does `/podcasts/episodes/{id}/ads` actually land at standard tier or premium?** First `api_calls` row after the U3 probe will reveal the tier. Default registration is `"standard"` per vendored docs; flip to `"premium"` in a follow-up if observed otherwise. Either way, ad-stripping nets positive (Claude token reduction far exceeds the per-episode ads call).

---

## Implementation Units

### U1. Add direct-resource GET methods + swap seed flow to slug GETs

**Goal:** Expose `getPodcastBySlug`, `getEntityBySlug`, and `getEpisodeById` on `ParticleClient`. Use the slug methods in the seed flow, replacing `listPodcasts({ q })` + `listEntities({ q })` + match-in-code.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `lib/particle/client.ts` — add three methods, three `ENDPOINT_TIER` entries, three option types
- Modify: `lib/particle/types.ts` — confirm `ParticlePodcast`, `ParticleEntity`, `ParticleEpisode` suffice (likely no changes)
- Modify: `lib/seed/particle-resolver.ts` — add slug methods to the `SeedParticleResolver` interface and `createSeedParticleResolver` factory
- Modify: `lib/seed/index.ts` — swap `lookupPodcastId` and `lookupEntityId` to slug GETs; delete the 3-variant entity loop
- Modify: `scripts/seed-supabase.ts` — only if it constructs the resolver explicitly (otherwise no change)
- Test: `__tests__/lib/particle/client.test.ts` — cases per new method
- Test: `__tests__/lib/seed/index.test.ts` — extend mock resolver to include new slug methods

**Approach:**
- All three new methods follow the existing `async (opts) => call(endpointKey, pathString)` shape
- URL path interpolation wraps slug/id with the `id()` encoder helper for special-char safety
- ENDPOINT_TIER additions: `podcasts.get`, `entities.get`, `podcasts.episodes.get`, all `"standard"`
- The seed update is a behavior-preserving swap (same persisted rows, fewer calls per resolution)

**Patterns to follow:**
- `lib/particle/client.ts:228–230` (`getClip(clipId)`) — closest analog for single-resource GET
- `lib/particle/client.ts:138–148` — endpoint tier registration

**Test scenarios:**
- Happy path: `getPodcastBySlug("locked-on-49ers")` returns a `ParticlePodcast` shape; `api_calls` row records `podcasts.get`/standard tier
- Happy path: `getEntityBySlug("brock-purdy")` returns a `ParticleEntity` shape
- Happy path: `getEpisodeById("particle-episode-id-XYZ")` returns a `ParticleEpisode` with `duration_seconds` populated
- Edge case: slug containing special characters (e.g., apostrophe, ampersand) is URL-encoded before fetch
- Error path: 404 surfaces via the existing client error contract (`ParticleTransientError` / `ParticleSchemaError` family)
- Integration: `lib/seed/index.ts`'s mock-resolver-driven test exercises the new methods and produces identical persisted rows as today

**Verification:**
- `npm run lint && npm run build && npm test` all pass
- `npm run seed` against a fresh state resolves all 36 podcast slugs and all universe entity slugs with no `listPodcasts`/`listEntities` calls in the run
- `npm run inspect-list-calls` confirms post-change counts of `listPodcasts`/`listEntities` decrease

---

### U2. Expose `entity_id` and `company_id` on `searchByContent`

**Goal:** Extend `SearchByContentBase` and `SearchByContentOpts` to accept optional `entityId` and `companyId` params; forward to the `/v1/podcasts/search` query string.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `lib/particle/client.ts` — add `entityId?: string` and `companyId?: string` to `SearchByContentBase`; thread into the `buildQuery` call inside `searchByContent`
- Test: `__tests__/lib/particle/client.test.ts` — assertions that `entity_id` and `company_id` appear in the outgoing query when set

**Approach:**
- Surface-only change. No caller is required to use the new params in this unit.
- A separate one-shot probe call (run by the implementer, not committed) confirms whether responses actually narrow when `entity_id` is set. If they do, follow-up work in the pipeline can use this. If not, the surface remains harmless and stays available for future use.

**Patterns to follow:**
- Existing optional params on `SearchByContentBase` (`since`, `until`, `cursor`, `limit`)
- camelCase TypeScript options → snake_case query keys

**Test scenarios:**
- Happy path: `searchByContent({ semantic: "draft picks", entityId: "ent_123" })` produces a URL with both `semantic_search=draft+picks` and `entity_id=ent_123`
- Happy path: same with `companyId`
- Edge case: omitting both params produces a URL without `entity_id`/`company_id` keys
- Integration: existing search tests still pass (no regression to the `keyword | semantic` discriminated union)

**Verification:**
- Built query strings contain (or omit) the new params under all combinations
- One-shot live probe (not committed) confirms whether `entity_id` actually narrows result count vs. an unfiltered same-keyword search; outcome captured in the commit message or a follow-up `docs/solutions/` note

---

### U3. Strip ad timecodes from transcript before Claude extraction

**Goal:** Per episode, fetch ad timecodes via `/v1/podcasts/episodes/{id}/ads` and filter out transcript lines that fall within any ad range before passing the array to `extractEpisodeMoments` and `buildMomentTranscript`.

**Requirements:** R4

**Dependencies:** U1 (keeps the Particle client surface coherent; not strictly blocking)

**Files:**
- Modify: `lib/particle/client.ts` — add `listEpisodeAds(episodeId)` method; register `podcasts.episodes.ads.list` in `ENDPOINT_TIER` (default `"standard"`, verified by first-call probe)
- Modify: `lib/particle/types.ts` — add `ParticleEpisodeAd` type with `start_seconds`, `end_seconds`, `placement`, `read_type`, `sponsor` (per docs; refine after probe)
- Modify: `lib/ingest/pipeline.ts` — after `getClipTranscript` returns, fan out a `listEpisodeAds` call; filter `transcript.lines` against ad ranges before the `transcriptLines` mapping and before passing the same array to `buildMomentTranscript`
- Test: `__tests__/lib/particle/client.test.ts` — case for the new method
- Test: `__tests__/lib/ingest/pipeline.test.ts` — extend `makeParticleStub` to include `ads` keyed by episode; assert ad-window lines are absent from the Claude stub's received transcript AND from persisted `raw_transcript`

**Approach:**
- Sequence per episode: fetch transcript → fetch ads → strip ad-windowed lines → pass stripped lines to Claude AND to `buildMomentTranscript`
- A line is "in an ad window" if `[line.start_seconds, line.end_seconds]` overlaps any `[ad.start_seconds, ad.end_seconds]`
- If `listEpisodeAds` fails (404, transient), log a warning and continue with unstripped transcript — ad-stripping is opportunistic, not required
- Particle segment boundaries on `segments` and `particle_segment_id` are unchanged

**Patterns to follow:**
- `lib/ingest/pipeline.ts:351–368` — `buildMomentTranscript`'s range-filter logic is the closest analog for the strip helper
- `lib/ingest/pipeline.ts:203–209` — transcript-fetch failure path is the "log and continue" tolerance pattern

**Test scenarios:**
- Happy path: episode has 2 ad windows (00:30–01:30, 14:00–15:30). Lines within those ranges are absent from the Claude stub's received input.
- Happy path: episode has 0 ads (empty response). Behavior identical to today; no lines stripped.
- Edge case: ad window partially overlaps a line (line spans 00:25–00:35; ad is 00:30–01:30). Convention: line is stripped if any overlap exists. Test asserts this rule.
- Error path: `listEpisodeAds` returns 404. Pipeline proceeds with unstripped transcript; warning logged; episode is still processed and persisted.
- Error path: `listEpisodeAds` returns transient error. Same as 404 — fall back to unstripped.
- Integration: persisted `segments.raw_transcript` for an ad-bearing episode does NOT contain ad text; pull-quote validation succeeds against stripped content.

**Verification:**
- After a manual ingest, `npm run inspect-card -- <ad-bearing episode index>` shows `raw_transcript` free of ad copy
- `api_calls` shows new `podcasts.episodes.ads.list` rows, one per processed episode
- Anthropic input-token count per episode decreases vs. pre-change baseline (compare via `npm run inspect-costs`)

---

### U4. List-episodes-by-entity discovery mode (A/B-flagged)

**Goal:** Add an alternative candidate-episode discovery path that calls `/v1/podcasts/episodes?entity_id=…` (standard tier) instead of `/v1/podcasts/mentions` (premium tier), gated by an env var. In list-episodes mode, mentions are skipped entirely and Claude finds moments from the full transcript.

**Requirements:** R5

**Dependencies:** U1 (slug methods help resolve test fixtures), U3 (ad-stripping should land first so the list-episodes path inherits it)

**Files:**
- Modify: `lib/particle/client.ts` — extend `ListEpisodesOpts` to accept `entityId?: string` (and optionally `slug`); thread to `entity_id` query param
- Modify: `lib/ingest/types.ts` — add `discoveryMode: "mentions" | "list-episodes"` to the pipeline input type
- Modify: `lib/ingest/run.ts` — read `env.INGEST_DISCOVERY_MODE` (default `"mentions"`); thread into pipeline input
- Modify: `lib/env.ts` — add `INGEST_DISCOVERY_MODE` env var declaration (enum, default `"mentions"`)
- Modify: `lib/ingest/pipeline.ts` — branch on `discoveryMode`. When `"list-episodes"`: skip mentions/search blocks; for each universe entity, call `listEpisodes({ entityId })`; build `NormalisedSegment[]` with one anchor per episode (full-episode time range); use synthetic `particle_segment_id = ${episode_id}:0-${duration_seconds}`; set `match_source = "entity"`. After Claude returns moments, persisted `particle_segment_id` uses the refined coords: `${episode_id}:${moment.start_seconds}-${moment.end_seconds}`.
- Modify: `lib/anthropic/extract-episode-moments.ts` — relax the prompt contract: when `anchors.length === 0` or anchors are full-episode windows, instruct Claude to identify its own time-coded moments from the transcript
- Modify: `lib/anthropic/types.ts` — bump `EPISODE_EXTRACTION_PROMPT_VERSION` from `"v1"` to `"v2"`; auto-reprocesses existing segments on first post-deploy run per U5 of the cost-optimization plan
- Test: `__tests__/lib/particle/client.test.ts` — `listEpisodes({ entityId })` produces correct query
- Test: `__tests__/lib/ingest/pipeline.test.ts` — two parallel test groups: `discoveryMode: "mentions"` (existing behavior preserved) and `discoveryMode: "list-episodes"` (new behavior). Both produce valid cards.
- Test: `__tests__/lib/anthropic/extract-episode-moments.test.ts` — case where `anchors` is empty or full-episode: extractor returns moments with self-discovered boundaries

**Approach:**
- Discovery mode is per-run, not per-call. Operator-driven A/B is enough for v1 — pick one mode, run, compare via `inspect-card`.
- The `extractEpisodeMoments` prompt change is the riskiest piece. Today the prompt expects moments to map to provided anchors. The new path provides no useful anchors (full-episode window). The prompt must instruct Claude to identify its own time-coded moments.
- Synthetic segment IDs preserve upsert idempotency. Format: `${episode_id}:${start_seconds}-${end_seconds}` after Claude returns refined coordinates.
- Call-count math: ~10 list-episodes calls/day (one per universe entity, standard tier) replaces ~10 mentions calls/day (one per entity, premium tier). Per-call cost ratio is ~10×. Net Particle savings ≈ $0.07/day. Net Anthropic change is uncertain — list-episodes may surface more candidate episodes than mentions does, so per-day Anthropic call count could rise even as Particle drops.

**Patterns to follow:**
- `lib/ingest/pipeline.ts:170–195` (current mentions-based entity loop) — model the new entity loop on the same shape, with `listEpisodes({ entityId })` replacing `searchEntityMentions`
- `lib/ingest/pipeline.ts:404–424` (`normaliseFromMention`) — write a parallel `normaliseFromListEpisode` returning the same `NormalisedSegment` shape

**Test scenarios:**
- Happy path (mentions mode): existing pipeline behavior unchanged; all current tests pass
- Happy path (list-episodes mode): pipeline discovers episodes via `listEpisodes({ entityId })`, fetches transcripts, calls `extractEpisodeMoments` with empty anchors, persists moments with synthetic segment IDs and cards
- Edge case: list-episodes returns 0 episodes for an entity. Pipeline skips that entity cleanly; no Claude call fires.
- Edge case: same episode is returned for two different entities. Dedupe consolidates to one Claude call per episode; `surfacing_entities` is set-merged.
- Error path: `listEpisodes` fails for one entity. Pipeline continues with the remaining entities (same tolerance as today's mentions-failure path).
- Integration: prompt-version bump triggers automatic reprocess of v1 segments on the first post-deploy run.
- Integration: idempotency — running the list-episodes-mode pipeline twice produces the same rows on second run (synthetic segment IDs collide as expected via `onConflict` upsert).

**Verification:**
- `INGEST_DISCOVERY_MODE=mentions npm test` and `INGEST_DISCOVERY_MODE=list-episodes npm test` both pass
- Manual A/B: run two ingestion passes (one in each mode) against the same content window; compare card counts, moment counts, and rollup quality via `npm run inspect-card -- all`; capture outcome in a follow-up `docs/solutions/2026-05-14-list-episodes-discovery-ab.md`
- `npm run inspect-costs` confirms `api_calls` rows for `podcasts.episodes.list` outnumber `podcasts.mentions` when `INGEST_DISCOVERY_MODE=list-episodes`

---

## System-Wide Impact

- **Interaction graph:**
  - `lib/seed/index.ts` resolution paths change shape (search→GET); no downstream callers change.
  - `lib/ingest/pipeline.ts` gains a new transcript-prep step (ad-stripping) and a forked discovery path (mentions vs list-episodes).
  - `lib/anthropic/extract-episode-moments.ts` prompt contract relaxes (anchors become optional hints); requires `EPISODE_EXTRACTION_PROMPT_VERSION` bump.
- **Error propagation:**
  - `listEpisodeAds` failure: warn-and-continue (do not block extraction)
  - `getPodcastBySlug` / `getEntityBySlug` 404 during seed: bubble up via existing `lookupPodcastId` / `lookupEntityId` error paths (no behavior change vs today)
  - `listEpisodes({ entityId })` failure in list-episodes mode: tolerate per entity (same as today's mentions failure tolerance)
- **State lifecycle risks:**
  - Synthetic `particle_segment_id` for the list-episodes path: upsert key remains UNIQUE; collisions on re-run are expected (idempotent).
  - `EPISODE_EXTRACTION_PROMPT_VERSION` bump triggers reprocess of all existing v1 segments — intentional per U5 of the cost-optimization plan; one-time cost.
- **API surface parity:** No public API contract changes. New env var `INGEST_DISCOVERY_MODE` defaults to current behavior.
- **Integration coverage:**
  - Pipeline tests cover both discovery modes
  - Pull-quote fidelity is retested against ad-stripped transcripts to confirm quotes don't drop
- **Unchanged invariants:**
  - `segments.particle_segment_id` UNIQUE constraint — preserved; new synthetic IDs fit the existing constraint
  - `cards.episode_id` 1:1 per-episode mapping — preserved
  - Cost telemetry contract (`api_calls` row per call) — preserved; all new endpoints register tier

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `/podcasts/search` does not actually respect `entity_id` filter (per 2026-05-09 live shape) | U2 ships the surface only; activation in callers deferred until a probe call confirms behavior. If unsupported, no other unit depends on it. |
| `/podcasts/episodes/{id}/ads` returns at premium tier rather than standard | Implementation probe captures actual tier from `api_calls` after first call. If premium, ad-stripping savings still net positive (transcript reduction → Claude cost reduction far exceeds the per-episode ads call). |
| Ad-stripping degrades pull-quote fidelity if a moment's window overlaps an ad boundary | Same stripped lines flow to Claude AND to `buildMomentTranscript`; pull-quote validator runs against stripped content. No asymmetric reads. |
| List-episodes discovery surfaces more low-quality episodes (no mention-window prefilter) | A/B comparison in U4 verification. If quality drops, list-episodes stays opt-in and is never promoted to default. |
| Prompt version bump triggers full reprocess on first post-deploy run, spiking cost | Expected per U5 of cost-optimization plan. One-time cost; surface in commit message. |
| Synthetic segment IDs collide with future Particle segment IDs | Format `${episode_id}:${start_seconds}-${end_seconds}` is structurally distinct from Particle's opaque-string IDs. Verified by inspection of existing `particle_segment_id` shapes. |
| Ad endpoint response shape differs from docs description | One-shot probe at start of U3 captures actual shape before code lands. |
| Anthropic token cost rises in list-episodes mode (more candidate episodes per run) | A/B comparison surfaces this directly; if net cost rises, list-episodes is rejected. |

---

## Documentation / Operational Notes

- After U3 ships, capture actual ad-stripping savings (Anthropic input-token delta) in a new `docs/solutions/2026-05-14-ad-stripping-impact.md`
- After U4 A/B run, document outcome in a new `docs/solutions/2026-05-14-list-episodes-discovery-ab.md`; promote list-episodes to default only via a follow-up plan if quality matches mentions
- `INGEST_DISCOVERY_MODE` env var: document in `docs/solutions/2026-05-09-env-and-secrets-setup.md`
- Update `docs/strategy/unit-economics.md` "What we observed" section after the first full week post-deploy to reflect the new call mix

---

## Sources & References

- Vendored Particle docs: `docs/reference/particle-api.md` (snapshot 2026-05-14)
- Cost optimization plan: `docs/plans/2026-05-12-001-refactor-cost-optimization-plan.md`
- Particle API shape verification: `docs/solutions/2026-05-09-particle-api-shape.md`
- Particle cost model: `docs/solutions/2026-05-09-particle-cost-estimate.md`
- List-call investigation: `docs/solutions/2026-05-12-list-call-investigation.md`
- Per-episode extraction prompt: `docs/solutions/2026-05-12-episode-extraction-prompt.md`
- Anthropic Haiku 4.5 cache minimum: `docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md`
- Strategy / unit economics: `docs/strategy/unit-economics.md`
