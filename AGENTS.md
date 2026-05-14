<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Podium — coding agent guidance

Podium is a daily web-app digest of 49ers podcast moments. v1 ships single-user / single-team / no-auth; the architecture is multi-user / multi-team / multi-sport from day one. The canonical plan and decisions live in `docs/plans/` and `docs/brainstorms/`. Per-unit learnings accrete in `docs/solutions/`.

## Stack (locked)

- TypeScript + Next.js 16 (App Router, React 19)
- Tailwind v4 (CSS-first config in `app/globals.css`; no `tailwind.config.js`)
- shadcn/ui (copy-into-repo at `components/ui/`)
- Motion (the package is `motion`; the import is `motion/react` — NOT `framer-motion`)
- Supabase (Postgres + Auth + RLS) — Edge Functions in Deno; client in Node
- Anthropic Claude Haiku 4.5 (realtime Messages API; prompt caching)
- Particle API (`https://api.particle.pro` — `X-API-Key` header preferred over `Authorization: Bearer`)
- Vercel hosting, custom domain `podiumsports.app`

## File and naming conventions

- App Router groups (`app/(app)/`) for the authenticated app surface; `app/api/*/route.ts` for server route handlers.
- `components/ui/` for shadcn primitives (vendored, not depended on).
- `components/<feature>/` for feature-specific UI (`digest/`, `player/`, `feedback/`).
- `lib/<domain>/` for non-React modules (`particle/`, `anthropic/`, `supabase/`, `universes/`, `ingest/`).
- `config/` for plain-data config (`podcasts.ts`, `teams.ts`).
- `supabase/migrations/` for SQL migrations; `supabase/functions/` for Edge Functions.
- File names are `kebab-case.ts(x)`; React components export PascalCase.
- Repo-relative paths in docs and plans; never absolute paths.

## Do

- Use the design tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, etc.) — they flow through `app/globals.css`'s `@theme inline` block. The token set expands in U10.
- Type Particle and Anthropic responses narrowly (only fields we use) in `lib/particle/types.ts` and `lib/anthropic/types.ts`.
- Wrap every external API call in the cost-telemetry helper (`lib/particle/tracked-call.ts`, similar for Anthropic). Every call lands in the `api_calls` table.
- Use `cn()` from `lib/utils.ts` for conditional Tailwind class composition.
- Test client/server component boundaries — server components by default; `"use client"` only when interactivity, motion, or browser APIs require it.
- Run `npm run lint` and `npm run build` before committing. Both must pass.
- `git pull --rebase origin <branch>` before pushing if working alongside others.

## Don't

- Don't import from `framer-motion`. The package is `motion`, the import is `motion/react`. Lint should catch this; treat any leftover `framer-motion` import as a bug.
- Don't reintroduce Tailwind v3 patterns: no `tailwind.config.js`, no `@tailwind base/components/utilities` directives, no `theme.extend` JS config. Tokens live in `app/globals.css` via `@theme inline`.
- Don't reference `PARTICLE_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, or `CRON_SECRET` from any client component. They're server-only by design (enforced via `lib/env.ts` once that lands in U3).
- Don't commit `.env.local` or `supabase/seed.sql` — both are gitignored and contain real values.
- Don't use the `<particle-podcast-clip>` embed by default. The plan ships a custom audio player; the embed is the U1-A contingency fallback only, and U1's docs verification cleared that contingency. If you find yourself reaching for the embed, check whether you actually need to.
- Don't add features, abstractions, or scope beyond the active plan unit. New scope goes through `/ce-plan`, not silent expansion in `/ce-work`.

## Reference docs

- `docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md` — the active plan
- `docs/brainstorms/podium-v1-requirements.md` — origin requirements
- `docs/reference/particle-api.md` — vendored snapshot of every Particle endpoint (~7k lines; grep this before WebFetch'ing the live docs)
- `docs/reference/particle-api-index.md` — compact endpoint index, scan first to find the right endpoint
- `docs/solutions/2026-05-09-particle-api-shape.md` — Particle response shapes verified against the docs
- `docs/solutions/2026-05-09-particle-cost-estimate.md` — cost model and budget framework

## Working with the user (read this every session)

The user is **John Intrater**, a designer building Podium solo. He is **not an engineer** — guide step-by-step, explain trade-offs in plain language, and don't assume familiarity with backend, infra, or Postgres internals. He'd rather understand a smaller correct thing than skim a larger half-correct thing. When proposing decisions, surface the recommendation with one sentence on why; don't bury it in a tradeoff matrix.

**Collaboration preferences:**

- **Never ask the user to paste secrets, API keys, JWTs, or credentials into chat.** All such values live in `.env.local` (gitignored) and dashboards. If a value is needed, source it from `.env.local` via shell, or ask the user to update `.env.local` directly. The setup walkthrough at `docs/solutions/2026-05-09-env-and-secrets-setup.md` covers what goes where.
- **Pick up from the plan, not the conversation.** Each session, read `docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md` (the Unit Status table near the top) to understand what's done and what's next. The "Residual review findings" section there enumerates deferred follow-ups by when they should land. Continuity across sessions/machines lives in the repo, not in any per-machine memory store.
- **Default to action over conversation when the path is clear.** If a unit is queued and unblocked, propose to start it and proceed if the user agrees. Long planning chats before a 30-minute unit are a tax.
- **Prefer one bundled commit per unit** unless multiple logical scopes shipped together (then split). The user is fine with co-authored commit messages from Claude.
- **Migration safety:** the project ships against a single Supabase project (`fszzncbglomjtsardyej`) with no separate staging until pre-launch. Do not modify migrations that have already been applied — write a follow-up migration instead. The Supabase CLI tracks migration history by version (filename) and a destructive 0000_reset already ran once with explicit user authorization; further destructive operations require explicit confirmation each time, not "you said yes earlier."

**Things to verify each session before starting work:**

1. `git pull --rebase origin main` (the user works across machines).
2. `git status` is clean.
3. `npm install` is current (run if `package-lock.json` changed since last session).
4. `.env.local` exists locally — gitignored, but Vercel is the source of truth. To populate (or refresh) on any machine: `vercel link` (one-time per machine) then `vercel env pull .env.local`. See `docs/solutions/2026-05-09-env-and-secrets-setup.md` for the full flow including the new-machine onboarding script.
