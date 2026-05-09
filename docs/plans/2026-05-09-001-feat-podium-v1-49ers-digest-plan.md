---
date: 2026-05-09
status: active
plan-id: 2026-05-09-001
type: feat
title: "Podium v1 — 49ers podcast digest"
origin: docs/brainstorms/podium-v1-requirements.md
---

# feat: Podium v1 — 49ers podcast digest

## Summary

Build v1 of Podium: a mobile-first, design-led web app that delivers a daily morning digest of 49ers-relevant podcast moments to a single user (the builder), powered by the Particle podcast intelligence API for ingestion, Claude Haiku for summarization, and Supabase for storage. Architecture is multi-user / multi-team / multi-sport from day one but ships with stub auth and a single team. Custom audio player with synchronized transcript, team-adaptive theming, and per-segment relevance feedback are first-class.

(see origin: `docs/brainstorms/podium-v1-requirements.md`)

---

## Problem Frame

Sports fans rely on podcasts for analysis of their favorite teams, but volume has outpaced any reasonable listening budget. Two distinct shapes of pain: team-specific shows (e.g. *Niners Nation*) where every episode is relevant but there are too many to listen to in full, and national shows (e.g. *The Mina Kimes Show*) where 90 seconds of 49ers content can be buried in a 90-minute episode with no way to know it's there. Prior attempts to build this stalled on transcription / segmentation infrastructure; Particle's recent API collapses that layer and makes the problem tractable for the first time.

The user is a designer with paid Vercel Pro and Supabase Pro accounts. v1 ships only for them, only for the 49ers; v2 expands the same user to multiple teams; v3 opens to other users. The plan therefore prioritizes architectural decisions that hold across all three versions while shipping the smallest useful surface for v1.

---

## Requirements Traceability

This plan executes the requirements from `docs/brainstorms/podium-v1-requirements.md`. Cross-references use origin R-IDs (R1–R17), F-IDs (F1–F4), AE-IDs (AE1–AE6), and A-IDs (A1–A6).

Q&A clarifications captured during planning, layered on top of the brainstorm:

- **Visual direction (origin Q on R17):** fun + modern + Arc-style expressive motion, dark-first, **team-adaptive theming** (the accent color reflects the user's team). References: Linear, Arc, Spotify, Origin (finance), Sana AI. Anti-pattern: Duolingo-corny.
- **Particle pricing tier:** Starter, ~$0.004/req list price, $10 starter credit, no payment method on file. Plan must be cost-conscious and surface telemetry in-app.
- **Curated podcast list:** 31 unique shows (national + 49ers-specific), see `config/podcasts.ts` in U6.
- **Auth posture:** stub for v1; magic-link auth deferred to v3 (after multi-team v2).
- **Domain:** `podiumsports.app` (user owns).
- **Surface priority:** mobile-first, mobile web (no native app).
- **Brand identity:** no brand work for v1; clean text wordmark in the display face + neutral dark palette + team accent.
- **First-run experience:** auto-seed last 3 days of 49ers content on first login (no primary empty state); manual "Run now" button as a power tool.

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
└──────────────────┘    │  Batch API,         │    │ • feedback   │
                        │  prompt caching)    │    │ • api_calls  │
                        └─────────────────────┘    │ • universes  │
                                                   └──────┬───────┘
                                                          │
                                                          │ RLS-scoped reads
                                                          ▼
                                                ┌──────────────────┐
                                                │ Next.js App      │
                                                │ (Vercel Pro)     │
                                                │                  │
                                                │ • RSC card grid  │
                                                │ • Custom player  │
                                                │   (HTMLAudio +   │
                                                │   wavesurfer +   │
                                                │   RAF transcript)│
                                                │ • Theme tokens   │
                                                │   (team-adaptive)│
                                                └──────────────────┘
                                                          ▲
                                                          │ podiumsports.app
                                                          │ (Vercel-managed)
```

### Data flow (one daily cycle)

1. `pg_cron` at 6am ET fires the `daily-digest` Edge Function.
2. Edge Function reads the **active universe** (`teams.universe_id` for "49ers") = entity slugs (team + roster + coaches) + storyline semantic queries.
3. Issues parallel Particle calls: entity-mention search per entity, semantic search per storyline, episode listing for the curated podcast set since the last successful run.
4. Unions and dedupes results by `episode_id + segment.start`.
5. Fetches per-segment transcripts (only for segments not seen before — Supabase as cache).
6. Summarizes via Claude Haiku 4.5 using the **Message Batches API** (50% off, 24h SLA acceptable for a daily run) with prompt caching on the system + universe context.
7. Persists into `episodes`, `segments`, `cards`, `api_calls` (cost telemetry).
8. User opens app → server component reads today's `cards` joined to `segments` and `episodes` → mobile-first card grid renders with team-adaptive accents → user expands a card, custom audio player loads clip audio + word-level transcript and syncs highlighting via `requestAnimationFrame`.

### Why these choices (over the alternatives I considered)

- **Supabase Edge Function + pg_cron > Vercel Cron.** Vercel Hobby/Pro cron caps at 60s on Hobby and 5min on Pro; the daily ingestion (Particle reads + Claude calls + persistence for 31 podcasts × multiple entities) likely exceeds 5 min during the seed run. Supabase Edge Functions get 150s wall, can chain via Queues, and `pg_cron` schedules with second-level precision (vs Vercel's "anywhere in the hour" jitter).
- **Native HTMLAudioElement + wavesurfer.js + RAF transcript sync > Particle's `<particle-podcast-clip>` embed.** The embed is opaque to design; the design-led requirement (R17) is non-negotiable. Conditional on U1 confirming raw audio URL + word-level timestamp access.
- **Tailwind v4 `@theme inline` + CSS custom property override > tailwind.config.js theme switching.** Tailwind v4's CSS-first config with `@property`-registered animatable color tokens enables transitions between team palettes; v3's JS config does not.
- **Message Batches API > realtime Messages API for summarization.** 50% cost reduction, 24h latency budget is fine for a 6am daily run scheduled the night before, automatic retry handling.
- **`team_id` as text + `user_id uuid not null references auth.users(id)` from day one > `accounts` table.** Brings multi-tenant data shape into v1 without v1 paying complexity tax. Migration to a `teams` FK + `account_members` table for v3 is additive (no policy rewrites). Pattern from Supabase RLS production research.

---

## Output Structure

```
podium/
├── app/                          # Next.js App Router
│   ├── (app)/                    # Authenticated app group (no real auth in v1, structure ready for v3)
│   │   ├── layout.tsx            # Sidebar, header, team-accent theme provider
│   │   ├── page.tsx              # Mobile-first digest grid (RSC)
│   │   └── episodes/[id]/
│   │       └── page.tsx          # Expanded episode card with player
│   ├── api/
│   │   ├── ingest/
│   │   │   └── route.ts          # Manual "Run now" trigger (POST)
│   │   └── feedback/
│   │       └── route.ts          # Per-segment feedback writes
│   ├── layout.tsx                # Root layout, theme tokens, fonts
│   └── globals.css               # @import "tailwindcss"; @theme; @property
├── components/
│   ├── ui/                       # shadcn primitives (card, button, dialog, sheet, slider, sonner, skeleton)
│   ├── digest/
│   │   ├── episode-card.tsx      # Card-per-episode component
│   │   └── segment-list.tsx
│   ├── player/
│   │   ├── audio-player.tsx      # Custom HTMLAudioElement + wavesurfer
│   │   ├── transcript-sync.tsx   # RAF-driven word highlight
│   │   └── scrubber.tsx          # Motion-driven drag scrubber
│   ├── feedback/
│   │   └── feedback-bar.tsx      # Not relevant / Not substantive / Love this
│   └── theme/
│       └── team-theme-provider.tsx
├── lib/
│   ├── particle/
│   │   ├── client.ts             # Particle API wrapper
│   │   ├── types.ts              # Response shape types (filled in after U1)
│   │   └── tracked-call.ts       # Cost telemetry wrapper
│   ├── anthropic/
│   │   ├── client.ts             # Claude SDK + prompt cache config
│   │   └── summarize.ts          # Per-segment summary prompt
│   ├── supabase/
│   │   ├── client.ts             # Browser client (createBrowserClient)
│   │   ├── server.ts             # Server client (createServerClient, per-request)
│   │   └── middleware.ts         # Cookie refresh helper
│   └── universes/
│       └── 49ers.ts              # Universe config: entities + storyline searches
├── config/
│   ├── podcasts.ts               # Curated 31-podcast list with Particle slugs
│   └── teams.ts                  # Team palette definitions (49ers in v1)
├── supabase/
│   ├── migrations/               # SQL migrations (RLS, indexes, triggers, pg_cron)
│   ├── functions/
│   │   └── daily-digest/
│   │       └── index.ts          # Edge Function for the daily worker
│   └── seed.sql                  # Local dev seed
├── docs/
│   ├── brainstorms/              # (existing) requirements doc
│   ├── plans/                    # (existing) this file
│   ├── particle/                 # User-fetched Particle docs (gitignored)
│   └── solutions/                # Future learnings (created in U2)
├── middleware.ts                 # Supabase session refresh
├── next.config.ts
├── package.json
├── tsconfig.json
├── postcss.config.js
├── vercel.json                   # Domain + (optional) cron fallback
├── .env.local.example            # Template for keys
├── .env.local                    # (gitignored) actual keys
├── AGENTS.md                     # Coding-agent guidance for the repo
└── README.md
```

The implementer may adjust the structure if a better layout becomes clear; per-unit `**Files:**` sections are authoritative.

---

## Implementation Units

The plan groups 13 units into four sequential phases. Within a phase, units are dependency-ordered. Phase A must complete before Phase B begins; later phases occasionally have intra-phase parallelism.

**Phase A — Foundation & verification** (U1–U4)
**Phase B — Data layer** (U5–U6)
**Phase C — Ingestion & summarization** (U7–U9)
**Phase D — Design & UI** (U10–U13)

---

### U1. Verify Particle API capabilities

**Goal:** Resolve the single largest unknown blocking the design — whether Particle exposes raw audio URLs and word-level transcript timestamps. The custom audio player (R6) and synchronized transcript (F4) are non-negotiable for the design-led product (R17), and U12 cannot be planned with confidence until this is verified.

**Requirements:** R6, F4, R17 (gating), and the origin `Dependencies / Assumptions` line about Particle audio + transcript exposure.

**Dependencies:** none — this is the very first unit and it is partially a non-coding investigation.

**Files:**
- `docs/particle/` (gitignored — already reserved in `.gitignore`) — local copies of fetched Particle docs
- `docs/solutions/2026-05-09-particle-api-shape.md` — durable learning capturing what the API actually returns (created at end of unit)
- `lib/particle/types.ts` — TypeScript types for response shapes (created here, used in U7)

**Approach:**
1. **From the user's local machine** (since the Claude Code sandbox cannot reach `docs.particle.pro`), fetch the documentation pages listed in the framework-docs research output: `llms.txt`, `api-reference/introduction.md`, search-podcasts-by-content, search-podcast-dialogue-for-entity-mentions, list-entities, list-episodes, get-a-clip, list-clips-for-an-episode, get-clip-transcript, get-word-level-transcript, get-clip-embed.
2. Place all fetched files under `docs/particle/`. The agent picks them up from disk.
3. Generate a Particle API key in the Particle dashboard and place it in `.env.local` as `PARTICLE_API_KEY` (never paste the key in chat). U3 sets up the actual `.env.local` file structure; for this unit the key only needs to exist long enough to test calls.
4. Make ~5 test calls covering: (a) search by content for "49ers", (b) entity-mention search for `brock-purdy` (or whatever Particle slugs them), (c) list-episodes for one curated podcast, (d) get-a-clip for one returned clip, (e) get-word-level-transcript for that clip.
5. Confirm or refute the two critical assumptions: **(A)** clips have a raw audio URL field (likely `audio_url`, `mp3_url`, or `media`); **(B)** word-level transcript returns an array of `{text, start, end, speaker}` records (or equivalent).
6. Capture findings in `docs/solutions/2026-05-09-particle-api-shape.md` including: auth header format, base URL, response schema for the 5 endpoints used, entity slug examples for 49ers / Purdy / Shanahan, pagination shape, date filter format, rate-limit headers if present.
7. Define `lib/particle/types.ts` with TS types reflecting the actual response shapes.

**Patterns to follow:**
- `docs/solutions/` learning doc convention (frontmatter with date + topic + applicability tags, "What we learned / What surprised us / Where this applies" structure).
- Type definitions in `lib/particle/types.ts` should be narrow — only the fields the app actually uses, not the entire Particle response.

**Test scenarios:**
- Test expectation: none — this is a verification + documentation unit, no behavioral change to test.

**Verification:**
- `docs/solutions/2026-05-09-particle-api-shape.md` exists and answers the two critical questions definitively.
- `lib/particle/types.ts` exists with concrete (not `any`) types for clip, segment, entity, episode, transcript-word records.
- If assumption (A) or (B) is refuted, U12's approach (next-paragraph contingencies) is updated before Phase D starts.

**Contingency if Particle does not expose what we need:**
- **No raw audio URL:** fall back to `<particle-podcast-clip>` embed for v1, restyled as much as the embed permits, with a note in the plan to revisit when Particle ships raw URL or when we can negotiate access. The "design-led player" requirement degrades to "stylized embed" but the rest of the app proceeds.
- **No word-level timestamps:** synchronized highlighting downgrades to segment-level highlighting (the segment being played is highlighted; individual words are not). Click-to-seek still works at segment granularity.

---

### U2. Initialize Next.js project with TypeScript, Tailwind v4, shadcn/ui, Motion

**Goal:** Stand up the empty-but-runnable Next.js app with the full design-system stack installed. Greenfield scaffolding.

**Requirements:** Foundational — supports R4–R6, R17.

**Dependencies:** U1 (so types reflect real Particle shapes; non-strict — U1 can run in parallel with this if needed).

**Files:**
- `package.json` (created)
- `tsconfig.json` (created)
- `next.config.ts` (created)
- `postcss.config.js` (created)
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (created — placeholder content)
- `components.json` (shadcn config, created by `shadcn init`)
- `components/ui/*` (button, card, dialog, dropdown-menu, sheet, slider, sonner, skeleton — created by `shadcn add`)
- `AGENTS.md` (created — coding-agent guidance for this repo: stack, conventions, file paths, do/don't list)

**Approach:**
1. Run `npx create-next-app@latest .` (in the existing `/home/user/podium/` directory). Flags: `--typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm`.
   - Note the framework-docs finding: `create-next-app --tailwind` still scaffolds **Tailwind v3 by default** as of May 2026. Immediately after init, run `npx @tailwindcss/upgrade` (or manually upgrade if cleaner on a greenfield project) to land on v4.
2. Replace the v3 setup with v4: `@import "tailwindcss";` in `app/globals.css`, remove `tailwind.config.js`, install `@tailwindcss/postcss`, add `@theme` block (full theme tokens land in U10).
3. Initialize shadcn/ui: `npx shadcn@latest init`. Choose dark-first defaults; let shadcn use our `@theme` tokens.
4. Install components: `npx shadcn@latest add button card dialog dropdown-menu sheet slider sonner skeleton`.
5. Install Motion: `npm i motion` (note: package is `motion`, import is `motion/react`).
6. Install fonts via `next/font`: Geist Sans (UI), Geist Mono (code/data), and one display face TBD in U10. For now, set up Geist Sans + Mono.
7. Author `AGENTS.md` capturing: project description, stack versions, file conventions (App Router groups, `components/ui` for shadcn, `lib/` for non-React modules, `app/api/` for route handlers, kebab-case file names), do-list (test client/server boundaries, run lint before commits, never commit `.env.local`), don't-list (no Tailwind v3 patterns, no `framer-motion` import, no Particle embed unless U1 forces fallback).
8. Smoke test: `npm run dev` boots; root page renders "Podium" wordmark.

**Patterns to follow:**
- Next.js 16 App Router conventions (server components by default; `"use client"` only when needed for interactivity, motion, or browser APIs).
- shadcn/ui's "copy, don't depend" philosophy — components live in `components/ui/` as source we own.

**Test scenarios:**
- Test expectation: none — pure scaffolding, no behavioral surface yet. Verification is "the app builds and serves a placeholder page."

**Verification:**
- `npm run dev` succeeds; visiting `localhost:3000` shows a styled "Podium" wordmark on a dark background.
- `npm run build` succeeds with zero errors.
- `tsc --noEmit` passes.
- `AGENTS.md` exists at repo root and codifies stack/conventions.

---

### U3. Set up environment, secrets, and Supabase project

**Goal:** Establish the secret-management pattern (`.env.local` + Vercel env vars) and create the actual Supabase project that will host the database. This is the unit a designer-without-backend-experience needs the most hand-holding for, so the implementer should produce step-by-step setup instructions during execution.

**Requirements:** Foundational — supports R7, R13–R15.

**Dependencies:** U2.

**Files:**
- `.env.local.example` (created — template with all variable names, blank values, comments explaining each)
- `.env.local` (created — actual values, gitignored)
- `lib/env.ts` (created — typed access to env vars with runtime validation via `zod`)
- `docs/solutions/2026-05-09-env-and-secrets-setup.md` (durable learning capturing the click-by-click setup walkthrough so future-you doesn't re-Google it)

**Approach:**
1. **Supabase project creation walkthrough** (in the learning doc):
   - Sign in at supabase.com → New project → name `podium-prod` → choose closest region to user → save the database password to a password manager.
   - Capture project URL and anon key from `Settings → API`. These go in env vars below.
   - Capture service role key (treat as ultra-sensitive — never to client; only to Edge Function and server route handlers).
2. **Anthropic API key**: console.anthropic.com → create a new API key for Podium. Add billing if not already on file.
3. **Particle API key**: already obtained in U1 if not before. Confirm it's stored.
4. Write `.env.local.example` listing every variable name with comments:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `PARTICLE_API_KEY`
   - `CRON_SECRET` (random; for the manual-trigger route handler)
   - `PODIUM_USER_ID` (the single hardcoded user UUID for v1 stub-auth mode)
5. Populate `.env.local` with real values.
6. Write `lib/env.ts` using `zod` to validate at module load — fails loud at boot if a required var is missing.
7. **Vercel environment variables:** in Vercel project settings, add the same variables for Production and Preview environments. Service role key and other secrets stay out of `NEXT_PUBLIC_*` namespace.

**Patterns to follow:**
- `zod`-validated env access pattern from t3-stack-style apps.
- One source of truth for env names — `.env.local.example` and `lib/env.ts` always match.

**Test scenarios:**
- Test expectation: none for behavioral correctness (configuration unit). However:
- **Smoke check (manual, documented in learning doc):** boot dev server with one env var deliberately removed → app fails fast at module load with a clear `zod` error pointing to the missing variable. Confirms the validator works.

**Verification:**
- `.env.local` contains real values for all required variables.
- `.env.local.example` exists and is committed.
- Booting the dev server reads env vars without warnings or runtime errors.
- The learning doc captures the exact click-paths in Supabase, Anthropic, Particle, and Vercel dashboards for re-creating the setup later.

---

### U4. Connect podiumsports.app to Vercel

**Goal:** Production domain wired up so deploys are reachable at the real URL from day one.

**Requirements:** R17 (production polish), supports the entire deployment story.

**Dependencies:** U2 (Vercel project must exist) and U3 (env vars in place).

**Files:**
- `vercel.json` (created — schema link, `cleanUrls: true`, headers if needed)
- `docs/solutions/2026-05-09-domain-setup.md` (durable learning for the click-by-click DNS + SSL flow)

**Approach:**
1. In the Vercel dashboard for the Podium project, add `podiumsports.app` and `www.podiumsports.app` as production domains.
2. Vercel surfaces required DNS records (A + CNAME, or a single `ALIAS`/`ANAME` depending on registrar). Add them at the registrar where `podiumsports.app` is registered.
3. Wait for DNS propagation; Vercel auto-provisions Let's Encrypt SSL.
4. Verify HTTPS works on both apex and www.
5. Capture the click-paths in the learning doc — registrars vary, the exact process is worth recording once.

**Patterns to follow:**
- `.app` TLD is HSTS-preloaded by browsers; HTTPS is automatic and required (already aligned with our intent).

**Test scenarios:**
- Test expectation: none — DNS configuration. Verification is "the domain serves the app over HTTPS."

**Verification:**
- `https://podiumsports.app` and `https://www.podiumsports.app` both serve the placeholder app from U2 (or whatever's deployed).
- HTTP redirects to HTTPS automatically.
- Vercel deployment dashboard shows the domain as `Valid Configuration`.

---

### U5. Supabase schema + RLS policies (multi-tenant from day one)

**Goal:** Persistent data model that supports v1 (single user, single team, no auth) and extends without rewrite to v2 (multi-team for one user) and v3 (multi-user). RLS policies are written once and continue to work across all three.

**Requirements:** R1, R5, R8, R9, R13, R14, R15.

**Dependencies:** U3.

**Files:**
- `supabase/migrations/0001_init_schema.sql` (created)
- `supabase/migrations/0002_rls_policies.sql` (created)
- `supabase/migrations/0003_indexes.sql` (created)
- `supabase/migrations/0004_pgcron_setup.sql` (created — schedules referenced in U8)
- `lib/supabase/client.ts` (created — `createBrowserClient`)
- `lib/supabase/server.ts` (created — `createServerClient`, per-request)
- `middleware.ts` (created — cookie refresh helper)
- `__tests__/lib/supabase/server.test.ts` (created — RLS smoke tests)

**Approach:**
1. Schema (per the best-practices research's multi-tenant pattern):
   - `auth.users` already exists in Supabase. v1 has exactly one row (the stub user); insert it via seed.sql.
   - `teams (id text primary key, sport text not null, slug text not null, name text not null, palette jsonb not null, universe_id uuid not null)` — `id` as text (e.g. `"49ers"`) for v1 readability; FK migration optional in v3.
   - `universes (id uuid primary key, team_id text references teams(id), entities jsonb not null, storylines jsonb not null, updated_at timestamptz default now())`.
   - `podcasts (id uuid primary key, particle_slug text unique not null, name text not null, kind text check (kind in ('team-specific','national')))`.
   - `episodes (id uuid primary key, podcast_id uuid references podcasts(id), particle_episode_id text unique not null, title text not null, published_at timestamptz, audio_url text, raw_payload jsonb)`.
   - `segments (id uuid primary key, episode_id uuid references episodes(id), particle_segment_id text unique, start_seconds int, end_seconds int, speaker text, raw_transcript jsonb, summary text, pull_quotes text[], bullets text[], engagement_score numeric, surfacing_entities text[])`.
   - `cards (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, team_id text not null references teams(id), episode_id uuid not null references episodes(id), surfaced_at timestamptz default now(), total_relevant_seconds int, hidden boolean default false)` — `user_id` and `team_id` here so the same episode produces different cards for different users (v3-friendly).
   - `feedback (id uuid primary key, user_id uuid not null references auth.users(id), card_id uuid references cards(id), segment_id uuid references segments(id), surfacing_entity text, verdict text check (verdict in ('not_relevant','not_substantive','love')), created_at timestamptz default now())`.
   - `api_calls (id uuid primary key, ts timestamptz default now(), provider text not null, endpoint text, model text, input_tokens int, output_tokens int, cost_usd numeric(10,6) not null, request_id text, metadata jsonb)` — cost telemetry; intentionally global, no user_id (it's infra-level).
2. RLS policies on every domain table touched by user data:
   - Pattern: `for all using (user_id = auth.uid()) with check (user_id = auth.uid())` on `cards` and `feedback`. Always include WITH CHECK.
   - `episodes`, `segments`, `podcasts`, `teams`, `universes` are read-by-all-authenticated, write-by-service-role-only (the daily worker writes; the user reads).
   - `api_calls` is read-by-all-authenticated, write-by-service-role-only.
3. Indexes on every `(user_id, ...)` lookup path; RLS without an index is a sequential scan.
4. `lib/supabase/client.ts` and `lib/supabase/server.ts` per the `@supabase/ssr` pattern (research findings). `createServerClient` instantiates **inside** the request handler — never at module scope.
5. `middleware.ts` refreshes the session cookie on every request. In v1 stub-auth, this is a no-op pass-through; v3 picks up the session-refresh behavior automatically.
6. RLS smoke test: write a test that attempts cross-user reads/writes with a non-owner JWT and asserts they fail. Even in v1 with one user this proves the policies are wired correctly.

**Patterns to follow:**
- Supabase `@supabase/ssr` server-client-per-request pattern (research finding).
- Multi-tenant RLS pattern with `user_id` column + composite indexes (best-practices research).
- Migration files numbered + named so order is unambiguous.

**Test scenarios:**
- **Happy path:** seed one user, one team (`"49ers"`), one universe; insert one card for that user; query as that user via `createServerClient` — card returns.
- **RLS enforcement (security-critical):** create a second mock user, attempt to read card belonging to user A as user B — query returns zero rows. Repeat for `feedback`. **Covers AE3** (the per-user filter promise).
- **WITH CHECK enforcement:** as user A, attempt to insert a feedback row with `user_id = userB.id` — insert fails with RLS policy violation. (This catches the policy mistake of omitting WITH CHECK.)
- **Index presence (sanity):** query plan on `select * from cards where user_id = $1 and surfaced_at > now() - interval '1 day'` shows index scan, not seq scan, on a populated table.

**Verification:**
- All four migration files apply cleanly via `supabase db push` (or equivalent).
- Smoke tests pass.
- The single seeded `auth.users` row exists with the UUID stored in `PODIUM_USER_ID`.

---

### U6. Niners universe config

**Goal:** Encode the "what counts as 49ers content" definition (R3) as data the daily worker can read at runtime, plus the curated 31-podcast list (R2) as Particle slugs.

**Requirements:** R2, R3, R16 (sport disambiguation surface).

**Dependencies:** U1 (real Particle entity slugs from real responses), U5 (the `universes` and `podcasts` tables exist).

**Files:**
- `config/podcasts.ts` (created — curated list with name + Particle slug + kind)
- `config/teams.ts` (created — `49ers` palette, sport, slug, universe reference)
- `lib/universes/49ers.ts` (created — entities + storylines as TS, written into the `universes` table at boot or by migration)
- `supabase/seed.sql` (created — populates `teams`, `podcasts`, `universes`, single `auth.users` row)

**Approach:**
1. **`config/podcasts.ts`:** an array of `{ name: string, particleSlug: string, kind: 'team-specific' | 'national' }`. 31 entries from the user's curated list. Particle slug for each is resolved during U1's verification work (or marked `null` if not in Particle's catalog — those still get caught by the entity-mention search, just not the curated-podcast filter).
2. **`config/teams.ts`:** v1 ships with one team — `{ id: '49ers', sport: 'nfl', slug: 'sf-49ers', name: 'San Francisco 49ers', palette: { accent: 'oklch(0.55 0.21 25)', accentFg: 'oklch(0.85 0.17 85)', /* ... */ }, universeId: '<uuid>' }`. Palette uses OKLCH per the best-practices research so contrast can be mathematically verified.
3. **`lib/universes/49ers.ts`:** the 49ers universe object — `{ teamId: '49ers', entities: [...particleEntitySlugs], storylines: [...semanticQueries] }`. Entities = team slug + active roster (~53 players, drafted from a public source like Pro Football Reference and trimmed to active starters + key reserves) + coaching staff (Shanahan, Lynch, Bosa-style coordinators). Storylines = 4–6 phrasings: "49ers cap space and contracts", "49ers draft strategy", "NFC West race", "49ers injuries", "49ers playoff outlook", "49ers offensive scheme."
4. **Seed migration / seed.sql:** populates `teams`, `podcasts`, `universes` from the TS configs. Pattern: a small Node script reads the TS configs, generates the seed SQL or applies via the Supabase admin client.
5. **Sport disambiguation note (R16):** for v1, single team = single sport = no ambiguity. The architecture is in place (universes carry sport context); ambiguity logic surfaces in v2 when multiple teams are added. Documented as a deferred-to-v2 note in `lib/universes/README.md`.

**Patterns to follow:**
- Config-as-code (TypeScript) with seed scripts that hydrate the DB. Easy to review, easy to diff, easy to extend.

**Test scenarios:**
- **Happy path:** seeded `universes` table contains the `49ers` row with the expected entity slug count and storyline count. Query confirms shape.
- **Schema validity:** `entities` is an array of strings; `storylines` is an array of strings; `palette` parses as a valid CSS color in each field.

**Verification:**
- After seeding, `select count(*) from podcasts where kind = 'team-specific'` ≥ 8 and `kind = 'national'` ≥ 20.
- The 49ers universe has at least 30 entities and 4–6 storylines.
- A unit test renders the 49ers `palette.accent` color and confirms it parses.

---

### U7. Particle API client + cost telemetry

**Goal:** A single typed client wrapping every Particle endpoint we use, with every call recorded in the `api_calls` table for cost telemetry. No raw fetches anywhere else in the codebase.

**Requirements:** R2, R3, R6 (clip data shape), R8 (date filtering), supports cost-conscious operation per the Particle pricing reality.

**Dependencies:** U1 (types), U5 (`api_calls` table).

**Files:**
- `lib/particle/client.ts` (created)
- `lib/particle/tracked-call.ts` (created — the wrapper)
- `lib/particle/types.ts` (created in U1, refined here)
- `__tests__/lib/particle/client.test.ts` (created)

**Approach:**
1. `trackedCall(provider, endpoint, fn)` helper: takes the underlying fetch promise, awaits it, computes cost using a hardcoded price table (one entry per endpoint at Starter list prices), inserts a row into `api_calls`, returns the response.
2. `lib/particle/client.ts` exports typed methods: `searchByContent`, `searchEntityMentions`, `listEntities`, `listEpisodes`, `getClip`, `getClipTranscript`, `getWordLevelTranscript`, `listClipsForEpisode`. Each wraps the underlying fetch in `trackedCall`. All return strict types from `lib/particle/types.ts`.
3. Standard auth header (likely `Authorization: Bearer ${PARTICLE_API_KEY}` per industry norm — confirmed in U1).
4. Rate-limit handling: read `X-RateLimit-Remaining` (if Particle exposes it; confirmed in U1) and back off if low. On 429, exponential backoff with jitter, max 3 retries.
5. Error handling: distinguish between transient (network, 5xx, 429) vs terminal (401, 403, malformed payload). Transient retried; terminal surfaced.

**Patterns to follow:**
- Trackable-call wrapper pattern from best-practices research.
- Error categorization per fetch best practices — never silently swallow.

**Test scenarios:**
- **Happy path:** mocked `searchEntityMentions` for `brock-purdy` returns 3 results; assert response is parsed into typed shape; assert one row written to `api_calls` with correct `endpoint`, non-zero `cost_usd`.
- **Cost telemetry edge case:** 0-result response still writes a row to `api_calls` (the call still costs money even with no hits).
- **Retry on 429:** mock 429 → 429 → 200 sequence; assert client retries twice with backoff and ultimately returns the 200 response. Assert `api_calls` rows for all three attempts (each cost-bearing).
- **Terminal error:** mock 401; assert client throws a typed `ParticleAuthError`; assert no retry; assert one `api_calls` row with `cost_usd = 0` (failed auth shouldn't bill, but we log the attempt for observability).
- **Type narrowing:** call `getWordLevelTranscript` on a mocked response missing the `words` field; assert client raises a typed schema error rather than returning malformed data.

**Verification:**
- Unit tests pass.
- A live integration test (gated behind a flag, run manually): one real call to Particle hits the dashboard's request counter and writes a real row to local Supabase.

---

### U8. Daily ingestion worker (Supabase Edge Function + pg_cron) and manual trigger

**Goal:** The worker that runs at 6am ET, queries Particle, dedupes, summarizes, and persists cards. Plus a manual `/api/ingest` route handler for the "Run now" button (Q8) and dev-mode runs.

**Requirements:** R1, R2, R3, R7, R8, F2, the Q8 first-run experience.

**Dependencies:** U6, U7, U9 (summarization).

**Files:**
- `supabase/functions/daily-digest/index.ts` (created — Deno Edge Function)
- `supabase/functions/daily-digest/deno.json` (created)
- `supabase/migrations/0004_pgcron_setup.sql` (refined — schedules the Edge Function)
- `app/api/ingest/route.ts` (created — manual trigger, POST, validates `CRON_SECRET`)
- `lib/ingest/pipeline.ts` (created — orchestrates: query → dedupe → summarize → persist; shared between Edge Function and route handler)
- `lib/ingest/dev-mode.ts` (created — gates the worker to a small podcast subset when `INGEST_DEV_MODE` is true)
- `__tests__/lib/ingest/pipeline.test.ts` (created)

**Approach:**
1. **Edge Function (`supabase/functions/daily-digest/index.ts`):** Deno runtime. Reads the active universe (`teams.universe_id` for `49ers` in v1), invokes `lib/ingest/pipeline.ts` (shared module), persists the results.
   - Note: Edge Functions run Deno, route handlers run Node. `lib/ingest/pipeline.ts` must be runtime-agnostic — uses `fetch`, `crypto.randomUUID`, no Node-specific APIs. The Anthropic SDK and Supabase SDK both have Deno-compatible builds.
2. **Pipeline (`lib/ingest/pipeline.ts`):** the core logic, takes a `{ universe, sinceTimestamp, podcastSlugs?, devMode? }` and returns a structured summary of what was inserted:
   - For each entity in `universe.entities`: parallel calls to `searchEntityMentions(entity, since=sinceTimestamp)`.
   - For each storyline in `universe.storylines`: parallel calls to `searchByContent(storyline, since=sinceTimestamp)`.
   - For each curated podcast: parallel calls to `listEpisodes(podcastSlug, since=sinceTimestamp)`.
   - Union all returned segments; dedupe on `(episode_id, segment.start)`; **skip any segment already present in our `segments` table** (Supabase as cache — never re-fetch).
   - For each new segment: `getWordLevelTranscript(segmentId)`, then summarize via `lib/anthropic/summarize.ts` (U9).
   - Group segments by `episode_id`; create one `cards` row per (user, team, episode) with the union of segments.
   - Insert into `episodes`, `segments`, `cards` in a single transaction.
3. **`pg_cron` schedule:** SQL in `0004_pgcron_setup.sql` schedules `daily-digest` at `0 11 * * *` UTC (= 6am ET in summer, 7am in winter — design choice: pick one TZ behavior, document in the learning doc). The `pg_net` extension makes the HTTP call to the Edge Function.
4. **Auto-seed on first run (Q8):** on first invocation (no prior `cards` rows for the user), `sinceTimestamp = now() - interval '3 days'`. Otherwise `sinceTimestamp = max(cards.surfaced_at) - safety_margin`.
5. **Dev mode (Q2 cost-consciousness):** when `INGEST_DEV_MODE=true`, the pipeline runs against only the first 2 podcasts in `config/podcasts.ts` and uses a 1-day window. Saves $5+ of starter credit during build/test.
6. **Manual trigger (`app/api/ingest/route.ts`):** POST endpoint; validates `Authorization: Bearer $CRON_SECRET`; forwards the request to the Edge Function; returns a structured response (counts of new episodes, segments, cards, plus total cost in USD). Also catches and surfaces errors.
7. **Idempotency (R8):** segment writes use `on conflict (particle_segment_id) do nothing`; `cards` writes use `on conflict (user_id, team_id, episode_id) do update set total_relevant_seconds = excluded.total_relevant_seconds`. Re-running over the same window produces no duplicates.
8. **Observability:** every run inserts a row into `system_alerts` (a small table created here) on completion — `started_at`, `finished_at`, `episodes_count`, `segments_count`, `cost_usd`. Visible in the cost telemetry UI surface (U13).

**Execution note:** Start with a failing integration test that exercises the manual `/api/ingest` route with a small mock universe and asserts the full pipeline produces expected `cards`. Build the pipeline to make that test pass. This guards against the Edge-Function ↔ Node parity drift.

**Patterns to follow:**
- Cron pattern from research: `pg_cron` + `pg_net` to call the Edge Function.
- Idempotent upsert with `on conflict`.
- Dev-mode flag pattern from t3-stack-style apps.

**Test scenarios:**
- **Happy path (auto-seed):** mock universe, mock Particle responses for 3 episodes across 2 podcasts, mock summarization. Run pipeline against a fresh DB. Assert: 3 `episodes` rows, ≥3 `segments` rows, 3 `cards` rows for the seeded user, all `surfacing_entities` populated.
- **Idempotency:** run the same pipeline twice on the same window. Second run produces 0 new rows. **Covers AE5** (missed-day catch-up with no duplicates).
- **Empty result:** mock universe, mock Particle responses with zero hits. Pipeline completes without error, no rows written, one `system_alerts` row showing `episodes_count: 0, cost_usd: ~$0.00`.
- **Particle failure mid-run:** mock Particle 500 on 3rd call after 2 successes. Pipeline persists what completed (2 episodes), surfaces error in `system_alerts`, does not corrupt DB.
- **Dev mode:** with `INGEST_DEV_MODE=true`, pipeline only queries the first 2 podcasts and 1-day window — assert call count to Particle is bounded.
- **Cross-run dedupe:** seed `segments` with one record, run pipeline against a Particle response that includes that segment — assert it's skipped (no re-fetch of transcript, no re-summarization).
- **Manual trigger auth:** POST to `/api/ingest` without `CRON_SECRET` → 401. With wrong secret → 401. With correct secret → 200 + run results.

**Verification:**
- Tests pass.
- A real (non-dev-mode) run against staging Supabase + real Particle (small entity set, narrow date window) successfully creates real cards for a known recent date with a known 49ers podcast.
- `pg_cron` schedule visible in `select * from cron.job`.

---

### U9. Claude Haiku summarization layer

**Goal:** Convert a Particle segment + word-level transcript into the unified output format (R4): summary + pull quotes + bullets, scoped strictly to 49ers content.

**Requirements:** R4, R5 (drives card-level summary too), supports F2.

**Dependencies:** U7 (segment shape from Particle types), U5 (writes back to `segments`).

**Files:**
- `lib/anthropic/client.ts` (created)
- `lib/anthropic/summarize.ts` (created — segment-level summarization)
- `lib/anthropic/summarize-episode.ts` (created — episode-level summary across segments)
- `lib/anthropic/prompts/segment-summary.ts` (created — system prompt + user template)
- `__tests__/lib/anthropic/summarize.test.ts` (created)

**Approach:**
1. **Client:** `@anthropic-ai/sdk` v0.30+; `import Anthropic from "@anthropic-ai/sdk"; const client = new Anthropic();` reads `ANTHROPIC_API_KEY`.
2. **Prompt structure** for segment summary:
   - **System prompt** (cacheable, ≥4096 tokens — Haiku's minimum cache prefix): defines Podium's voice, how summaries should read, what counts as "49ers content" (the universe context pasted in here as a few-shot reference), formatting rules ("Return JSON with `summary` (≤2 sentences), `pull_quotes` (≤3 verbatim quotes), `bullets` (3–5 short observations)"), explicit anti-instructions ("Do not invent facts not present in the transcript", "Do not include content unrelated to the 49ers").
   - **User message:** the segment transcript with speaker labels + segment metadata (episode title, podcast name, timestamp).
   - `cache_control: { type: "ephemeral" }` on the system block.
3. **Batches API**: when called from the daily Edge Function (batch context), use `client.messages.batches.create()` with all segments in one batch. 50% cost discount, 24h SLA. The Edge Function polls `batches.retrieve()` for completion (or waits on a webhook if Anthropic exposes one).
4. **Realtime API**: when called from the manual "Run now" trigger, use `client.messages.create()` directly so the UI gets results within the request lifetime. Cost is 2× but acceptable for occasional manual runs.
5. **Output validation:** parse the response JSON; validate via `zod` against the expected shape; on parse failure, retry once with a "your prior response wasn't valid JSON, please conform to the schema" follow-up. After two failures, mark the segment with `summary = null` and surface as a degraded-result card.
6. **Episode-level summary**: similar pattern, takes the constituent segment summaries as input, produces an episode-level "what got said about the 49ers in this episode" 2–3 sentence summary that drives the card surface text (R5).

**Patterns to follow:**
- Anthropic prompt-caching pattern (research finding: 4096 token min for Haiku, 90% input cost reduction on cache hits).
- Message Batches pattern for bulk async work.
- `zod` schema validation for LLM-output safety.

**Test scenarios:**
- **Happy path:** mock segment transcript "Brock Purdy threw three TDs against the Seahawks…"; mock Anthropic response with valid JSON; assert parsed `{ summary, pull_quotes, bullets }` shape.
- **Quote fidelity (correctness):** assert each `pull_quote` is a substring of the transcript text. Catches hallucinated quotes.
- **Off-topic exclusion:** mock transcript that mentions Tom Brady (not 49ers); assert Anthropic response is empty/null and segment is marked as non-49ers content (skipped from cards).
- **JSON parse failure recovery:** mock Anthropic returning prose-not-JSON on first call, valid JSON on retry; assert client retries once and ultimately succeeds.
- **Hard failure:** mock both attempts returning malformed JSON; assert segment is persisted with `summary = null`, doesn't crash pipeline.
- **Token cost telemetry:** mock response with `usage.input_tokens = 5000, output_tokens = 200`; assert one row in `api_calls` with `model = 'claude-haiku-4-5'`, correct token counts, cost computed from price table.
- **Cache hit cost:** mock response with `usage.cache_read_input_tokens = 4500, input_tokens = 500, output_tokens = 200`; assert cost is computed at 10% rate for cache-read tokens (research finding).
- **Batches happy path:** mock batches.create with 5 segments; mock retrieve returning all 5 completions; assert all 5 summaries are persisted; assert single batches API row in `api_calls` with summed token counts.

**Verification:**
- Tests pass including the cache-cost-math test (catches a wrong price-table entry).
- A live integration test (gated): real call to Anthropic with a real transcript; verify quote-fidelity on real output.

---

### U10. Design system foundation (theme tokens, team-adaptive theming, motion patterns)

**Goal:** The visual scaffolding everything else renders inside. Establishes the Tailwind v4 `@theme`, the OKLCH-based team palettes, the dark-first surface tokens, the type pairing, the motion patterns, and the team-theme provider that swaps accent tokens at runtime. This is where R17 (design-led) becomes concrete.

**Requirements:** R17, R5 (card aesthetic), R6 (player aesthetic).

**Dependencies:** U2 (Tailwind/Motion installed), U6 (team palette config exists).

**Files:**
- `app/globals.css` (modified — full `@theme inline` block, `@property` registrations for animatable color tokens, dark-first defaults, prefers-reduced-motion fallback)
- `components/theme/team-theme-provider.tsx` (created — sets `data-team` on `<html>`, persisted to cookie for SSR no-flash)
- `lib/motion/presets.ts` (created — shared spring + easing presets used across components)
- `app/layout.tsx` (modified — wires the team-theme provider, fonts, `data-theme="dark"` default)
- `__tests__/components/theme/team-theme.test.tsx` (created)
- `__tests__/lib/palette/contrast.test.ts` (created — WCAG contrast verification for every team palette)

**Approach:**
1. **`@theme` tokens:** dark-first surface colors (3 tones: `--bg`, `--surface`, `--surface-raised` in OKLCH around L=0.14/0.18/0.22), text colors (high/medium/low emphasis), the team-adaptive accent tokens (`--accent`, `--accent-fg`) that get overridden by `data-team` selectors, ring tokens, the timing function tokens for motion.
2. **`@property` registration** for `--accent` and `--accent-fg`: `@property --accent { syntax: '<color>'; inherits: true; initial-value: oklch(0.6 0 0); }`. Without this, CSS transitions on custom properties don't work — the accent swap on team change won't animate smoothly.
3. **Per-team data-attribute overrides:** `:root[data-team="49ers"] { --accent: oklch(0.55 0.21 25); --accent-fg: oklch(0.85 0.17 85); }`. v1 ships only 49ers; v2 adds Sharks, Warriors, Giants.
4. **`team-theme-provider`** reads the user's team from a server-side cookie (in v1: hardcoded "49ers"; in v3: from user preferences) and writes `data-team` on `<html>` server-side to avoid FOUC. Client-side accent swap is a single attribute change; CSS transitions handle the rest.
5. **Type pairing:** Geist Sans for UI body; one display face for headlines/episode titles. v1 ships with **Geist Sans + Geist Mono** only — display face deferred since the user picked C on Q7 (no brand work). The display-face slot exists as a CSS variable so it can be swapped in v2 without component changes.
6. **Motion presets:** `springs.gentle = { type: 'spring', stiffness: 120, damping: 14 }` (the Arc-feel reference); `springs.snappy = { stiffness: 220, damping: 22 }`; `easings.out = [0.32, 0.72, 0, 1]`. Imported across components rather than re-derived.
7. **Reduced-motion fallback:** `useReducedMotion()` from `motion/react` short-circuits expressive animations to fades.
8. **Contrast verification:** unit test using the `culori` library — for every team palette, assert WCAG AA contrast (≥ 4.5:1) between accent and the dark background tokens. Fails the test (and CI) if a future team palette doesn't meet contrast.

**Patterns to follow:**
- Tailwind v4 `@theme inline` + `@property` registration (research finding).
- Multi-theme via data attribute, not class swap (more SSR-friendly).
- Anti-AI-slop principles from research: surface hierarchy via tone (not borders), one accent used sparingly, deliberate left-alignment, no center-everything.

**Test scenarios:**
- **Theme provider sets `data-team`:** render the layout with cookie `team=49ers`; assert `<html data-team="49ers">` is present in SSR output.
- **Theme switch animates:** render with team A, switch to team B; assert `--accent` value transitions over ~240ms. (Visual; tested via JS query of `getComputedStyle` over time.)
- **Reduced-motion:** mock `prefers-reduced-motion: reduce`; assert motion components render without `transition` props (or with `duration: 0`).
- **Contrast (WCAG):** for each team palette, contrast(accent, surface) >= 4.5:1. **This test should fail CI if any team palette violates contrast.**
- **Default dark:** with no team cookie, root has `data-team="default"` (or no attr) and renders with the neutral accent.

**Verification:**
- A render of `app/page.tsx` (still placeholder content) shows the dark surface, the team-accent on a sample button or chip, and the text in Geist Sans. Looks intentional, not generic.
- Storybook-style test pages (one per surface tone) render to confirm the palette feels right.

---

### U11. Card-per-episode digest view (mobile-first, server components)

**Goal:** The home screen of v1 — a vertical scroll of cards on mobile, one per episode that contained 49ers content in the digest window. Server-rendered for performance.

**Requirements:** R4, R5, F1, **mobile-first per Q6**.

**Dependencies:** U10, U5 (data layer), U6 (universe).

**Files:**
- `app/(app)/layout.tsx` (created or modified — top app bar, team chip, settings link)
- `app/(app)/page.tsx` (created — RSC fetches today's `cards`, renders the grid)
- `components/digest/episode-card.tsx` (created — the card surface)
- `components/digest/segment-list.tsx` (created — segment summaries inside the expanded card)
- `components/digest/total-time-pill.tsx` (created — "8 minutes across 3 segments")
- `components/digest/loading-skeleton.tsx` (created — for first-run auto-seed loading state)
- `components/digest/empty-fallback.tsx` (created — defensive fallback for the rare zero-content case)
- `__tests__/components/digest/episode-card.test.tsx` (created)
- `__tests__/app/(app)/page.test.tsx` (created)

**Approach:**
1. **`app/(app)/page.tsx` as RSC:** uses `createServerClient` to fetch `cards` joined to `episodes` and a small projection of `segments` (id, summary, length) for the user's current team, ordered by `surfaced_at desc`, limited to last 24h initially with "Load earlier" pagination. RLS filters automatically.
2. **`episode-card.tsx`:** mobile-first layout — full-width card; podcast artwork (large, ~120×120 on mobile); episode title (display face slot, large); podcast name + date (low emphasis); total relevant time pill (`8 min across 3 segments`); episode-level summary (2–3 sentences); expand button.
3. **Expanded state:** opens a sheet (mobile) or inline expansion (desktop) showing each segment with its summary, pull quotes, bullets, and the audio player (U12) inline.
4. **Layout animation:** Motion `layout` on the cards provides smooth re-layout when segments are filtered out by feedback or team-switch in v2.
5. **First-run loading state:** when the user has zero cards, the page shows the skeleton list + "Preparing your first digest…" message, polls `/api/ingest/status` every 2s, transitions to the populated grid when done.
6. **Mobile-first specifics:** thumb-reach target sizes (44pt min); the expand affordance is full-width-tappable, not a tiny chevron; horizontal scroll deliberately avoided; sticky team chip header so context is always visible.
7. **Density (anti-AI-slop):** show 5–8 cards visible above the fold, not 2 — designers reward power-users with information.

**Patterns to follow:**
- RSC for data fetching, "use client" only for the expansion/feedback affordances.
- shadcn Sheet primitive for the mobile expand surface.
- Motion `layout` + `AnimatePresence` for re-layout (research finding).
- Anti-slop: deliberate left-alignment, surface hierarchy via tone, one accent (used on play button + active segment marker), no center-everything.

**Test scenarios:**
- **Happy path:** seed 3 cards, render `app/(app)/page.tsx`; assert all 3 episode-card components render with correct titles, summary, total time. **Covers AE1, AE2.**
- **Empty seed (defensive fallback):** seed 0 cards, render; assert empty fallback component renders (not a broken layout).
- **First-run loading state:** seed 0 cards but with a pending-ingest record; assert skeleton + "Preparing…" copy renders.
- **Date sort:** seed 3 cards with different `surfaced_at`; assert order in render matches descending `surfaced_at`.
- **Hidden cards excluded:** seed 3 cards, mark one `hidden=true` (came from feedback); assert it's not rendered.
- **Mobile breakpoint:** render at 375px width; assert single-column layout, full-width cards.
- **Tablet/desktop breakpoint:** render at 1024px width; assert 2-column layout (or whatever the design lands on).
- **Accessibility:** assert each card has `<article>` semantic, episode title in heading, and total-time pill has `aria-label`.

**Verification:**
- Visual review on real device (iPhone, Android — at least one of each) confirms the design feels intentional, not generic.
- Lighthouse mobile score ≥ 90 on Performance and Accessibility.

---

### U12. Custom audio player with synchronized transcript

**Goal:** The single most design-critical surface in the app — an audio player that visually feels like a designed object, plays the segment's audio, and highlights the transcript word-by-word in sync with playback. Tap a transcript line to seek there.

**Requirements:** R6, F4, R17.

**Dependencies:** U1 (Particle audio URL + word timestamps confirmed), U10 (motion presets, theme tokens), U11 (rendered inside the expanded card).

**Files:**
- `components/player/audio-player.tsx` (created — top-level player container)
- `components/player/transcript-sync.tsx` (created — RAF-driven word highlighter)
- `components/player/scrubber.tsx` (created — Motion-driven drag scrubber)
- `components/player/waveform.tsx` (created — wavesurfer.js wrapper)
- `lib/audio/use-audio-element.ts` (created — hook wrapping `HTMLAudioElement` lifecycle)
- `__tests__/components/player/audio-player.test.tsx` (created)
- `__tests__/components/player/transcript-sync.test.tsx` (created)
- `__tests__/lib/audio/use-audio-element.test.ts` (created)

**Approach:**
1. **Native `<audio>` element + custom UI** (best-practices research finding): `<audio ref preload="metadata" src={clipAudioUrl}>` mounted invisibly; all controls render around it.
2. **Wavesurfer for the waveform**: `@wavesurfer/react` v7+. Memoize plugins with `useMemo` — wavesurfer mutates the DOM and breaks if React recreates the node. Call `wavesurfer.destroy()` on unmount. Loads the same audio URL, doesn't re-fetch (browser cache).
3. **Transcript sync via `requestAnimationFrame`**: a `useEffect` starts a `rAF` loop on play; every frame reads `audioRef.current.currentTime` and mutates `dataset.active="true"` on the active word's `<span>`. **Bypasses React reconciliation** — re-rendering 3000 word spans 60×/sec stutters. Stops the loop on pause/end.
4. **Click-to-seek transcript lines**: each line is a `<button data-start={seconds}>`; one parent-level `onClick` reads `e.target.closest('[data-start]')` and sets `audioRef.current.currentTime`.
5. **Drag scrubber** (Motion): `<motion.div drag="x" dragConstraints={{ left: 0, right: width }} dragSnapToOrigin="x" onDrag={...}>` with a `useSpring` on the playhead position for the bouncy/playful feel. On drag end, sets `currentTime`.
6. **Virtualization**: long transcripts (90-min episodes have ~3000+ words) virtualize via `@tanstack/react-virtual` — keeps DOM size sane on mobile.
7. **Mobile-specific UX**: large play button (56pt), single-tap-to-play, swipe-down to dismiss the player sheet on mobile (Motion gesture). Volume control omitted on mobile (use system volume); play/pause/scrub/seek are sufficient.
8. **Reduced-motion fallback**: under `prefers-reduced-motion`, scrubber drag goes to plain native, waveform animation pauses, transcript highlight uses CSS-only color change (no `framer-motion` springs).
9. **Streaming**: relies on `Accept-Ranges` from Particle's audio CDN for HTTP range requests on seek (research finding — Supabase Storage and most CDNs support this; verify in U1 against Particle's actual audio URL).
10. **Fallback path** (per U1 contingency): if Particle does not expose raw audio URL, this entire unit becomes "wrap `<particle-podcast-clip>` with our chrome and accept reduced design control." That degraded path is a separate plan written reactively if U1 returns bad news.

**Execution note:** Build this unit test-first for the transcript-sync logic specifically — the pure-DOM RAF mutation is the highest-risk piece, and TDD on the time-to-active-word mapping catches off-by-one errors that would otherwise show up as "highlighting feels slightly behind the audio" later.

**Patterns to follow:**
- Native HTMLAudioElement + custom UI from best-practices research (avoid React-h5-audio-player).
- RAF-bypass-React pattern for high-frequency UI updates from research.
- Motion `useSpring` for playhead position from research.

**Test scenarios:**
- **Audio loads metadata:** mock `<audio>` `loadedmetadata` event with duration=120; assert duration displays correctly in UI.
- **Play/pause:** click play button; assert `audioRef.current.play()` called; assert UI shows pause icon. Click again; assert `pause()` called.
- **Transcript highlighting (correctness, time-aware):** transcript with 5 words at start times [0, 1, 2, 3, 4]; mock currentTime sequence [0.5, 1.5, 2.5, 3.5, 4.5]; assert correct word has `data-active="true"` at each tick. **This is the unit's highest-risk behavior.**
- **Click-to-seek:** click word at start=2.0s; assert `audioRef.current.currentTime === 2.0`. **Covers AE6.**
- **Long transcript virtualization:** render 3000-word transcript; assert ≤100 word DOM nodes are mounted at any given scroll position.
- **Drag scrubber:** simulate drag from 0 to 60% of width; assert `currentTime` is set to ~60% of duration on drag end.
- **Reduced-motion:** with `prefers-reduced-motion: reduce`, render player; assert no spring transitions on scrubber, no waveform animation; transcript still highlights (color change only).
- **Cleanup on unmount:** mount, then unmount; assert wavesurfer `destroy()` was called and the rAF loop is cancelled.
- **Range request seek:** mock audio source; assert that seeking past the loaded buffer issues a fetch with `Range:` header (browser behavior; spy on fetch).
- **Particle iframe fallback (only if U1 forced contingency):** if `clipAudioUrl` is null but `embedUrl` is present, render `<particle-podcast-clip src={embedUrl}>` with our wrapper chrome instead.

**Verification:**
- On a real iPhone, Mina Kimes 90-second clip plays smoothly, transcript highlights word-by-word with no perceptible lag, taps on transcript lines seek instantly. Player feels designed, not generic.
- Lighthouse Performance score ≥ 85 on the expanded-card page (audio is heavy; this is realistic).

---

### U13. Feedback affordances and cost telemetry surface

**Goal:** Two product surfaces that close the v1 loop — per-segment feedback (R9, F3) and a small in-app view of API spend (Q2 cost-consciousness). Both write to existing tables; this unit is mostly UI + a small route handler.

**Requirements:** R9, R10, F3, plus the cost-telemetry decision from Q2.

**Dependencies:** U5 (`feedback` and `api_calls` tables), U11 (cards rendered), U12 (player rendered).

**Files:**
- `components/feedback/feedback-bar.tsx` (created — three-button row at the bottom of each card)
- `app/api/feedback/route.ts` (created — POST handler)
- `app/(app)/usage/page.tsx` (created — small RSC page rendering today/this-week API spend)
- `lib/feedback/optimistic.ts` (created — optimistic UI update + rollback)
- `__tests__/components/feedback/feedback-bar.test.tsx` (created)
- `__tests__/app/api/feedback/route.test.ts` (created)

**Approach:**
1. **`feedback-bar.tsx`:** three small icon-buttons at card foot — `Not relevant` (X), `Not substantive` (filter), `Love this` (heart). Color-neutral by default; team accent on hover. On click, optimistic local update (the "Not relevant" choice immediately removes the card with a `motion.div exit`), POST to `/api/feedback` in background, rollback on error.
2. **Route handler `/api/feedback`:** POST `{ cardId, segmentId, surfacingEntity, verdict }` → server client → insert into `feedback` (RLS auto-scopes to user) → return 200. On 4xx/5xx the optimistic update rolls back.
3. **Hidden cards (Phase 1 of intelligence per R10):** `feedback.verdict='not_relevant'` triggers a server-side flag — in v1, the hide is purely client-side per session. **Phase 2** of the feedback pipeline (per R11) introduces actual hiding logic via a SQL view, deferred from v1.
4. **`/usage` page:** a small RSC reading `api_calls` aggregated by day/provider/endpoint. Table layout: Today / Last 7 days / Last 30 days. Total cost in USD, broken down by provider (Particle vs Anthropic). Plus a count of cards generated for that spend (helps the user feel the cost-per-card).
5. **Visual treatment:** `/usage` uses the same dark surface tokens as the digest, but with a more "data utility" feel — generous monospace numerals, oversized totals, sparse styling. Editorial-confident, not dashboard-busy.

**Patterns to follow:**
- Optimistic UI with rollback (standard React 19 pattern).
- Postgres view for cost rollups (research finding) — created in U5's migrations.

**Test scenarios:**
- **Happy path (feedback):** click "Not relevant" on a card; assert optimistic removal happens immediately; assert POST to `/api/feedback` with correct payload; assert success state.
- **Rollback on failure:** mock POST returning 500; assert card reappears with a small error toast.
- **Auth on route handler:** POST to `/api/feedback` from unauthenticated session — RLS rejects insert. Test asserts 403 (or similar). Even in v1 stub-auth this proves the wiring.
- **Three feedback verdicts:** all three buttons fire correct verdicts; only "Not relevant" hides the card immediately.
- **Cost view aggregation:** seed `api_calls` with 3 rows (Particle + Anthropic mix); render `/usage`; assert correct sums and per-provider breakdown.
- **Cost view empty state:** with no `api_calls` rows, render shows zero and a friendly "Run your first ingestion to see usage" copy.

**Verification:**
- Marking a card as not-relevant on real-device demo immediately removes it with a smooth motion, persists across reload (in v2-flagged hide; in v1 the persistence is partial — documented).
- `/usage` page renders accurately against real `api_calls` data after a manual ingest run.

---

## Scope Boundaries

### Deferred for later (origin)

- Additional teams beyond the 49ers (Giants, Warriors, Sharks). Architecture supports them; v1 ships only one to validate the loop.
- Multi-team UI chrome — section headers per team, switcher in the app bar. Wakes up in v2.
- Auth flows beyond stub (magic link via Supabase). Wakes up in v3.
- "Discovery" surface that pulls from the full Particle library (not just curated podcasts). Architecture supports it; v1 renders the curated surface only.
- Auto-refresh of roster from external NFL data (ESPN, Pro Football Reference). v1 uses the manually-maintained roster config from U6.
- Phase 2 feedback intelligence (per-show automatic weighting via SQL aggregation).
- Phase 3 feedback intelligence (LLM borderline-case relevance check).
- Email digest, push notifications, stitched personal-podcast-feed delivery. v1 is web-app-only.
- Other content sources from the original vision (YouTube clips, tweets, articles).
- Mobile-native apps. v1 is responsive web only.

### Outside this product's identity (origin)

- Hosting or re-hosting podcast audio. Podium points back to the source episode and embeds clips via Particle; it is not a podcast publishing platform.
- A general-purpose podcast app or "Spotify for sports." Podium is a *digest* — its identity is reducing volume to relevance, not browsing or replacing the listening experience.
- A breaking-news ticker. Cadence is intentionally daily.
- Discovery-driven content ("what podcasts should I follow?"). The product assumes the user already has shows they care about.
- Editorial content. Podium summarizes what others said; it does not generate original sports analysis.

### Deferred to Follow-Up Work

- **Brand identity work** (wordmark design, logo, full color exploration). User picked option C on Q7; defer to v2 once product feel is proven.
- **Spec-flow-analyzer pass** for edge-case completeness across F1–F4. Available via the post-generation menu's deeper-doc-review option if useful.
- **`docs/solutions/` learnings** for each completed unit (per `ce-compound`). Surfaces during execution as a per-unit follow-up, not blocking the unit itself.
- **Particle pricing tier review.** The plan is cost-conscious by default; a real cost review happens after the first week of production runs.
- **Supabase free-tier project pause heartbeat** (research flagged a 7-day idle pause). Add a tiny GitHub Actions weekly heartbeat in v2; v1 will be exercised daily by the cron itself.
- **Anti-rugpull hardening for Particle**: contract test that captures the API response shape; runs nightly; alerts on schema drift. Defer until Particle has shipped at least one breaking change to confirm the threat is real.

---

## Key Technical Decisions

- **Supabase Edge Function + `pg_cron` for the daily worker, not Vercel Cron.** Vercel Hobby is daily-only and 60s-cap; Pro is 5min-cap. Edge Functions get 150s and second-precision scheduling. Plus the Function runs close to the database, lowering ingestion latency.
- **Native `<audio>` + wavesurfer.js + `requestAnimationFrame` transcript highlighting > React-driven reconciliation.** 3000+ word transcripts updating 60×/sec destroy mobile performance under React reconciliation; RAF-mutating `data-active` bypasses that path.
- **Tailwind v4 `@theme inline` + `@property`-registered color tokens for team-adaptive theming.** v3's JS theme cannot animate transitions between palettes; v4's CSS-first config can, with `@property` registration.
- **`team_id` as text primary key + `user_id uuid not null references auth.users(id)` from day one.** Brings multi-tenant data shape into v1 without v1 paying complexity tax. Migrating to FK + `account_members` for v3 is additive.
- **Anthropic Message Batches API for the daily ingestion summarization, regular Messages API for manual trigger.** 50% discount on the daily run (24h SLA acceptable for a 6am job scheduled the night before); realtime path for user-initiated runs where 24h is too slow.
- **OKLCH color space for all team palettes, with WCAG contrast verification in CI.** Mathematical contrast guarantees + smooth transitions between palettes when the user switches teams (v2+).
- **`docs/solutions/` learnings written per-unit during execution, not at the end.** Each unit produces a small durable learning (Particle shape, env setup, domain DNS). Future agents (and future-you) skip the relearning tax.
- **Custom audio player conditional on U1.** If Particle doesn't expose raw audio URL or word-level timestamps, U12 degrades to a styled iframe wrapper. The plan documents both paths.

---

## Risks & Mitigations

- **Risk: Particle does not expose raw audio URL or word-level timestamps.**
  - Mitigation: U1 verifies before Phase D. If it fails, U12 degrades to a styled embed wrapper; the rest of the app proceeds. Custom-player work is the only thing blocked. Probability: low (endpoint named `get-word-level-transcript` strongly implies word-level data exposure). Impact: medium (significant design downgrade if it happens).

- **Risk: Particle Starter $10 credit runs out during build/test.**
  - Mitigation: dev-mode in U8 caps query volume during testing; cost telemetry in U13 shows burn rate; the plan calls out adding a payment method or upgrading to Growth as an explicit pre-launch checklist item before the first full-scale daily run. Probability: medium-high if tests are run carelessly. Impact: low (resolved by adding a payment method).

- **Risk: Vercel + Supabase + Edge Function cross-runtime drift.**
  - Mitigation: shared `lib/ingest/pipeline.ts` is runtime-agnostic; integration test in U8 exercises both paths (manual route handler + Edge Function) against the same logic. Probability: medium. Impact: medium (partial outage; obvious to debug).

- **Risk: 49ers entity slugs in Particle are not what we expect (e.g., `san-francisco-49ers` vs `49ers` vs missing entirely).**
  - Mitigation: U1 captures real slugs in `docs/solutions/2026-05-09-particle-api-shape.md`; U6's universe config uses real slugs, not guessed ones. Probability: low. Impact: low (the worker simply returns no results until slugs are corrected).

- **Risk: Custom audio player + transcript sync feels off (latency, jitter, off-by-one) on mobile.**
  - Mitigation: U12's execution note calls for test-first development of the time-to-active-word mapping; integration tests cover the rAF loop; real-device verification is part of the unit's verification step. Probability: medium (this is genuinely the hardest UX). Impact: high (it's the design centerpiece).

- **Risk: Tailwind v4 + shadcn/ui + Motion v12 incompatibility surfaces during integration.**
  - Mitigation: framework-docs research confirmed shadcn now officially supports Tailwind v4. If specific shadcn components throw on v4, swap to manual Radix primitives — same underlying library. Probability: low. Impact: low.

- **Risk: Supabase RLS policies have a subtle hole (e.g., missing WITH CHECK) that allows cross-user write.**
  - Mitigation: explicit RLS smoke tests in U5 attempt cross-user writes; CI fails if they succeed. Probability: low. Impact: critical (data integrity / privacy).

- **Risk: Daily worker exceeds Edge Function 150s wall on the auto-seed run (3 days of content × 31 podcasts).**
  - Mitigation: the seed run shards by podcast — one Edge Function invocation per ~10 podcasts; queue-driven. Worst case: seed completes over 2-3 invocations. Probability: medium. Impact: low (slower seed; not user-visible if loading state is in place).

---

## Dependencies / Prerequisites

- **Accounts already in place** (per Q5): Vercel Pro, Supabase Pro (account; project not yet created — handled in U3), GitHub `intrater/podium` (already pushed to). Domain `podiumsports.app` registered.
- **Accounts/keys to obtain during execution**: Particle API key (Starter tier exists; key generation in U1), Anthropic API key with billing (in U3), Supabase project + service role key (in U3), `CRON_SECRET` (random, in U3).
- **External services**: Particle API up and accessible; Anthropic API up; Supabase platform up. All considered ambient infrastructure.
- **Local environment**: Node 20+ (Next.js 16 minimum); Deno (for Supabase Edge Function local development); Supabase CLI for migrations.

---

## Success Metrics

- **End-to-end loop completes**: a real Particle run on a real day surfaces real 49ers cards in the deployed app on `podiumsports.app`. Baseline goal for Phase D completion.
- **Mobile-first feels right**: opening the app on a phone shows the digest in a way the user finds *intentional, not generic* (R17 + Q6). Subjective but binary.
- **Custom audio player works**: tap a transcript line, audio seeks; play, words highlight in time. Subjective but verifiable.
- **Cost stays under $30 for the first 30 days of production-equivalent use** (after build/test phase). Confirms the architectural cost-consciousness of caching + Batches API.
- **Zero cross-user data leakage** in RLS smoke tests (data integrity baseline).
- **Daily worker runs reliably for 7 consecutive days** without manual intervention. Confirms the cron + Edge Function path is stable.

---

## Operational / Rollout Notes

- **First production run before user-facing launch**: trigger the manual `/api/ingest` route once on the deployed app to seed the database against real Particle. Verify cards appear. Verify cost telemetry registers.
- **Daily worker activation**: schedule `pg_cron` only after the first manual seed succeeds. Otherwise the first scheduled run might fail in a way that's harder to diagnose than an explicitly-triggered run.
- **Pre-launch checklist (created in U13's learning doc)**: domain DNS verified ✓, all env vars set in Vercel ✓, Supabase migrations applied to production project ✓, Particle payment method on file (or Growth upgrade) ✓, manual ingestion run completed and inspected ✓, RLS smoke tests passing in CI ✓.
- **Post-launch observability**: `/usage` page is the primary observability surface; supplement with Supabase's built-in Postgres logs, Vercel's function logs, and Sentry-or-similar wired into route handlers. Sentry setup is not in v1 scope; defer to Deferred-to-Follow-Up.

---

## Verification

This plan is ready to execute when:
- The implementer can read U1 and start fetching Particle docs without further direction.
- Each subsequent unit's `**Approach:**` and `**Files:**` are concrete enough that an agent can run `ce-work` against them and produce code without inventing scope.
- The single largest unknown (Particle audio + transcript exposure) is gated by U1 with explicit fallback paths documented.

A future deepening pass (`/ce-plan` re-invocation) can strengthen any unit whose implementation surfaces unexpected complexity.
