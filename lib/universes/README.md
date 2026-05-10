---
date: 2026-05-10
topic: universe-config
applicability: U6 niners universe seeding, U8 daily worker, future v2 multi-team
---

# Universe configs

A "universe" is the data definition of *what counts as content for a team* — the entities the daily worker should query for and the storyline phrases it should semantic-search.

## v1 simplifications

- **One team.** Only `niners` lives here. The shape is multi-team-ready (each universe carries its own `teamId`), so v2 adds a sibling file per team rather than reshaping the schema.
- **Predicted slugs only.** U1 round-2 verification found 100% of predicted slugs (rule: `name.toLowerCase().replace(/'/g,'').replace(/\./g,'').replace(/\s+/g,'-')`) match Particle's canonical entity. There is no startup slug-resolution script; the universe is just data. If a fringe roster addition during the season turns up a miss, `nameFallbacks` exists as the safety net.
- **Single sport.** `config/teams.ts` carries a `sport` field for v2 disambiguation (R16 — "Giants" can mean SF baseball or NY football). v1 has no ambiguity to resolve.

## v2 / v3 evolution

- **Adding a team:** create `lib/universes/<team>.ts` with the same `Universe` shape, add the team to `config/teams.ts`, run `scripts/seed-supabase.ts`. The daily worker reads from the `universes` table and doesn't need code changes.
- **Sport disambiguation:** when multiple sports share an entity name, the worker filters search results by the universe's `teamId` and the team's `sport` before surfacing.

## Where the data lands

`scripts/seed-supabase.ts` reads the configs in this directory plus `config/podcasts.ts` and `config/teams.ts`, then writes:

- one row in `teams` per team in the registry
- one row in `universes` per universe file (linked back via `teams.universe_id`)
- one row in `podcasts` per curated catalog hit

All inserts use `on conflict do nothing`, so the script is safe to re-run.
