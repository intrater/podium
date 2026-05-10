---
date: 2026-05-09
status: active
plan-id: 2026-05-09-001
type: feat
title: "Podium v1 — 49ers podcast digest"
origin: docs/brainstorms/podium-v1-requirements.md
revised: 2026-05-09 (round 2 — added unit status tracker, updated frontmatter)
prior-revisions:
  - 2026-05-09 round 1 — applied ce-doc-review findings (P0 architectural fix, ~10 P1 fixes, ~10 P2 fixes, 6 safe-auto fixes)
---

# feat: Podium v1 — 49ers podcast digest

## Summary

Build v1 of Podium: a mobile-first, design-led web app that delivers a daily morning digest of 49ers-relevant podcast moments to a single user (the builder), powered by the Particle podcast intelligence API for ingestion, Claude Haiku for summarization, and Supabase for storage. Architecture is multi-user / multi-team / multi-sport from day one but ships with stub auth and a single team. Custom audio player with synchronized transcript (MVP-first), team-adaptive theming foundation, and per-segment relevance feedback are first-class.

(see origin: `docs/brainstorms/podium-v1-requirements.md`)

---

## Problem Frame

Sports fans rely on podcasts for analysis of their favorite teams, but volume has outpaced any reasonable listening budget. The pain has two distinct shapes:

- Team-specific shows (e.g. *Niners Nation*) where every minute is relevant but there are too many full episodes to listen to in a week.
- National shows (e.g. *The Mina Kimes Show*) where a 90-minute episode may include 90 seconds about the 49ers — buried somewhere inside, with no way to know if it's there or what was said.

Prior attempts to solve this stalled on transcription / segmentation infrastructure. Particle's recent API collapses that layer and makes the problem tractable for the first time.

The user is a designer with paid Vercel Pro and Supabase Pro accounts. v1 ships only for them, only for the 49ers; v2 expands the same user to multiple teams; v3 opens to other users. The plan therefore prioritizes architectural decisions that hold across all three versions while shipping the smallest useful surface for v1.

---

## Requirements Traceability

This plan executes the requirements from `docs/brainstorms/podium-v1-requirements.md`. Cross-references use origin R-IDs (R1–R17), F-IDs (F1–F4), AE-IDs (AE1–AE6), A-IDs (A1–A6), and Q-IDs (Q1–Q8) for the planning-phase clarifications captured below.

The eight Q&A clarifications captured during planning, layered on top of the brainstorm:

- **Q1 — Visual direction.** Fun + Arc-style expressive motion + dark-first + **team-adaptive theming** (palette swaps by team). References: Linear, Arc browser, Spotify, Origin (finance), Sana AI. Anti-pattern: Duolingo-corny.
- **Q2 — Particle pricing tier.** Starter, ~$0.004/req list price, $10 starter credit, no payment method on file as of planning. Plan must be cost-conscious and surface telemetry in-app (later corrected during doc review: cost telemetry stays as a data layer; UI surface deferred to v2).
- **Q3 — Curated podcast list.** ~31 unique shows (mix of national and 49ers-specific). Final list lives in `config/podcasts.ts`.
- **Q4 — Auth posture.** Stub for v1; multi-team for the same user in v2; real magic-link auth in v3.
- **Q5 — Domain.** `podiumsports.app` (user owns; HTTPS auto-required by `.app` TLD).
- **Q6 — Surface priority.** Mobile-first, mobile web only (no native app).
- **Q7 — Brand identity.** No brand work for v1; clean text wordmark in the display face + neutral dark palette + team accent. Defer real brand work to v2.
- **Q8 — First-run experience.** Auto-seed last 3 days of 49ers content on first login (no primary empty state); manual "Run now" button as a power tool.

---

## High-Level Technical Design

*This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### System shape

```
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────┐
│ Particle API     │←───│ Supabase Edge Fn    │───→│ Supabase DB  │
│ (external)       │    │ "daily-digest"      │    │ (Postgres +  │
│                  │    │ scheduled by        │    │  RLS + cron) │
│ • search dialogue│    │ pg_cron @ 6am ET    │    │              │
│ • list-episodes  │    │                     │    │ • episodes   │
│ • get-clip       │    │ + Anthropic SDK     │    │ • segments   │
│ • word transcript│    │ (Haiku 4.5,         │    │ • cards      │
└──────────────────┘    │  realtime Messages, │    │ • feedback   │
                        │  prompt caching)    │    │ • api_calls  │
                        │                     │    │ • system_    │
                        │ Sharded by podcast  │    │   alerts     │
                        │ via ingest_jobs     │    │ • universes  │
                        │ table + chained     │    │ • ingest_jobs│
                        │ pg_net invocations  │    └──────┬───────┘
                        └─────────────────────┘           │
                                                          │ RLS-scoped reads
                                                          ▼
                                                ┌──────────────────┐
                                                │ Next.js App      │
                                                │ (Vercel Pro)     │
                                                │                  │
                                                │ • RSC card grid  │
                                                │ • Audio player   │
                                                │   (MVP: native + │
                                                │   segment-level  │
                                                │   highlight)     │
                                                │ • Theme tokens   │
                                                │   (single team   │
                                                │   for v1)        │
                                                └──────────────────┘
                                                          ▲
                                                          │ podiumsports.app
                                                          │ (Vercel-managed)
```

### Data flow (one daily cycle)

1. `pg_cron` at 6am ET fires the `daily-digest` Edge Function.
2. Edge Function reads the active universe (`teams.universe_id` for "49ers") = entity slugs (team + roster + coaches) + storyline semantic queries.
3. **Pre-flight cost estimate:** computes worst-case Particle + Anthropic spend for this run against the price table; if it exceeds 60% of remaining starter credit (and no payment method is on file), aborts with a `system_alerts` row and exits.
4. **Sharded execution:** writes one row per podcast-shard into `ingest_jobs` (status `pending`); each Edge Function invocation processes one shard within the 150s wall, then chains the next via `pg_net` until all shards complete.
5. Per shard: parallel calls to Particle (entity-mention search per entity, semantic search per storyline, episode listing for the shard's podcasts).
6. Unions and dedupes results by `(episode_id, segment.start)`; skips any segment already cached in `segments`.
7. For each new segment: `getWordLevelTranscript`, then summarize via Claude Haiku 4.5 (realtime Messages with prompt caching on the system + universe context).
8. Persists into `episodes`, `segments`, `cards`, `api_calls`, and `system_alerts` per-shard.
9. User opens app → server component reads today's `cards` filtered by user feedback → mobile-first card grid renders → tap to expand → audio player loads with segment-level transcript highlight.

### Why these choices over the alternatives I considered

- **Supabase Edge Function + pg_cron + sharded chaining via `pg_net`, NOT Vercel Cron.** Vercel Hobby caps at 60s; Pro at 5 min. Sharded chaining gives effectively unbounded total runtime by stringing 150s windows together via `ingest_jobs` state.
- **Realtime Anthropic Messages with prompt caching, NOT Message Batches API.** Doc review found Batches' 24-hour SLA can't poll to completion in a 150s Edge Function — would have required a webhook architecture. At solo-user volume (~50–100 segments/day at steady state), the 50% Batches discount equals roughly $0.50–$1.00/month. Not worth the architectural cost. Cache on the universe context (~700 tokens of voice/format rules) gives a meaningful reduction on its own.
- **MVP-first audio player.** v1 ships a designed-but-MVP player: native `HTMLAudioElement` + custom chrome + segment-level transcript highlight (the active *segment* is highlighted, not individual words). Full word-level RAF-driven highlighting + wavesurfer waveform + virtualization is gated on usage data showing the player is actually tapped. Defers a hard 6+ hour engineering effort and avoids the RAF + virtualization conflict the doc review surfaced.
- **Tailwind v4 `@theme inline` + `@property`-registered color tokens.** The `@property` registration is kept as a forward-compat stub (3 lines of CSS) for future team-switch transitions in v2. The full `team-theme-provider` runtime component is **deferred to v2** — v1 hard-codes `data-team="49ers"` in `app/layout.tsx`.
- **`team_id` text + `user_id uuid not null references auth.users(id)` from day one, with explicit stub-auth RLS bridge.** Server-side reads/writes use the Supabase **service role key** with an explicit `WHERE user_id = $env.PODIUM_USER_ID` clause (RLS bypassed but identity enforced in code). Client-side reads in v1 use the anon key with a synthetic JWT minted server-side whose `sub` claim matches `PODIUM_USER_ID`, so RLS is exercised on every client read. v3 magic-link auth replaces only the JWT-minting step; policies and code paths unchanged.
- **Staging + production Supabase projects, not single-project.** v1 ships with two Supabase projects: `podium-staging` and `podium-prod`. Migrations apply to staging first; promotion to prod is gated on staging success. Recovers from typo'd migrations without losing prod state.

---

## Output Structure

```
podium/
├── app/                          # Next.js pages
│   ├── (app)/                    # Authenticated app group (no real auth in v1, structure ready for v3)
│   │   ├── layout.tsx            # Sidebar, header, theme tokens
│   │   ├── page.tsx              # Mobile-first digest grid (RSC)
│   │   └── episodes/[id]/
│   │       └── page.tsx          # Expanded episode card with player
│   ├── api/
│   │   ├── ingest/
│   │   │   ├── route.ts          # Manual "Run now" trigger (POST, rate-limited)
│   │   │   └── status/route.ts   # GET — current ingest job status (for first-run UX)
│   │   └── feedback/route.ts     # Per-segment feedback writes
│   ├── layout.tsx                # Root layout, theme tokens, fonts, hardcoded data-team="49ers"
│   └── globals.css               # @import "tailwindcss"; @theme; @property
│
├── components/
│   ├── ui/                       # shadcn primitives (button, card, dialog, sheet, slider, sonner, skeleton)
│   ├── digest/                   # Card-per-episode UI (total-time-pill inlined into episode-card)
│   ├── player/                   # MVP audio player + segment-level highlight + scrubber
│   ├── feedback/                 # The 3-button feedback bar
│   └── (no theme/ in v1 — single hardcoded team)
│
├── lib/
│   ├── particle/                 # Particle API client + cost telemetry wrapper + types + contract test
│   ├── anthropic/                # Claude SDK + summarization prompts
│   ├── supabase/                 # Browser/server client setup
│   ├── universes/                # 49ers universe (entities + storylines)
│   ├── ingest/                   # Pipeline shared between cron + manual trigger (dev-mode logic inlined)
│   └── env.ts                    # Typed, validated env vars (server/client split via @t3-oss/env-nextjs)
│
├── config/
│   ├── podcasts.ts               # Curated 31-podcast list with Particle slugs
│   └── teams.ts                  # Team palette definitions (49ers in v1; structure ready for v2 expansion)
│
├── supabase/
│   ├── migrations/               # SQL migrations (init, RLS, indexes, system_alerts, ingest_jobs, pg_cron)
│   ├── functions/daily-digest/
│   │   ├── index.ts              # Deno Edge Function (runs one shard per invocation)
│   │   └── import_map.json       # Explicit Deno imports for cross-runtime parity
│   ├── seed.sql.example          # Template for local dev seed (real seed.sql is gitignored)
│   └── (seed.sql not committed — created from template + PODIUM_USER_ID at runtime)
│
├── docs/
│   ├── brainstorms/              # (existing) requirements doc
│   ├── plans/                    # (existing) this file
│   ├── particle/                 # User-fetched Particle docs (gitignored, populated during U1)
│   └── solutions/                # Workflow artifact — per-unit learnings written during execution
│       (this directory holds learning docs, not code; appearance in the file tree is informational)
│
├── middleware.ts                 # Supabase session refresh (no-op in v1; active in v3)
├── next.config.ts
├── package.json
├── postcss.config.js
├── vercel.json                   # Domain config + (optional) cron fallback
├── .env.local.example            # Template for keys
├── .env.local                    # (gitignored) actual keys
├── AGENTS.md                     # Coding-agent guidance for the repo
└── README.md
```

The implementer may adjust the structure if a better layout becomes clear; per-unit `**Files:**` sections are authoritative.

---

## Unit Status

Last updated: 2026-05-10 (U7 landed)

| Unit | Name | Status | Notes |
|------|------|--------|-------|
| **Phase A — Foundation & verification** | | | |
| U1 | Particle API verification | **done** | Docs + live-API verification complete. All 8 dimensions resolved; both contingency rounds collapsed (see `docs/solutions/2026-05-09-particle-api-shape.md`). Per-call credit weights still pending dashboard inspection but not blocking. |
| U2 | Next.js scaffold | **done** | Next.js 16 + Tailwind v4 + shadcn/ui + Motion. All files in place, builds clean. |
| U3 | Env, secrets, Supabase projects | **done** | `lib/env.ts`, `.env.local.example`, setup walkthrough, `.env.local` populated, build verified. Vercel env vars pending (needed for deploy, not local dev). |
| U4 | Domain → Vercel | **not started** | User adds DNS records at registrar. Only needed for production deploy. |
| **Phase B — Data layer** | | | |
| U5 | Schema + RLS + stub-auth | **done** | Migrations 0000–0008 applied to Supabase project `fszzncbglomjtsardyej`. RLS smoke suite passes against the live DB. v1 ships against a single Supabase project (no separate staging) — split deferred until pre-launch. ce-code-review pass landed 7 follow-up fixes (commit `31ce6ba`); pre-U6 residuals (#1, #2, #5) landed in the U5 follow-up bundle plus six review-driven hardening fixes — see "Residual review findings (U5 follow-up)" below for what remains. |
| U6 | Niners universe + seed | **done** | `config/podcasts.ts` (31 catalog-resident podcasts; 7 team-specific + 24 national), `config/teams.ts` (49ers OKLCH palette), `lib/universes/49ers.ts` (30 verified entity slugs + 8 storylines), `lib/seed/index.ts` (idempotent runner), `scripts/seed-supabase.ts` (`npm run seed`), tests covering schema validity, slug pattern, kind thresholds, and live-DB idempotency. Migration `0008_universes_team_id_unique.sql` added UNIQUE(team_id) so concurrent seed runs can't insert duplicate universe rows (resolves residual #17). |
| **Phase C — Ingestion & summarization** | | | |
| U7 | Particle client + cost telemetry | **done** | `lib/particle/{types,tracked-call,client,cost-estimate}.ts` plus 9 contract snapshots and 65 unit tests. Hardcoded per-endpoint tier mapping (search/mentions/clip/transcripts = premium; list endpoints = standard). Retry policy covers 408/429/5xx; 401 + 422 are terminal; AbortSignal short-circuits; default 30s timeout per attempt. **NEW finding for U8:** Particle's mentions endpoint requires `entity_id` (NOT slug), and list-episodes requires `podcast_id` (NOT slug). The U6 universe + podcasts ship as slugs only; U8 must resolve slug→id at worker startup via `listEntities` and `listPodcasts`, and cache the IDs (either in-memory per-run or by adding columns in a follow-up migration). |
| U8 | Daily ingestion worker | **next** | Unblocked on U7. Still needs U9 to land first per the dependency chain. Note the slug→id resolution work flagged above. |
| U9 | Claude Haiku summarization | **next** | Unblocked on U7 (segment shape now typed in `lib/particle/types.ts`). Segment boundaries are topical (median ~2 min) — prompt does not need "extract relevant portion" gymnastics. |
| **Phase D — Design & UI** | | | |
| U10 | Design system foundation | **not started** | Theme tokens landed incidentally in U2 scaffold; actual U10 work (motion presets, team palette, contrast tests) not started. |
| U11 | Digest card grid | **not started** | Blocked on U5, U10. |
| U12 | MVP audio player | **not started** | Blocked on U10, U11. Audio URL behavior fully verified — permanent CDN paths with range support; no re-signing route, no embed wrapper fallback. |
| U13 | Feedback bar | **not started** | Blocked on U5, U11, U12. |

### What's blocked on the user

1. **U4 DNS** — add Vercel DNS records at the `podiumsports.app` registrar. ~5 min. Only needed for production deploy.
2. **Vercel env vars** — mirror `.env.local` values into Vercel project settings (Production → prod Supabase keys; Preview → staging keys). Needed for deploys, not local dev.
3. **Particle dashboard credit-weight inspection** — read per-call credit cost for `standard` and `premium` tiers from the dashboard before the first non-dev-mode run. ~5 min. Not blocking U5–U9 code work.

### Residual review findings (U5 follow-up)

ce-code-review surfaced 25 findings on commit `1c83b24`; 7 applied in `31ce6ba`. The pre-U6 residuals (#1, #2, #5) landed in the follow-up bundle (commit TBD) along with six hardening fixes from a second ce-code-review pass on the bundle itself.

**Pre-U6 — RESOLVED:**

- ✅ **#2 (P1):** `feedback` RLS WITH CHECK now requires any non-null `card_id` to belong to the authed user (migration `0007_feedback_card_owner_check.sql`). Cross-user smoke test plus a positive-path test (B inserts feedback against B's own card → succeeds) lock down both sides of the policy.
- ✅ **#1 (P0):** `createSupabaseServerClient` no longer accepts a `userId` parameter. `mintStubJwt(userId)` retains the impersonation primitive but throws if `NODE_ENV === "production"` and `userId !== PODIUM_USER_ID`. Tests use `vi.stubEnv` for the production-mode guard so NODE_ENV mutation doesn't leak across vitest workers.
- ✅ **#5 (P1):** `0000_reset.sql` IF EXISTS list now covers v1 tables (universes, segments, cards, feedback, api_calls, system_alerts, ingest_jobs). A prominent destructive-replay warning is at the top of the file — `supabase db reset` against the live project would now wipe v1 data, so the warning makes the blast radius visible to the next reader.

**Pre-U8 (before the daily worker writes its first row):**

- **#3 (P1):** Drop `read by authenticated` SELECT policies on `api_calls`, `system_alerts`, `ingest_jobs`. Latent in v1 single-user; leaks operational metadata in v3. Plan says "policies do not change between versions" so fixing now is correct.
- **#4 (P1):** Document in `lib/supabase/server.ts` that writes to `api_calls`/`system_alerts`/`ingest_jobs` MUST use `getSupabaseAdmin()` — the SELECT-only policies otherwise silently reject INSERTs from the user-scoped client.
- **NEW (U7 follow-up, P1):** Slug→id resolution for entities + podcasts. The universe ships entity slugs but Particle's mentions endpoint requires `entity_id`; same for `podcast_id` on list-episodes. Either (a) cache IDs in `universes.entities_resolved jsonb` + `podcasts.particle_id text` columns at seed time, or (b) resolve in-memory per worker run via `listEntities`/`listPodcasts`. Recommend (a) — one-time cost, no runtime API spend.
- **#16 (P2):** Generate Supabase TS types via `supabase gen types typescript --linked > lib/supabase/database.types.ts` and parameterize `createClient<Database>` so `.from()` returns are typed.

**Pre-U4 deploy:**

- **#15 (P2):** Add a shared-secret check on `/api/*` in middleware before the custom domain goes live. Today the middleware is a no-op pass-through; public internet would hit `/api/*` as the configured single user.

**Defer to dedicated follow-up units (P2/P3, not blocking anything):**

- #8 — `feedback` CHECK requiring at least one of (card_id, segment_id) non-null
- #9 — Migration filename convention (rename to `YYYYMMDD_*` before next migration if the deviation matters; otherwise accept)
- #11 — Document `next build` as the canonical server-only boundary (the test mock defeats the build-time guard)
- #12 — Vitest preflight cleanup of stale `rls-test-%` rows older than 1 hour (live-DB tests leak on SIGKILL)
- #13 — Document teams↔universes circular FK seed order (or do it in U6's seeding script)
- #14 — `0000_reset.sql` permanently in history is a project-ref footgun (consider archiving after first deploy)
- ✅ #17 — UNIQUE on `universes.team_id` landed in migration `0008` alongside U6 (the seed runner needs it for the lookup-then-insert race window).
- #18 — Plan-required EXPLAIN sanity test on `cards (user_id, surfaced_at desc)`
- #22, #23 — `cascade` qualifier in 0005 + missing `IF NOT EXISTS` in 0001. Both edit already-applied migrations; skipped to avoid migration-history drift; documented as an accepted trade-off.
- #24 — `ingest_jobs.podcast_ids uuid[]` has no FK integrity (Postgres limitation; alternative is a child table)

---

## Implementation Units

13 units in 4 sequential phases. Phase A must complete before Phase B. Within a phase, units are dependency-ordered.

**Phase A — Foundation & verification** (U1–U4)
**Phase B — Data layer** (U5–U6)
**Phase C — Ingestion & summarization** (U7–U9)
**Phase D — Design & UI** (U10–U13)

---

### U1. Verify Particle API capabilities (expanded scope)

**Goal:** Resolve the largest unknowns blocking architecture by capturing Particle's actual behavior across **eight** dimensions, not just two. The custom audio player (R6, F4) and the entire ingestion pipeline depend on this. This is the single most important unit; downstream units calibrate from its findings.

**Requirements:** R6, R3, R8, F4, R17 (gating), origin `Dependencies / Assumptions`.

**Dependencies:** none.

**Files:**
- `docs/particle/` (gitignored) — local copies of fetched Particle docs
- `docs/solutions/2026-05-09-particle-api-shape.md` — durable learning capturing the eight verifications
- `docs/solutions/2026-05-09-particle-cost-estimate.md` — worst-case cost analysis for the seed and steady-state daily runs

**Approach:**

Fetch the docs locally (sandbox can't reach Particle; user runs the curl from their terminal). Then generate a Particle API key, run targeted test calls, and document each of the eight verifications:

1. **Auth header format** — Bearer token? Custom header? Confirm exact shape.
2. **Base URL** — `https://api.particle.pro/v1`? Different host?
3. **Raw audio URL on `get-a-clip`** — does the response include a fetchable audio URL field? Field name? **Critical for U12.**
4. **Word-level transcript shape** — does `get-word-level-transcript` return `{text, start, end, speaker}` per word? **Critical for U12 future evolution; MVP doesn't need it.**
5. **Audio URL access model** — signed URL with TTL? Permanent CDN path? `Accept-Ranges` support for HTTP range seeking? Fetch a HEAD on a clip's audio URL and inspect `Cache-Control`, `Content-Length`, `Accept-Ranges` headers.
6. **Entity coverage rate** — what % of the 49ers active 53-man roster has Particle entity slugs? Sample 10–15 player names and check `list-entities`. **If <60% coverage, the universe needs name-fallback logic.**
7. **Segment boundary granularity** — typical segment length distribution from `search-podcasts-by-content` for 49ers queries. Are segments 30-second focused chunks or 30-minute slabs? **If too coarse, summarization quality degrades.**
8. **Curated catalog hit rate** — for each of the 31 podcasts in `config/podcasts.ts`, look up its Particle slug. Document hit/miss for each. **Misses fall through to entity-mention search but lose the curated-surface filter.**

Plus a **cost dry-run**: estimate worst-case Particle + Anthropic spend for the 3-day auto-seed against the price table. Document in the cost-estimate solutions file.

**Patterns to follow:**
- `docs/solutions/` learning doc convention (frontmatter with date + topic + applicability tags).

**Test scenarios:**
- Test expectation: none — verification + documentation unit.

**Verification:**
- Both solutions docs exist with answers to all eight verifications + a worst-case cost number.
- The plan reader can answer "will the custom player work?" and "will the seed run cost more than $10?" by reading these two files alone.

**Contingencies if verification surfaces bad news:**

- **(A) No raw audio URL on `get-a-clip`:** v1 player downgrades to a styled `<particle-podcast-clip>` embed wrapper — accept reduced visual control. U12 builds the wrapper; design polish via outer chrome. The "design-led player" requirement degrades to "stylized embed."
- **(B) No word-level timestamps:** MVP player already uses segment-level highlighting (this is the v1 default), so this contingency is a no-op for v1. Future word-level evolution becomes infeasible until Particle exposes the data.
- **(C) Audio URLs are short-lived signed URLs:** segments are not stored with the URL — instead, the player fetches the URL on-demand via a server route that re-signs at request time. Adds an `app/api/clips/[id]/audio/route.ts` route handler.
- **(D) Audio CDN does not support range requests:** seeking past the loaded buffer triggers a full re-fetch. Acceptable for v1 segment-level seek; flagged as a constraint.
- **(E) Entity coverage <60%:** universe config adds name-string fallback (semantic search) for missing players. U6 carries the fallback list.
- **(F) Segment boundaries too coarse:** summarization prompt in U9 adds explicit "extract only the 49ers-relevant portion" instruction; downstream summary may include "this segment touched on the 49ers within a broader discussion of X."
- **(G) Curated catalog hits <50% of the 31 podcasts:** plan pivots toward entity-search-driven discovery as primary surface; curated podcast filter becomes secondary.
- **(H) Worst-case cost >50% of starter credit:** seed window shrinks from 3 days to 1 day; user adds a payment method or upgrades to Growth before the first full daily run.

---

### U2. Initialize Next.js project with TypeScript, Tailwind v4, shadcn/ui, Motion

**Goal:** Stand up the empty-but-runnable Next.js app with the full design-system stack installed.

**Requirements:** Foundational — supports R4–R6, R17.

**Dependencies:** U1 (informational only — types deferred to U7 to avoid `create-next-app` directory conflict).

**Files:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.js` (created)
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (created — placeholder content; layout hardcodes `data-team="49ers"` on `<html>`)
- `components.json` (shadcn config)
- `components/ui/*` (button, card, dialog, dropdown-menu, sheet, slider, sonner, skeleton)
- `AGENTS.md` (coding-agent guidance: stack, conventions, do/don't list incl. "no PARTICLE/ANTHROPIC/SERVICE_ROLE keys in client components", "no Tailwind v3 patterns", "no `framer-motion` import", "no Particle embed unless U1 contingency forces fallback")

**Approach:**
1. Run `npx create-next-app@latest .` with `--typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm`. The project root is `/home/user/podium/`; verify it contains only `.claude/`, `.gitignore`, and `docs/` before running (no `lib/` exists yet).
2. Migrate from Tailwind v3 (which `create-next-app` scaffolds) to v4: install `@tailwindcss/postcss`, replace `@tailwind base/components/utilities` with `@import "tailwindcss";`, remove `tailwind.config.js`, add `@theme` block in `globals.css` (full theme tokens land in U10).
3. `npx shadcn@latest init`; let shadcn use our `@theme` tokens.
4. `npx shadcn@latest add button card dialog dropdown-menu sheet slider sonner skeleton`.
5. `npm i motion` (package: `motion`, import: `motion/react`).
6. Configure fonts via `next/font`: Geist Sans + Geist Mono.
7. Author `AGENTS.md`.
8. Smoke test: `npm run dev` boots; root page renders "Podium" wordmark on dark background.

**Patterns to follow:**
- Next.js 16 App Router conventions (server components by default).
- shadcn/ui's "copy, don't depend" philosophy.

**Test scenarios:**
- Test expectation: none — pure scaffolding.

**Verification:**
- `npm run dev` succeeds; `localhost:3000` shows styled "Podium" wordmark on dark background.
- `npm run build` and `tsc --noEmit` both pass.
- `AGENTS.md` exists.

---

### U3. Set up environment, secrets, and Supabase projects (staging + prod)

**Goal:** Establish the secret-management pattern and create **two** Supabase projects (staging + prod) so migrations can be tested before touching production.

**Requirements:** Foundational; supports R7, R13–R15, R7-Q2 cost-consciousness.

**Dependencies:** U2.

**Files:**
- `.env.local.example` (template with all variable names + comments)
- `.env.local` (gitignored — actual values for local dev pointing at staging Supabase)
- `lib/env.ts` (typed access using `@t3-oss/env-nextjs` with explicit `server`/`client` split — server-only vars throw build error if referenced from client components)
- `docs/solutions/2026-05-09-env-and-secrets-setup.md` (click-by-click walkthrough for Supabase, Anthropic, Particle, Vercel dashboards)

**Approach:**
1. **Create both Supabase projects:** sign in at supabase.com → New project → name `podium-staging` (any region) and `podium-prod` (closest to user). Save both database passwords.
2. Capture URLs and keys for each project from `Settings → API`. Service role keys go server-only; anon keys are client-safe.
3. Generate Anthropic API key with billing enabled.
4. Generate Particle API key (already done in U1 for verification; confirm it's stored).
5. Generate `CRON_SECRET` (random, used by manual `/api/ingest` route).
6. Generate `SUPABASE_JWT_SECRET` (used to mint synthetic stub-auth JWTs in v1 — see U5 stub-auth bridge).
7. Author `.env.local.example` with every variable + an `INGEST_DEV_MODE` flag (default `true` for dev, `false` for prod):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-safe)
   - `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (server-only)
   - `ANTHROPIC_API_KEY`, `PARTICLE_API_KEY`, `CRON_SECRET` (server-only)
   - `PODIUM_USER_ID` (the single hardcoded user UUID for v1 stub-auth)
   - `INGEST_DEV_MODE` (gates ingest pipeline to first 2 podcasts + 1-day window for cheap testing)
8. Populate `.env.local` against the **staging** Supabase project for local dev.
9. Write `lib/env.ts` using `@t3-oss/env-nextjs`'s server/client split — Next.js will fail the build at compile-time if a server-only var leaks into a client component.
10. Configure Vercel project Environment Variables: Production → prod Supabase keys; Preview → staging Supabase keys.

**Patterns to follow:**
- `@t3-oss/env-nextjs` server-only enforcement.
- One source of truth for env names — `.env.local.example` and `lib/env.ts` always match.

**Test scenarios:**
- Test expectation: none for behavioral correctness (configuration unit).
- **Smoke check:** boot dev server with one env var deliberately removed → app fails fast at module load with a clear error pointing to the missing variable.
- **Server/client guard:** add a temporary `'use client'` to a file that imports a server-only key → `npm run build` fails with a descriptive error from `@t3-oss/env-nextjs`.

**Verification:**
- Both `.env.local` and `.env.local.example` exist and match.
- Booting dev server reads env vars without warnings.
- The guard test confirms server-only enforcement.
- Solutions doc captures dashboard click-paths.

---

### U4. Connect podiumsports.app to Vercel

**Goal:** Production domain wired up so deploys are reachable at the real URL from day one.

**Requirements:** R17, supports the entire deployment story.

**Dependencies:** U2 (Vercel project must exist) and U3 (env vars in place for deploys to actually serve content).

**Files:**
- `vercel.json` (created — schema link, headers if needed)
- `docs/solutions/2026-05-09-domain-setup.md` (DNS + SSL walkthrough for the registrar)

**Approach:**
1. Add `podiumsports.app` and `www.podiumsports.app` as production domains in Vercel.
2. Add the DNS records Vercel surfaces at the registrar.
3. Wait for DNS propagation; Vercel auto-provisions Let's Encrypt SSL.
4. Verify HTTPS works on apex and www.

**Patterns to follow:**
- `.app` TLD is HSTS-preloaded; HTTPS is automatic and required.

**Test scenarios:**
- Test expectation: none — DNS configuration.

**Verification:**
- `https://podiumsports.app` and `https://www.podiumsports.app` serve the app over HTTPS.

---

### U5. Supabase schema + RLS policies + stub-auth bridge

**Goal:** Persistent data model that supports v1 (single user, stub auth) and extends without rewrite to v2 (multi-team) and v3 (multi-user). RLS policies are written once and continue to work across all three. **Includes the explicit stub-auth bridge** so RLS is exercised in v1, not bypassed silently.

**Requirements:** R1, R5, R8, R9, R13, R14, R15.

**Dependencies:** U3 (both Supabase projects exist).

**Files:**
- `supabase/migrations/0001_init_schema.sql` (all tables incl. `system_alerts` and `ingest_jobs`)
- `supabase/migrations/0002_rls_policies.sql`
- `supabase/migrations/0003_indexes.sql`
- `supabase/migrations/0004_pgcron_setup.sql` (refined in U8; created here as a stub)
- `lib/supabase/client.ts` (`createBrowserClient` + stub-JWT bootstrap)
- `lib/supabase/server.ts` (`createServerClient` per-request — uses anon key + stub JWT in v1, magic-link session in v3)
- `lib/supabase/admin.ts` (service-role client for Edge Function and trusted server routes; never imported into client code)
- `lib/auth/stub-jwt.ts` (mints a JWT signed with `SUPABASE_JWT_SECRET` whose `sub` claim matches `PODIUM_USER_ID` — replaced by real session in v3)
- `middleware.ts` (Supabase session refresh — no-op pass-through in v1; active in v3)
- `__tests__/lib/supabase/server.test.ts` (RLS smoke tests using two mock users)

**Approach:**

1. **Schema** (one migration file `0001_init_schema.sql`):
   - `auth.users` already exists in Supabase. Seed one row at runtime via the seeding script in U6 (UUID = `PODIUM_USER_ID`).
   - `teams (id text primary key, sport text not null, slug text not null, name text not null, palette jsonb not null, universe_id uuid not null)`
   - `universes (id uuid primary key, team_id text references teams(id), entities jsonb not null, storylines jsonb not null, updated_at timestamptz default now())`
   - `podcasts (id uuid primary key, particle_slug text unique, name text not null, kind text check (kind in ('team-specific','national')), in_catalog boolean default true)` — `particle_slug` nullable to accommodate U1 catalog misses.
   - `episodes (id uuid primary key, podcast_id uuid references podcasts(id), particle_episode_id text unique not null, title text not null, published_at timestamptz, audio_url text, raw_payload jsonb)`
   - `segments (id uuid primary key, episode_id uuid references episodes(id), particle_segment_id text unique, start_seconds int, end_seconds int, speaker text, raw_transcript jsonb, summary text, pull_quotes text[], bullets text[], engagement_score numeric, surfacing_entities text[])`
   - `cards (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, team_id text not null references teams(id), episode_id uuid not null references episodes(id), surfaced_at timestamptz default now(), total_relevant_seconds int, hidden boolean default false)` with unique constraint on `(user_id, team_id, episode_id)`.
   - `feedback (id uuid primary key, user_id uuid not null references auth.users(id), card_id uuid references cards(id), segment_id uuid references segments(id), surfacing_entity text, verdict text check (verdict in ('not_relevant','not_substantive','love')), created_at timestamptz default now())`
   - `api_calls (id uuid primary key, ts timestamptz default now(), provider text not null, endpoint text, model text, input_tokens int, output_tokens int, cost_usd numeric(10,6) not null, request_id text, metadata jsonb)` — global, no `user_id`.
   - `system_alerts (id uuid primary key, kind text not null, started_at timestamptz, finished_at timestamptz, episodes_count int, segments_count int, cost_usd numeric(10,6), notes text, payload jsonb, created_at timestamptz default now())` — observability + cost-aborted-run signaling.
   - `ingest_jobs (id uuid primary key, run_id uuid not null, shard_index int not null, podcast_ids uuid[] not null, status text check (status in ('pending','running','done','failed')), started_at timestamptz, finished_at timestamptz, error text)` — sharding state for the daily worker.

2. **RLS** (one migration file `0002_rls_policies.sql`):
   - Enable RLS on every table. Pattern for user-scoped tables:
     ```
     create policy "owner_rw" on cards
       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
     ```
   - `cards`, `feedback`: owner-RW with `auth.uid()`.
   - `episodes`, `segments`, `podcasts`, `teams`, `universes`: read by authenticated; write by service role only.
   - `api_calls`, `system_alerts`, `ingest_jobs`: read by authenticated; write by service role only. (v3 may scope these further; v1 is single-user so it's harmless.)
   - **Always include `WITH CHECK`** on user-scoped tables.

3. **Stub-auth bridge** (the gap doc-review surfaced):
   - **Server-side reads/writes from Edge Function and trusted route handlers** use `lib/supabase/admin.ts` (service role key). Service role bypasses RLS, so these paths must include explicit `WHERE user_id = $env.PODIUM_USER_ID` clauses in code. Documented in `lib/supabase/admin.ts` with a code comment forbidding cross-user writes.
   - **Client-side reads** from React Server Components and browser code use `lib/supabase/server.ts` / `lib/supabase/client.ts` with the **anon key + a synthetic JWT** minted by `lib/auth/stub-jwt.ts` (signs a JWT with `SUPABASE_JWT_SECRET` whose `sub` = `PODIUM_USER_ID`). RLS evaluates `auth.uid()` against the stub JWT subject; policies fire normally. **This means RLS is genuinely exercised in v1, not bypassed.**
   - In v3, `stub-jwt.ts` is removed; the Supabase auth client provides real JWTs. Policies and code paths unchanged.

4. **Indexes** (`0003_indexes.sql`): on `(user_id, ...)` for every user-scoped table; on `(podcast_id, published_at desc)` for episodes; on `(particle_segment_id)` for dedupe; on `(run_id, shard_index)` for `ingest_jobs`.

5. **RLS smoke test** (`__tests__/lib/supabase/server.test.ts`):
   - Seed two `auth.users` rows (mock user A = `PODIUM_USER_ID`, mock user B = a second random UUID).
   - Mint a stub JWT for B; attempt to read user A's card via the anon-client + B's JWT → assert zero rows.
   - As B, attempt to insert into `feedback` with `user_id = A.id` → assert RLS policy violation.
   - Repeat for `cards` insert.

**Execution note:** **The RLS smoke tests are non-negotiable.** They are the only automated guard on data isolation before v3 opens multi-user access. Do not skip them under time pressure.

**Patterns to follow:**
- `@supabase/ssr` server-client-per-request.
- Multi-tenant RLS pattern with explicit WITH CHECK (best-practices research).

**Test scenarios:**
- **Happy path:** seed user A, one team, one universe; insert one card for A; read as A via stub-JWT client → card returns.
- **Cross-user read isolation (security-critical):** read as B → zero rows. **Covers AE3 partial wiring.**
- **Cross-user write rejection (security-critical):** as B, insert feedback with `user_id = A.id` → RLS policy violation.
- **Service-role boundary:** an admin-client write succeeds without a JWT (intended); an admin-client read with `WHERE user_id != A.id` returns nothing for v1 (because only A is seeded).
- **WITH CHECK enforcement:** as A, insert feedback with `user_id = B.id` → policy violation. Catches missing WITH CHECK.
- **Index presence (sanity):** `select * from cards where user_id = $1 and surfaced_at > now() - interval '1 day'` shows index scan, not seq scan.

**Verification:**
- All migrations apply cleanly to staging via `supabase db push --project-ref <staging>`.
- Smoke tests pass.
- Stub-JWT minting works (a unit test on `lib/auth/stub-jwt.ts` confirms the minted JWT has the right `sub`).

---

### U6. Niners universe config + seed template

**Goal:** Encode the "what counts as 49ers content" definition (R3) and the curated 31-podcast list (R2) as data the daily worker can read at runtime.

**Requirements:** R2, R3, R16.

**Dependencies:** U1 (real Particle entity slugs) and U5 (tables exist).

**Files:**
- `config/podcasts.ts` (curated list with name + Particle slug + kind; entries with no slug are flagged `in_catalog: false`)
- `config/teams.ts` (`49ers` palette in OKLCH, sport, slug, universe reference)
- `lib/universes/49ers.ts` (entities + storylines as TS — populates the `universes` table)
- `supabase/seed.sql.example` (template with placeholder `__PODIUM_USER_ID__` and `__TIMESTAMP__` tokens)
- `scripts/seed-supabase.ts` (Node script that reads `PODIUM_USER_ID` from env, substitutes into the template, and applies via `supabase db query` against the targeted project — never commits the rendered SQL)
- `lib/universes/README.md` (notes the v1 single-team / single-sport simplification and where v2 multi-team logic plugs in)

**Approach:**

1. **`config/podcasts.ts`:** array of `{ name: string, particleSlug: string | null, kind: 'team-specific' | 'national' }` — 31 entries from the user's curated list. `null` slugs documented as "not in Particle catalog per U1's catalog hit-rate verification."
2. **`config/teams.ts`:** v1 ships one team; structure ready for v2 expansion. `palette` in OKLCH so contrast can be mathematically verified.
3. **`lib/universes/49ers.ts`:** `{ teamId: '49ers', entities: [...particleEntitySlugs], nameFallbacks: [...nameStrings], storylines: [...semanticQueries] }`. The `nameFallbacks` list is the contingency from U1-(E) — name-string semantic search for roster members not in Particle's entity graph.
4. **`supabase/seed.sql.example`:** committed template that seeds one `auth.users` row, the `49ers` team row, the `universes` row, and the `podcasts` rows. Real UUIDs and timestamps are placeholders.
5. **`scripts/seed-supabase.ts`:** reads `PODIUM_USER_ID` from env, substitutes into the template, applies. Idempotent (uses `on conflict do nothing` for everything).
6. **Sport disambiguation note (R16):** v1 has one team / one sport, so no ambiguity. The architecture is in place; v2 adds the disambiguation layer.

**Patterns to follow:**
- Config-as-code (TypeScript) hydrated via seed script.

**Test scenarios:**
- **Schema validity:** `entities` array of strings; `storylines` array of strings; `palette` parses as valid CSS color in each field.
- **Seed idempotency:** run `scripts/seed-supabase.ts` twice; second run produces zero new rows.
- **Universe shape:** seeded `universes` row contains the expected entity-count + nameFallbacks-count + storyline-count from `lib/universes/49ers.ts`.

**Verification:**
- After seeding, `select count(*) from podcasts where kind = 'team-specific'` ≥ 7 and `kind = 'national'` ≥ 20.
- The 49ers universe has at least 30 entities (or `entities + nameFallbacks` ≥ 30 if Particle coverage is thin per U1).
- `seed.sql.example` exists and is committed; `supabase/seed.sql` does NOT exist in the repo (gitignored).

---

### U7. Particle API client + cost telemetry + cost dry-run + contract tests

**Goal:** A single typed client wrapping every Particle endpoint we use, with cost telemetry on every call, a **cost dry-run helper** that estimates spend before any real seed runs, and a contract-test snapshot capturing Particle response shapes (so a Particle API change fails CI before production).

**Requirements:** R2, R3, R6, R8, supports cost-conscious operation per Q2 + adversarial finding A1.

**Dependencies:** U1 (real response shapes) and U5 (`api_calls` table).

**Files:**
- `lib/particle/client.ts`
- `lib/particle/tracked-call.ts` (cost telemetry wrapper)
- `lib/particle/types.ts` (created here — moved from U1 to avoid `create-next-app` directory conflict)
- `lib/particle/cost-estimate.ts` (dry-run helper)
- `lib/particle/__contracts__/*.json` (snapshot fixtures for each endpoint, captured during U1)
- `__tests__/lib/particle/client.test.ts` (unit + contract tests)

**Approach:**

1. **Types** (`lib/particle/types.ts`): narrow types reflecting only fields we use, derived from U1's findings.
2. **Tracked call wrapper** (`tracked-call.ts`): wraps every fetch, computes cost from a hardcoded price table (per-endpoint), inserts a row into `api_calls`. Exponential backoff + jitter on 429; categorize transient vs terminal errors.
3. **Client** (`client.ts`): typed methods for every endpoint we use — `searchByContent`, `searchEntityMentions`, `listEntities`, `listEpisodes`, `getClip`, `getClipTranscript`, `getWordLevelTranscript` (informational for now — MVP player doesn't call), `listClipsForEpisode`.
4. **Cost dry-run** (`cost-estimate.ts`): given `(universe, sinceTimestamp, podcastSlugs)` produces a worst-case USD spend estimate against the price table, without making any real calls. Used by U8's pre-flight gate.
5. **Contract tests** (`__contracts__/*.json` + tests): one snapshot per endpoint capturing the response shape. CI runs schema-validation against the snapshots; if Particle changes a field, CI fails.

**Patterns to follow:**
- Trackable-call wrapper from best-practices research.
- Snapshot-test-as-contract pattern.

**Test scenarios:**
- **Happy path:** mocked `searchEntityMentions` returns 3 results; assert typed parse + one `api_calls` row.
- **Zero-result cost log:** zero-result response still writes a row (calls cost money even with no hits).
- **Retry on 429:** mock 429 → 429 → 200; assert two retries with backoff; assert three `api_calls` rows.
- **Terminal 401:** mock 401; assert typed `ParticleAuthError`; no retry; one `api_calls` row with `cost_usd = 0`.
- **Schema validation:** mock response missing required field; assert typed schema error.
- **Cost dry-run:** call `estimateCost({ universe: testUniverse, sinceTimestamp: 3-days-ago, podcastSlugs: testList })`; assert returned number is non-zero and a function of input size.
- **Contract test:** load snapshot for `getClip`; mock client returns same shape; assert validation passes. Mutate one field name; assert validation fails.

**Verification:**
- Unit + contract tests pass in CI.
- A live integration test (gated, run manually): one real call to Particle hits the dashboard's request counter and writes a row to local Supabase.

---

### U8. Daily ingestion worker + manual trigger + status endpoint

**Goal:** The worker that runs daily at 6am ET and ships sharded across multiple Edge Function invocations to handle volume. Plus a manual `/api/ingest` route handler for dev runs and the "Run now" button, plus `/api/ingest/status` for the first-run loading UI.

**Requirements:** R1, R2, R3, R7, R8, F2, Q8 first-run experience.

**Dependencies:** U6, U7, U9.

**Files:**
- `supabase/functions/daily-digest/index.ts` (Deno Edge Function — processes ONE shard per invocation, chains via pg_net)
- `supabase/functions/daily-digest/import_map.json` (explicit Deno imports for cross-runtime parity)
- `supabase/functions/daily-digest/_pipeline-deno.ts` (Deno-flavored pipeline; **co-located** with the Edge Function rather than imported from `lib/` because Deno doesn't honor Next.js `@/*` aliases)
- `supabase/migrations/0004_pgcron_setup.sql` (refined; schedules `daily-digest` and the chain helper)
- `app/api/ingest/route.ts` (manual trigger, POST, validates `CRON_SECRET`, rate-limited)
- `app/api/ingest/status/route.ts` (GET, returns current `ingest_jobs` run status for the first-run loading UI)
- `lib/ingest/pipeline.ts` (Node-flavored pipeline shared by route handler; **logically mirrors** the Deno pipeline; both are validated against the same integration test)
- `__tests__/lib/ingest/pipeline.test.ts`

**Approach:**

1. **Two pipelines, one shape.** `lib/ingest/pipeline.ts` (Node, used by route handler) and `supabase/functions/daily-digest/_pipeline-deno.ts` (Deno, used by Edge Function) implement the same logic against the same `IngestPipelineInput` and `IngestPipelineOutput` types. Both are exercised by the same integration test (running once in Node, once in Deno). This is duplication on purpose — cross-runtime module resolution is fragile, and a Deno-Node bridge would be more complex than co-locating.

2. **Sharded execution model:**
   - At run start: pre-flight cost-estimate from U7. If estimate > 60% of remaining starter credit and no payment method on file (per Particle metadata), abort with a `system_alerts` row of kind `cost_abort`.
   - Otherwise: write rows to `ingest_jobs` — one row per shard of ~10 podcasts. Status `pending`.
   - Each Edge Function invocation: claim the next `pending` job, set status `running`, process, set status `done` (or `failed` with error). Then call `pg_net` to invoke itself again for the next pending job. Last shard exits without re-invoking.
   - All shards together write to `system_alerts` once with the run's totals on completion.

3. **Per-shard pipeline** (`pipeline.ts`):
   - Read the active universe + the shard's podcast list.
   - Parallel calls to Particle (entity-mention search per entity, semantic search per storyline, episode listing for the shard's podcasts since `sinceTimestamp`).
   - Union + dedupe by `(episode_id, segment.start)`. Skip segments already cached.
   - Per new segment: `getWordLevelTranscript` (used today only for transcript text; word-level data captured for v2 player), then summarize via U9 (realtime Messages, prompt caching).
   - **Per-episode transaction**: episode + all its segments + the card row commit together. Cards across different episodes are independent transactions.
   - Idempotent upserts: `on conflict (particle_segment_id) do nothing` on segments; `on conflict (user_id, team_id, episode_id) do update ...` on cards.

4. **`pg_cron` schedule** (in `0004_pgcron_setup.sql`): `0 11 * * *` UTC = 6am ET (summer). Schedule pg_net call to the Edge Function with `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` header so the Function can be configured to require auth (not publicly invocable).

5. **Auto-seed first-run logic (Q8):** if no prior `cards` exist for the user, `sinceTimestamp = now() - interval '3 days'`. Otherwise `sinceTimestamp = max(cards.surfaced_at) - safety_margin`.

6. **Dev mode (Q2 cost-consciousness):** when `INGEST_DEV_MODE=true`, the pipeline filters to first 2 podcasts in `config/podcasts.ts` and uses a 1-day window. Logic inlined in `pipeline.ts`; no separate file.

7. **Manual trigger** (`app/api/ingest/route.ts`):
   - POST with `Authorization: Bearer ${CRON_SECRET}`. 401 on mismatch.
   - **Rate limit:** one successful invocation per 60 seconds. Enforced by checking `system_alerts` for the most-recent `kind='manual_run'` row and rejecting if `now() - that_row.created_at < 60s`.
   - Forwards to the Edge Function via `pg_net`.
   - Returns a structured response: `{ runId, sharded: true, shards: N }` so the UI can poll status.

8. **Status endpoint** (`app/api/ingest/status/route.ts`): GET, returns `{ runId, totalShards, doneShards, failedShards, status: 'pending' | 'running' | 'done' | 'failed', latestSystemAlert }`. Authenticated via stub-JWT — no `CRON_SECRET` needed since it's a read.

**Execution note:** Build the integration test first against `lib/ingest/pipeline.ts` (Node). Once it passes, port to Deno and verify the same test fixture produces the same DB state under the Deno path. This catches cross-runtime drift the moment it appears.

**Patterns to follow:**
- pg_cron + pg_net (research finding).
- Idempotent upsert with `on conflict`.
- Co-located pipeline duplication (justified above).

**Test scenarios:**
- **Happy path:** mock universe, mock Particle responses (3 episodes across 2 podcasts), mock summarization. Run pipeline against fresh staging DB. Assert 3 episode rows, ≥3 segment rows, 3 card rows, surfacing_entities populated.
- **Idempotency:** run twice on same window; second run produces 0 new rows. **Covers AE5.**
- **Empty Particle result:** zero hits; pipeline completes cleanly; one `system_alerts` row with `episodes_count: 0`.
- **Particle 500 mid-run:** persists what completed; surfaces error in `system_alerts`; doesn't corrupt DB.
- **Sharding:** seed 30 podcasts; pipeline writes 3 `ingest_jobs` rows; first invocation processes shard 0 + chains; chain completes all 3 shards.
- **Cost-abort:** mock cost estimate > 60% of `$10` credit; assert no Particle calls made; assert `system_alerts` row with kind `cost_abort`.
- **Cross-run dedupe:** seed `segments` with one record; mock Particle response includes that segment → skipped (no transcript re-fetch).
- **Manual trigger auth:** POST without secret → 401; with wrong secret → 401; with correct secret → 200.
- **Manual trigger rate limit:** two POSTs within 60s → second returns 429 with `Retry-After`.
- **Status endpoint:** Covers F1 first-run UX. With pending run, returns expected status object.
- **Dev mode bound:** with `INGEST_DEV_MODE=true`, assert Particle call count is bounded to 2 podcasts × universe entities.

**Verification:**
- Tests pass in CI.
- A real (non-dev-mode) run against staging Supabase + real Particle (small universe, narrow window) produces real cards.
- `pg_cron` schedule visible in `select * from cron.job` on staging.
- `system_alerts` populates correctly across run completions.

---

### U9. Claude Haiku summarization (realtime + prompt caching)

**Goal:** Convert a Particle segment + its transcript into the unified output format (R4): summary + pull quotes + bullets, scoped strictly to 49ers content. **Realtime Messages API only — Batches dropped.**

**Requirements:** R4, R5, supports F2.

**Dependencies:** U7 (segment shape) and U5 (writes back to `segments`).

**Files:**
- `lib/anthropic/client.ts`
- `lib/anthropic/summarize.ts` (segment-level)
- `lib/anthropic/summarize-episode.ts` (episode-level rollup)
- `lib/anthropic/prompts/segment-summary.ts` (system prompt with cache markers)
- `__tests__/lib/anthropic/summarize.test.ts`

**Approach:**

1. **Client:** `@anthropic-ai/sdk` v0.30+; reads `ANTHROPIC_API_KEY`.
2. **Realtime Messages with prompt caching.** No Batches API. The system prompt + universe context get `cache_control: { type: "ephemeral" }`. Cache hit returns 90% input cost reduction; first call per minute primes the cache.
3. **Cache prefix size verification:** the plan does not assert a specific minimum-token threshold. **At execution time**, verify the current Haiku cache-prefix minimum from Anthropic docs. If our system+universe context falls short, pad with structured few-shot examples until it caches. If it's already enough, ship as-is.
4. **Prompt structure for segment summary:**
   - System prompt (cacheable): voice rules, output format ("return JSON with `summary`, `pull_quotes` ≤3, `bullets` 3–5"), explicit anti-instructions ("do not invent facts not present in transcript", "do not include content unrelated to 49ers").
   - User message: transcript with speaker labels + episode/podcast metadata.
5. **Output validation via `zod`.** On parse failure, retry once with a "your prior response wasn't valid JSON" follow-up. After two failures, persist `summary = null` and surface the segment as a degraded card.
6. **Quote fidelity guard:** every `pull_quote` must be a substring of the transcript text; otherwise reject and retry.
7. **Episode-level summary** (`summarize-episode.ts`): given the segment summaries, produces a 2–3 sentence episode-level summary that drives the card surface text (R5).
8. **Cost telemetry**: every Anthropic call writes to `api_calls` with token counts, including separated `cache_read_input_tokens` so cost is computed at the discounted rate.

**Patterns to follow:**
- Prompt caching with `ephemeral` markers (research finding).
- `zod` validation for LLM output safety.
- Anti-slop principles for prose: no unnecessary preamble, no hedging, direct voice.

**Test scenarios:**
- **Happy path:** mocked transcript "Brock Purdy threw three TDs against the Seahawks…"; mocked Anthropic response with valid JSON; assert parsed shape.
- **Quote fidelity:** mocked response with quote not in transcript; assert client rejects and retries. After two rejections, persists `summary = null`.
- **Off-topic exclusion:** mocked transcript mentions Tom Brady (no 49ers); assert response is empty/null and segment marked non-49ers.
- **JSON parse recovery:** mock prose-not-JSON on first call, valid JSON on retry; client succeeds.
- **Token cost telemetry:** mock response with `usage.input_tokens=5000, output_tokens=200`; assert `api_calls` row with `model='claude-haiku-4-5'`, correct token counts, cost from price table.
- **Cache-hit cost math:** mock response with `cache_read_input_tokens=4500, input_tokens=500, output_tokens=200`; assert cost computed at the cache-hit discount rate.

**Verification:**
- All tests pass.
- A live integration test (gated): real call to Anthropic with a real transcript produces a valid summary; quote fidelity holds on real output.

---

### U10. Design system foundation (single team in v1)

**Goal:** Visual scaffolding for v1. Tailwind v4 `@theme`, OKLCH dark palette, motion presets (inlined into `components/player/`), Geist font, hardcoded `data-team="49ers"`. **No team-theme-provider component in v1** — that's deferred to v2 when there's an actual team switcher.

**Requirements:** R17, R5, R6.

**Dependencies:** U2 (Tailwind/Motion installed) and U6 (palette config exists).

**Files:**
- `app/globals.css` (full `@theme inline` block; `@property` registrations for `--accent` and `--accent-fg` as forward-compat stubs; dark-first defaults; reduced-motion fallback)
- `app/layout.tsx` (modified — hardcodes `data-team="49ers"` on `<html>`)
- `components/player/motion-presets.ts` (motion springs/easings, co-located with their primary consumer)
- `__tests__/lib/palette/contrast.test.ts` (WCAG contrast verification for every team palette in `config/teams.ts`)

**Approach:**

1. **`@theme` tokens:** dark-first surface colors (3 OKLCH tones around L=0.14/0.18/0.22), text colors, the team-adaptive `--accent` and `--accent-fg` (set via `:root[data-team="49ers"]`), ring tokens, motion timing tokens.
2. **`@property` registration** for `--accent` and `--accent-fg` (forward-compat — enables smooth transitions when v2 introduces team switching). 3 lines of CSS; costs nothing.
3. **Hardcoded team selector:** `app/layout.tsx` sets `<html data-team="49ers" class="dark">`. The team-theme-provider component planned previously is **deferred to v2**.
4. **Type pairing:** Geist Sans (UI) + Geist Mono (data/code). No display face in v1 (Q7 — no brand work).
5. **Motion presets** (`components/player/motion-presets.ts`): springs.gentle = `{ stiffness: 120, damping: 14 }` (Arc-feel); springs.snappy = `{ stiffness: 220, damping: 22 }`; easings.out = `[0.32, 0.72, 0, 1]`. Imported by player + (when needed) digest components — co-located rather than in `lib/` since they primarily serve the player.
6. **Reduced-motion fallback:** under `prefers-reduced-motion`, springs collapse to instant transitions and the team-accent transitions snap rather than animate.
7. **Anti-AI-slop principles** (carry forward into U11–U13 patterns-to-follow): surface hierarchy via tone (no border-everywhere), one accent used sparingly, deliberate left-alignment, no center-everything, no rainbow gradients, no rounded-2xl-with-emoji-headings, no friendly blob illustrations.
8. **Contrast verification test:** for every team palette in `config/teams.ts`, assert WCAG AA contrast ≥4.5:1 between accent and the dark surface tones. Fails CI if a future team palette violates contrast.

**Patterns to follow:**
- Tailwind v4 `@theme inline` + `@property` (research).
- Anti-AI-slop principles (research).

**Test scenarios:**
- **Theme attribute set:** layout renders with `<html data-team="49ers">`.
- **Accent token resolves:** `getComputedStyle(html).getPropertyValue('--accent')` returns the 49ers OKLCH value.
- **Reduced-motion:** with `prefers-reduced-motion: reduce`, motion spring durations are 0.
- **Contrast (WCAG):** every team palette accent vs. dark surface ≥ 4.5:1. CI fails if violated.
- **No theme provider in render tree:** assert no `team-theme-provider` component exists in the render tree (regression guard against re-introducing it before v2 is ready).

**Verification:**
- A render of `app/page.tsx` shows dark surface, 49ers red accent on a sample button, Geist Sans body, Geist Mono numerals. Looks intentional.

---

### U11. Card-per-episode digest view (mobile-first, with feedback filter and loading recovery)

**Goal:** The home screen — vertical scroll of cards on mobile, one per episode that contained 49ers content in the digest window. Server-rendered. **Filters out cards the user has marked "Not relevant" so AE3 actually works on refresh.** Includes timeout / failure recovery on the first-run loading state.

**Requirements:** R4, R5, F1, AE1, AE2, AE3, mobile-first per Q6.

**Dependencies:** U10, U5 (data layer + stub-auth bridge), U6 (universe + seed), U8 (`/api/ingest/status`).

**Files:**
- `app/(app)/layout.tsx` (top app bar — team chip, settings link)
- `app/(app)/page.tsx` (RSC fetches today's cards filtered by feedback; renders the grid)
- `components/digest/episode-card.tsx` (card surface — total-time pill inlined here, not a separate component)
- `components/digest/segment-list.tsx`
- `components/digest/loading-skeleton.tsx`
- `components/digest/loading-state.tsx` (manages the first-run sequence: skeleton → ready → error)
- `components/digest/empty-fallback.tsx` (defensive — for the rare zero-content edge case)
- `components/digest/refresh-banner.tsx` (appears when `/api/ingest/status` reports a fresh run completed while the user has the page open)
- `__tests__/components/digest/episode-card.test.tsx`
- `__tests__/app/(app)/page.test.tsx`

**Approach:**

1. **`app/(app)/page.tsx` as RSC:** uses the server client + stub-JWT to fetch `cards` joined to `episodes` and a small projection of `segments` for the user's current team, ordered by `surfaced_at desc`, **with a LEFT JOIN on `feedback` filtering out any card or segment where the current user has `verdict='not_relevant'`**. RLS automatically scopes by `auth.uid()` (= stub-JWT subject). This is the AE3 fix.
2. **`episode-card.tsx`:** mobile-first — full-width; podcast artwork (~120×120 on mobile); episode title; podcast name + date (low-emphasis); inlined total-time pill ("8 min across 3 segments"); episode-level summary (2–3 sentences); expand affordance.
3. **Expanded state:** opens a sheet (mobile) or inline expansion (desktop). **Information hierarchy inside the sheet:** episode-level summary at top → segments below in chronological order, each showing its summary + pull quotes + bullets + audio player. Sticky header with episode title. Dismiss via swipe-down OR explicit close button (don't rely on swipe alone — D9 fix).
4. **First-run loading state** (`loading-state.tsx`):
   - When the user has zero cards AND a pending `ingest_jobs` run exists (per `/api/ingest/status`): render skeleton + "Preparing your first digest…" + a step counter ("Shard 1 of 3").
   - Polls `/api/ingest/status` every 2s.
   - **Timeout:** if no progress for 60s, show "This is taking longer than expected — [Try again] [Continue waiting]" with explicit user choice.
   - **Failure recovery:** if status returns `failed`, show "Something went wrong with your first run — [Retry] [View details]". The retry calls `/api/ingest` (manual trigger).
   - **Empty result after success:** if status is `done` but zero cards exist (rare — quiet day, niche team), render the empty fallback with "No 49ers content in the last 3 days. Check back tomorrow or expand your sources."
5. **Mid-ingestion state for active users** (`refresh-banner.tsx`): when user has the page open and a fresh ingest completes, a banner appears: "New digest ready — tap to refresh." Clicking reloads the RSC. Avoids surprising the user with auto-changing content.
6. **Mobile-first specifics:** thumb-reach target sizes (44pt min); tap-targets are full-width-tappable; sticky team chip header; horizontal scroll deliberately avoided.
7. **Density (anti-AI-slop):** show 5–8 cards above the fold, not 2.

**Patterns to follow:**
- RSC for data fetching; `'use client'` only for the expand/feedback affordances and the polling hooks.
- shadcn Sheet primitive for the mobile expand surface.
- Motion `layout` for re-layout when feedback filters cards out.
- Anti-AI-slop principles from U10: deliberate left-alignment, surface tone hierarchy, one accent (used on play button + active segment), no center-everything.

**Test scenarios:**
- **Happy path:** seed 3 cards; render `app/(app)/page.tsx`; assert 3 episode-card components with correct titles + summaries + total times. **Covers AE1, AE2.**
- **AE3 (the doc-review fix):** seed 3 cards; insert `feedback` row with `verdict='not_relevant'` for card 2; refresh render; assert only cards 1 + 3 appear. **Covers AE3.**
- **Loading skeleton:** zero cards + pending ingest_jobs row; assert skeleton + "Preparing…" + shard counter render.
- **Loading timeout:** zero cards + pending ingest_jobs that hasn't progressed in 60s; assert timeout UI shows.
- **Loading failure:** ingest_jobs reports `failed`; assert failure UI with Retry button.
- **Empty after success:** ingest_jobs done + zero cards; assert empty fallback.
- **Refresh banner:** initial render with N cards; mock `/api/ingest/status` polling returning a newer `runId`; assert banner appears.
- **Date sort:** seed 3 cards with different `surfaced_at`; assert descending order.
- **Hidden cards excluded:** seed card with `hidden=true`; assert not rendered.
- **Mobile breakpoint:** render at 375px width; assert single-column.
- **Accessibility:** assert `<article>` semantic, episode title is heading, total-time has `aria-label`.

**Verification:**
- Real-device demo (iPhone or Android) confirms the design feels intentional.
- Lighthouse mobile Performance + Accessibility ≥ 90.

---

### U12. MVP audio player with segment-level highlighting

**Goal:** Ship a designed-but-MVP audio player in v1: native `HTMLAudioElement` + custom chrome + **segment-level transcript highlighting** (the active segment is highlighted; individual words are not). Includes explicit loading/buffering/error states and keyboard navigation. **Full word-level RAF-driven highlighting + wavesurfer waveform + virtualization is deferred to a v2 player evolution gated on real usage data showing the player gets tapped.**

**Requirements:** R6, F4, R17.

**Dependencies:** U1 (raw audio URL confirmed; word-level data captured for v2 even though MVP doesn't use it), U10 (motion presets, theme tokens), U11 (rendered inside expanded card).

**Files:**
- `components/player/audio-player.tsx` (top-level container)
- `components/player/transcript.tsx` (segment-level highlight; click-to-seek at segment granularity)
- `components/player/scrubber.tsx` (Motion-driven drag scrubber)
- `components/player/playback-states.tsx` (loading / buffering / error UI surfaces)
- `lib/audio/use-audio-element.ts` (hook wrapping HTMLAudioElement lifecycle)
- `__tests__/components/player/audio-player.test.tsx`
- `__tests__/lib/audio/use-audio-element.test.ts`

**Approach:**

1. **Native `<audio>` element + custom UI.** `<audio ref preload="metadata" src={clipAudioUrl}>` mounted invisibly; all controls render around it.
2. **Segment-level highlighting (MVP simplification):** the active *segment* (not word) is highlighted. On `timeupdate`, simple comparison of `currentTime` against segment start/end times decides which segment is active. Re-rendering ~5 segments isn't a perf concern — no RAF loop, no React reconciliation worry.
3. **Click-to-seek at segment granularity:** each segment is a `<button data-start={seconds}>`; click sets `audioRef.current.currentTime = data-start`.
4. **Drag scrubber** (Motion): `<motion.div drag="x" dragConstraints={...} dragSnapToOrigin="x">` + `useSpring` on the playhead. On drag end, set `currentTime`.
5. **Explicit playback states** (`playback-states.tsx`):
   - **Loading:** `<audio>` is in `readyState < 2`. UI: skeleton wave + "Loading…" caption + disabled play button.
   - **Buffering mid-play:** `waiting` event fires while `currentTime` doesn't advance. UI: subtle pulse on the scrubber thumb + "Buffering" indicator.
   - **Error:** `error` event fires (MEDIA_ERR_NETWORK, MEDIA_ERR_DECODE). UI: "Audio unavailable — Open episode in [podcast app]" with a deep-link to the source episode URL.
   - **Stalled / network offline:** `stalled` event + `navigator.onLine === false`. UI: "Reconnecting…" with retry button.
6. **Keyboard navigation:** Space to play/pause, Left/Right arrows to seek ±5s, Home/End to jump to start/end. `aria-roles` on the player container (`role="region"` + `aria-label="Audio player"`); transcript region has `aria-live="off"` (we don't want every segment change announced — only initial focus).
7. **Mobile UX:** large play button (56pt), single-tap-to-play, swipe-down to dismiss the player sheet. Volume control omitted (use system).
8. **Reduced-motion fallback:** scrubber drag falls back to native; transcript highlight uses CSS-only color change.
9. **Audio URL handling per U1 contingencies:**
   - If U1 confirmed permanent URLs: pass directly to `<audio src>`.
   - If U1 confirmed signed/expiring URLs: load via `/api/clips/[id]/audio` route handler that re-signs at request time (defined in U1's contingency, implemented here).
10. **No wavesurfer in MVP.** Visual waveform is deferred until usage data shows the player is tapped.
11. **No transcript virtualization in MVP.** Segment count per clip is small (<10 typically); 100 segment buttons render fine without virtualization.

**Execution note:** Build U12 incrementally: native audio + play/pause + scrubber → segment highlighting + click-to-seek → playback-states (loading/buffering/error) → keyboard nav. Each substep ships independently testable. Do not start with the full feature surface.

**Patterns to follow:**
- Native HTMLAudioElement + custom chrome (avoid React-h5-audio-player).
- Anti-AI-slop principles from U10: avoid centered-everything, generic icon-in-colored-circle play buttons, uniform rounded corners on every control. Take design risk on the play button + scrubber treatment; let the rest follow type+spacing.

**Test scenarios:**
- **Audio loads metadata:** mock `loadedmetadata` with duration=120; assert duration displays.
- **Play/pause:** click play; assert `play()` called + UI shows pause icon. Click again; assert `pause()`.
- **Segment highlighting:** segments at [0–10s, 10–25s, 25–40s]; mock `currentTime` sequence [5, 15, 30]; assert correct segment has `data-active="true"` at each.
- **Click-to-seek:** click segment with `data-start=15`; assert `audioRef.currentTime === 15`. **Covers AE6.**
- **Drag scrubber:** simulate drag from 0 to 60% width; assert `currentTime` set to ~60% of duration.
- **Reduced-motion:** with `prefers-reduced-motion: reduce`, assert no spring transitions on scrubber.
- **Loading state:** `readyState=0`; assert loading skeleton + disabled play button.
- **Buffering state:** dispatch `waiting` event during play; assert buffering indicator + scrubber pulse.
- **Error state:** dispatch `error` event; assert error UI with "Open in podcast app" deep-link visible.
- **Keyboard play:** focus player; press Space; assert play. Press again; assert pause.
- **Keyboard seek:** focus player; press ArrowRight; assert `currentTime += 5`.
- **Cleanup on unmount:** mount, then unmount; assert audio element removed; assert event listeners cleaned up.
- **Signed URL refresh** (only if U1 contingency C fires): load player; assert `/api/clips/[id]/audio` is called rather than direct Particle URL.

**Verification:**
- Real iPhone: tap a Mina Kimes 90-second clip card; player appears; tap play; audio plays; segment highlights advance with playback; tap a different segment; audio seeks. Player feels designed, not generic.
- Lighthouse Performance ≥ 85 on the expanded-card page.
- Lighthouse Accessibility ≥ 90 with keyboard navigation tested.

---

### U13. Feedback bar (no /usage UI in v1)

**Goal:** Per-segment feedback affordances (R9, F3) with an undo toast for accidental "Not relevant" taps. **The cost-telemetry UI surface (`/usage` page) is deferred to v2** — the `api_calls` table still populates, but query the Supabase dashboard directly until v1 ships.

**Requirements:** R9, F3.

**Dependencies:** U5 (`feedback` table) and U11 (cards rendered) and U12 (player rendered).

**Files:**
- `components/feedback/feedback-bar.tsx` (three-button row at card foot)
- `components/feedback/undo-toast.tsx` (5s undo affordance after "Not relevant")
- `app/api/feedback/route.ts` (POST handler — uses anon-key + stub-JWT for v1 RLS-exercised writes)
- `lib/feedback/optimistic.ts` (optimistic UI helper)
- `__tests__/components/feedback/feedback-bar.test.tsx`
- `__tests__/app/api/feedback/route.test.ts`

**Approach:**

1. **Three-button row:** `Not relevant` (X), `Not substantive` (filter), `Love this` (heart). Color-neutral by default; team accent on hover. Tappable target ≥44pt.
2. **Optimistic UI with undo:**
   - On "Not relevant": optimistic `motion.div exit` removes the card immediately, fires POST to `/api/feedback` in background, AND shows an **undo toast** ("Hidden — Undo") for 5 seconds. Tapping Undo restores the card visually and DELETEs the feedback row.
   - On "Not substantive" / "Love this": optimistic UI shows the verdict registered (icon fills); POST in background; rollback on error.
3. **Route handler `/api/feedback`** (POST):
   - **Uses the anon-key client + the user's stub JWT** from cookies (NOT the service role) so RLS evaluates the insert. This means the route handler cannot insert with a forged `user_id` — RLS enforces the user matches.
   - Validates the body; inserts into `feedback`; returns 200 on success.
   - DELETE on the same route accepts `feedback_id` and deletes if owner matches (for the Undo flow).
4. **Server-side hide logic moved to U11:** since U11 already filters cards by feedback (the AE3 fix), nothing additional is needed here for persistence. Refreshing the page keeps the card hidden.
5. **No `/usage` page in v1.** The `api_calls` table populates from U7's tracked-call wrapper. To check spend, query Supabase dashboard SQL editor with `select date_trunc('day', ts) as day, provider, sum(cost_usd) from api_calls group by 1, 2 order by 1 desc;`. Documented in `docs/solutions/2026-05-09-cost-monitoring.md` (created during U13).

**Patterns to follow:**
- Optimistic UI + rollback (standard React 19 pattern).
- Anti-AI-slop from U10: feedback buttons are NOT three equal-weight gradient buttons in a row. Use icon-only treatment with subtle hover states; visual hierarchy via type + spacing.

**Test scenarios:**
- **Happy path (Not relevant):** click; assert optimistic removal; assert POST to `/api/feedback`; assert undo toast appears.
- **Undo:** click "Not relevant"; click Undo within 5s; assert DELETE to `/api/feedback`; assert card reappears.
- **Undo timeout:** click "Not relevant"; wait 5s; assert toast disappears; card stays hidden.
- **Rollback on POST failure:** mock POST 500; assert card reappears with error toast.
- **Route handler RLS-exercised insert:** POST with stub-JWT for user A; assert `feedback.user_id` = A's UUID (RLS auto-fills via `with check`).
- **User_id spoofing rejected:** POST with stub-JWT for A but `user_id: B.id` in body → RLS rejects with policy violation.
- **All three verdicts:** all three buttons fire correct verdicts; only "Not relevant" triggers the undo toast.
- **DELETE owner check:** POST as A creates feedback row; DELETE as B (stub-JWT for B) → RLS rejects.

**Verification:**
- Demo on real device: marking card as Not relevant → smooth exit + undo toast appears + tapping Undo restores card. Refreshing the page keeps Not-relevant cards hidden (the AE3 wiring from U11).
- Cost monitoring solutions doc captures the SQL query.

---

## Scope Boundaries

### Deferred for later (origin)

- Additional teams beyond the 49ers (Giants, Warriors, Sharks). Architecture supports them; v1 ships only one to validate the loop.
- Multi-team UI chrome (section headers per team, switcher). Wakes up in v2.
- Real auth flows beyond stub (magic link via Supabase). Wakes up in v3.
- "Discovery" surface that pulls from the full Particle library (not just curated podcasts). Architecture supports it; v1 renders the curated surface only.
- Auto-refresh of roster from external NFL data. v1 uses manually-maintained roster config.
- Phase 2 feedback intelligence (per-show automatic weighting via SQL aggregation).
- Phase 3 feedback intelligence (LLM borderline-case relevance check).
- Email digest, push notifications, stitched personal-podcast-feed delivery. v1 is web-app-only.
- Other content sources from the original vision (YouTube clips, tweets, articles).
- Mobile-native apps. v1 is responsive web only.

### Outside this product's identity (origin)

- Hosting or re-hosting podcast audio.
- A general-purpose podcast app or "Spotify for sports."
- A breaking-news ticker.
- Discovery-driven content ("what podcasts should I follow?").
- Editorial content.

### Deferred to Follow-Up Work (plan-local — newly added in revision)

- **Brand identity work** (wordmark design, logo, full color exploration). Per Q7 — defer to v2.
- **Full word-level RAF transcript highlight + wavesurfer waveform + virtualization in audio player.** v1 ships MVP segment-level player; full evolution gated on usage data showing the player is tapped.
- **`team-theme-provider` runtime component.** v1 hardcodes `data-team="49ers"`; provider lands in v2 when there's an actual team switcher.
- **`/usage` page UI.** Cost telemetry data populates the `api_calls` table; UI deferred to v2. Use Supabase SQL editor in the meantime.
- **Anthropic Message Batches API integration.** Realtime Messages with prompt caching covers v1 cost needs; revisit Batches if volume grows enough that the 50% discount matters.
- **Full word-level data wiring through ingestion.** U1 captures the response shape; U8 stores it in `segments.raw_transcript` (jsonb); v2 player consumes it. v1 ingestion stores but doesn't render.
- **Anti-rugpull contract test for Particle.** Initial snapshot fixtures captured in U7; nightly contract-drift CI job deferred to v2.
- **`/usage` page on top of `api_calls`.** The data will be there from day one; the UI lands in v2.

---

## Key Technical Decisions

- **49ers-only for v1, multi-team / multi-sport architecture from day one.** Validated cost: small (one config row + one universe file per future team). Validated benefit: zero rework in v2.
- **Particle as the podcast intelligence layer.** Eliminates transcription/segmentation/hosting infrastructure. Verified scope expanded in U1 to 8 dimensions, not 2.
- **Curated podcast list as default; discovery as deferred Phase 2.** Curation quality first.
- **Daily morning cadence; cadence-as-config.** Tighten when the value is proven.
- **Card-per-episode digest shape.** Directly answers the original "is this 90-min episode worth my time?" question.
- **Unified output format (summary + pull quotes + bullets) regardless of segment length.** One mental model.
- **"Niners universe" is config (entities + nameFallbacks + storylines), not code.** Per-team scaling via config files.
- **Multi-phase feedback intelligence (passive log → SQL weighting → LLM check).** Pay for ML only after data justifies it.
- **MVP-first audio player.** v1 ships native `<audio>` + segment-level highlight + designed chrome. Full word-level RAF + wavesurfer + virtualization is deferred until usage data shows the player gets tapped (per adversarial finding A5).
- **Realtime Anthropic Messages + prompt caching, NOT Message Batches.** At solo volume the 50% Batches discount is ~$0.50–$1/month — not worth the webhook architecture required to bridge Batches' 24h SLA with the 150s Edge Function wall (per feasibility F1).
- **Sharded daily worker via `ingest_jobs` + `pg_net` chaining.** Effectively unbounded total runtime via 150s windows chained together; resumable on failure (per feasibility F2).
- **Stub-auth bridge: server-side service-role with explicit user_id WHERE clauses; client-side anon-key + synthetic JWT.** RLS is genuinely exercised in v1, not bypassed silently. v3 swap is just JWT-source replacement (per security S2).
- **Staging + production Supabase projects, not single-project.** Migrations test in staging before promotion (per adversarial A6).
- **`supabase/seed.sql` gitignored; `seed.sql.example` template committed.** Real UUIDs never reach git; runtime substitution from `PODIUM_USER_ID` (per security S1).
- **Two pipeline files (Node + Deno) shared by integration test, not import-bridged.** Cross-runtime module resolution is fragile; co-located duplication validated by single test fixture is more robust than a Deno-Node import-map gymnastics layer (per feasibility F4).
- **`docs/solutions/` learnings written per-unit during execution.** Future agents skip relearning tax.
- **Stack: TypeScript + Next.js (App Router) + Tailwind v4 + shadcn/ui + Motion on Vercel; Supabase (Pro) + Anthropic (Haiku 4.5).** Leverages user's existing paid tooling; design-friendly; low marginal cost.

---

## Risks & Mitigations

- **Risk: U1 verification surfaces multiple Particle limitations.** Mitigation: U1's 8-dimension verification + 8 contingency paths (A–H) cover the realistic failure modes upfront. If 3+ contingencies fire, scope review with user before continuing. Probability: medium. Impact: medium.

- **Risk: Auto-seed cost burns starter credit.** Mitigation: U7 cost dry-run estimates worst-case before any real call; U8 pre-flight gate aborts if estimate >60% of remaining credit; dev-mode caps testing volume. Probability: medium without mitigation, low with. Impact: low (resolved by adding payment method).

- **Risk: Edge Function 150s wall on auto-seed run.** Mitigation: sharded `ingest_jobs` chaining gives effectively unbounded total runtime. First-run UX (U11) shows shard progress so user sees real-time status. Probability: medium for the first run. Impact: low (just slower seed; not a failure).

- **Risk: MVP audio player feels too simple to satisfy R17 design-led requirement.** Mitigation: chrome quality (custom scrubber, designed transcript treatment, intentional play-button) carries the design weight; segment-level highlight is functional and not visually sub-par. Defer judgment to real-device verification in U12. If MVP feels insufficient, reopen scope toward word-level RAF + wavesurfer in a follow-up unit. Probability: low. Impact: medium (might trigger an additional unit).

- **Risk: 49ers entity slugs in Particle don't match expectations.** Mitigation: U1 verifies coverage rate; U6 universe config carries `nameFallbacks` for missing slugs; semantic search picks them up. Probability: low–medium. Impact: low.

- **Risk: Cross-runtime drift between Node and Deno pipelines.** Mitigation: same integration test runs against both runtimes before Phase C is declared complete. Co-located duplication is the explicit choice — easier to keep aligned than complex import bridging. Probability: medium. Impact: medium.

- **Risk: RLS smoke tests skipped under time pressure.** Mitigation: execution note in U5 marking them non-skippable; cross-user isolation is the only data-integrity guard before v3. Probability: low (the note + CI failure on missing tests). Impact: critical if missed.

- **Risk: Particle ships a breaking API change mid-build.** Mitigation: U7 contract-test snapshots fail CI on shape drift. Probability: low–medium for a 2026-launched product. Impact: medium (caught before production deploy).

- **Risk: Solo non-technical user hits an unrecoverable migration error.** Mitigation: staging Supabase project + every migration tested in staging before prod; reverse migration in same PR for any structural change. Probability: low with mitigation, medium without. Impact: medium without staging.

- **Risk: Audio URL is short-lived and expires before user plays the clip.** Mitigation: U1 contingency C — re-sign at request time via `/api/clips/[id]/audio`. Probability: depends on Particle's URL model (verified in U1). Impact: low (route handler is small).

---

## Dependencies / Prerequisites

- **Accounts already in place** (per Q5): Vercel Pro, Supabase Pro (account; **two projects to be created in U3**), GitHub `intrater/podium`. Domain `podiumsports.app` registered.
- **Accounts/keys obtained during execution:** Particle API key (U1 / U3), Anthropic API key with billing (U3), `CRON_SECRET` (U3), `SUPABASE_JWT_SECRET` (U3 — used by stub-JWT minting).
- **Particle docs:** must be fetched locally by the user (sandbox can't reach `docs.particle.pro`); U1 reads from `docs/particle/`.
- **External services:** Particle API up; Anthropic API up; Supabase platform up.
- **Local environment:** Node 20+; Deno (for Supabase Edge Function local dev); Supabase CLI for migrations.

---

## Success Metrics

- **End-to-end loop completes:** a real Particle run on a real day surfaces real 49ers cards in the deployed app on `podiumsports.app`.
- **Mobile-first feels right:** opening the app on a phone shows the digest in a way the user finds *intentional, not generic*.
- **MVP audio player works:** tap a card → expand → tap play → audio plays, segment highlights, tap another segment to seek. Works without word-level wow factor.
- **AE3 holds:** "Not relevant" → refresh → card stays gone.
- **Cost stays under $30 for first 30 days of production-equivalent use** (after build/test).
- **Zero cross-user data leakage** in RLS smoke tests.
- **Daily worker runs reliably for 7 consecutive days** without manual intervention.

---

## Operational / Rollout Notes

- **First production run before user-facing launch:** trigger the manual `/api/ingest` route once on the deployed app pointing at prod Supabase to seed. Verify cards appear. Verify cost telemetry registers.
- **Migration testing:** every migration applies to staging FIRST. Verify against the RLS smoke tests on staging. Promote to prod only after staging is green.
- **Daily worker activation:** schedule `pg_cron` only after the first manual seed succeeds on prod. Test the 6am scheduled run manually in dev hours first by setting a one-time pg_cron at 5 minutes from now and confirming it fires.
- **Pre-launch checklist** (created in `docs/solutions/2026-05-09-prelaunch-checklist.md` in U13):
  - Domain DNS verified ✓
  - Vercel env vars set for both Production and Preview ✓
  - Both Supabase projects (staging + prod) have all migrations applied ✓
  - `supabase/seed.sql` (gitignored) generated and applied to prod via `scripts/seed-supabase.ts` ✓
  - Particle payment method on file (or Growth upgrade decision made) ✓
  - First manual ingestion run completed and inspected ✓
  - RLS smoke tests passing in CI ✓
  - Contract-test snapshots captured against real Particle responses ✓
- **Post-launch observability:** `api_calls` + `system_alerts` are the primary observability surfaces; supplement with Supabase's built-in Postgres logs and Vercel's function logs. Sentry-or-similar deferred.

---

## Verification

This plan is ready to execute when:

- The implementer can read U1 and start fetching Particle docs without further direction.
- Each subsequent unit's `**Approach:**` and `**Files:**` are concrete enough that an agent can run `ce-work` against them and produce code without inventing scope.
- The single largest unknown (Particle audio + transcript + coverage) is gated by U1 with explicit fallback paths documented for all 8 verification dimensions.
- The doc-review findings from the prior round (P0 architectural conflict, AE3 hide, missing tables/endpoints, stub-auth bridge, audio URL access, expanded U1 scope, cost dry-run, MVP player decision) are addressed in the plan body.

A future deepening pass (`/ce-plan` re-invocation) can strengthen any unit whose implementation surfaces unexpected complexity.
