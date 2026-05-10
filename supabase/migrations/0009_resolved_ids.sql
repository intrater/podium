-- Podium v1 — cached Particle IDs alongside slug-keyed config.
--
-- Particle's `/v1/podcasts/mentions` requires `entity_id` (NOT slug) and
-- `/v1/podcasts/episodes` requires `podcast_id` (NOT slug). U6's
-- universe + curated podcast list ships as slugs only, so the daily
-- worker (U8) needs the resolved IDs to make its primary queries.
--
-- Two options to source the IDs: (a) cache them in the database at seed
-- time, or (b) resolve in-memory at every worker startup. (a) is the
-- chosen path — one-time cost, no recurring API spend, and the slug
-- list stays the human-readable source of truth.
--
--   - podcasts.particle_id    text  — populated by `lib/seed/index.ts`
--                                     via `listPodcasts({q: name})`,
--                                     matching on slug.
--   - universes.entity_id_map jsonb — slug→id map populated by
--                                     `lib/seed/index.ts` via
--                                     `listEntities({q: slug-as-name})`.
--                                     The original slug array stays in
--                                     universes.entities as the
--                                     editable source of truth.

alter table podcasts
  add column if not exists particle_id text;

alter table universes
  add column if not exists entity_id_map jsonb not null default '{}'::jsonb;
