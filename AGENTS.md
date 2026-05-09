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
- `docs/solutions/2026-05-09-particle-api-shape.md` — Particle response shapes verified against the docs
- `docs/solutions/2026-05-09-particle-cost-estimate.md` — cost model and budget framework
