---
date: 2026-05-09
topic: env-and-secrets-setup
applicability: U3 environment + Supabase project creation, U4 domain DNS, plan operational notes
status: scaffolding done; user-side dashboard work pending laptop session
plan-ref: docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md
sibling-docs:
  - docs/solutions/2026-05-09-particle-api-shape.md
  - docs/solutions/2026-05-09-particle-cost-estimate.md
---

# Environment & Secrets Setup Walkthrough

This doc captures the complete v1 setup: which dashboards to visit, what to capture, where to put what you capture. It is the canonical "I forgot how to set this up again" reference. Update it as you go if any step diverges from the steps below.

**Honest caveat on dashboard click-paths:** dashboard UIs evolve. The values you need are stable; the exact button labels and screen layouts may differ slightly from what's described here. When in doubt, search the dashboard for the value type ("API key," "JWT Secret," "Service Role") rather than following clicks literally.

---

## Prerequisites

- Local environment: Node 20+, Git, a Mac/Linux/WSL terminal.
- Existing accounts: Vercel Pro, Supabase Pro, GitHub `intrater/podium`, registrar holding `podiumsports.app`.
- Anthropic console account with billing enabled (separate from claude.ai consumer login — see below).
- Particle Starter account (already verified during U1 docs research).

## What you're setting up, at a glance

| Variable | Source | Where it goes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Settings → API | `.env.local` + Vercel Env Vars |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project Settings → API | `.env.local` + Vercel Env Vars |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project Settings → API (separate "service_role" key) | `.env.local` + Vercel Env Vars (server-only) |
| `SUPABASE_JWT_SECRET` | Supabase project Settings → API → JWT Secret | `.env.local` + Vercel Env Vars (server-only) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | `.env.local` + Vercel Env Vars (server-only) |
| `PARTICLE_API_KEY` | platform.particle.pro → (locate API key section) | `.env.local` + Vercel Env Vars (server-only) |
| `CRON_SECRET` | You generate locally (`openssl rand -base64 32`) | `.env.local` + Vercel Env Vars (server-only) |
| `PODIUM_USER_ID` | You generate locally (`uuidgen` on Mac) | `.env.local` + Vercel Env Vars |
| `INGEST_DEV_MODE` | You set ("true" for dev, "false" for prod) | `.env.local`: true; Vercel Production: false |

---

## Step 1 — Create Supabase staging + production projects

Two projects for safety: every migration tests on staging first, then promotes to prod. Per the doc-review fix, this is the canonical path for solo non-technical users — trades 5 minutes of setup for hours of recovery on a bad migration.

1. Sign in at [supabase.com](https://supabase.com) and visit your dashboard.
2. Create a project named **`podium-staging`**:
   - Region: any close to you (latency only matters for production).
   - Database password: generate with a password manager and save it.
3. Create a second project named **`podium-prod`**:
   - Region: **us-west-1 (Oregon)** per the planning decision (closest to SF, lowest latency for the user).
   - Database password: separate from staging. Save in password manager.
4. From each project's **Settings → API**, capture three values:
   - **Project URL** (e.g. `https://abcdefg.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** (starts `eyJ...`, long string) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret** (also starts `eyJ...`, separate from anon) → `SUPABASE_SERVICE_ROLE_KEY`
5. From the same page, capture the **JWT Secret** (under "JWT Settings" or similar) → `SUPABASE_JWT_SECRET`. This is what `lib/auth/stub-jwt.ts` uses to mint synthetic stub-JWTs in v1.

**Local development uses the *staging* project.** Production uses the *prod* project. Wire them accordingly in step 6.

## Step 2 — Generate an Anthropic API key

1. Visit [console.anthropic.com](https://console.anthropic.com) and sign in. **This is a separate login from claude.ai** — the consumer Claude product and the API console are distinct.
2. Add a payment method if not already on file (required for API access; the API has no free tier).
3. Visit the **API Keys** section, create a key named `podium`, and copy the value (starts `sk-ant-`). → `ANTHROPIC_API_KEY`
4. Optional but recommended: set a monthly spend limit on the workspace as a safety cap.

## Step 3 — Confirm or generate the Particle API key

If U1's docs research already had you generate a key, locate it in your password manager and skip this step. Otherwise:

1. Sign in at [platform.particle.pro](https://platform.particle.pro).
2. Locate the API Keys section (location varies by dashboard layout — search for "API Keys" or similar).
3. Generate a new key named `podium` and copy the value. → `PARTICLE_API_KEY`
4. **Critical reminder:** Starter tier has a $10 credit and **does not support overage**. Add a payment method or upgrade to Growth ($200/mo, 100k req) **before the first non-dev-mode ingest run** — credit exhaustion produces a hard 402 block, not graceful degradation. See `docs/solutions/2026-05-09-particle-cost-estimate.md` for the full cost model.

## Step 4 — Generate locally-rolled secrets

```sh
# CRON_SECRET — for /api/ingest authorization
openssl rand -base64 32

# PODIUM_USER_ID — UUID v4
uuidgen | tr '[:upper:]' '[:lower:]'
```

Store both in `.env.local` (next step) and in a password manager.

## Step 5 — Populate `.env.local`

```sh
cp .env.local.example .env.local
# Then open .env.local in your editor and fill in every blank.
```

Use the staging Supabase project's values for local dev. The `.env.local` file is gitignored — never commit it.

## Step 6 — Mirror env vars into Vercel

**Status (2026-05-10):** done. The Vercel project `john-intraters-projects/podium` exists and holds every variable from `.env.local` for both **Production** and **Development** environments. **Preview** is intentionally empty — Vercel CLI 53.3.1 has a bug rejecting its own documented "all preview branches" command; populate via the dashboard UI when PR previews actually matter (defer until the deploy unit).

If you need to re-populate from scratch (e.g., a key rotated):

1. From the project root: `vercel env rm <KEY> production --yes` then `printf "%s" "<value>" | vercel env add <KEY> production` for each var, or
2. Use the Vercel dashboard at vercel.com → podium project → Settings → Environment Variables.

For the original v1 path (skipped — single Supabase project means staging and prod share values): use the **prod** Supabase values for Production and the **staging** values for Preview, with `INGEST_DEV_MODE` set per environment.

## Step 6b — Onboard a new machine (the easy path)

Since Vercel holds every secret, onboarding a new machine is now a script, not a manual data-entry session.

```sh
# Prerequisites: brew install git node supabase/tap/supabase
git clone https://github.com/intrater/podium.git
cd podium
npm install
npm i -g vercel
vercel login          # browser flow; sign in to your personal Vercel account
vercel link           # pick the existing john-intraters-projects/podium project
vercel env pull .env.local   # populates .env.local from Vercel's encrypted store
supabase login
supabase link --project-ref fszzncbglomjtsardyej
npm run lint && npm run build && npm test
```

If all three of `lint`, `build`, and `test` complete without errors (and `npm test` reports `Tests 10 passed`), the machine is fully synced. No `.env.local` editing, no AirDrop, no copy-paste.

**Subsequent pulls (refresh secrets after a rotation):** `vercel env pull .env.local` — overwrites with the latest Vercel state.

## Step 7 — Verify

```sh
npm run dev
# Should boot at http://localhost:3000 without errors.
# Visit the page; the wordmark renders.

# If lib/env.ts catches a missing var, the dev server fails fast with a
# message naming the missing variable. Fix .env.local and reboot.

npm run build
# Should complete without env-var errors. The full build also catches
# any client component that references a server-only env var.
```

## Notes for future-you

- **Rotate keys when a session leaks them.** If a key is ever pasted in chat (any chat), rotate immediately and update `.env.local` + Vercel. The Particle API key from a prior session is the canonical example.
- **Don't add new env vars in only one place.** Adding `FOO_BAR` requires:
  1. Add to `.env.local.example` (template)
  2. Add to `lib/env.ts` schema (validation)
  3. Add to `runtimeEnv` block in `lib/env.ts` (bundler hint)
  4. Mirror into Vercel Env Vars (production deploys)
  All four. Otherwise something will silently break in one environment.
- **Service role key is poison if it leaks.** It bypasses every RLS policy. Treat it like a database root password. Never log it, never include it in error messages, never reference it from client code.

---

## What's done at the end of this walkthrough

- Two Supabase projects exist (staging + prod), provisioned but empty.
- Anthropic, Particle, and locally-rolled secrets are captured.
- `.env.local` is populated and gitignored.
- Vercel Env Vars mirror the secrets across environments.
- `npm run dev` and `npm run build` both succeed against the new values.

The next plan unit (U4 — connect podiumsports.app to Vercel) needs only DNS records at your registrar; everything else above is already set up.
