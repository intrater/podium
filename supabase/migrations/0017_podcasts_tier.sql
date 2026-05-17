-- Podium v2 — catalog tiering.
--
-- v2 (editorial reframe — see docs/plans/2026-05-17-001-feat-podium-v2-
-- editorial-reframe-plan.md U1) introduces tier A/B/C as the spine of
-- "which voices are worth their own card vs. which voices only
-- contribute a frequency signal."
--
-- Tier A: named voices, opinion-driven — fanatics open Podium
--   specifically for these. Notable-take cards may surface a solo
--   Tier A take with no cross-source corroboration.
-- Tier B: real coverage / reportorial — typically clusters with Tier A
--   inside theme cards. Does not surface solo cards.
-- Tier C: daily local treadmills and hot-take entertainment —
--   participation contributes to theme frequency but never surfaces
--   as a solo card.
--
-- Default 'C' is the safe assumption for any new podcast added later;
-- the seed script writes the actual assignment from config/tiers.ts.
-- Text + check constraint keeps tier easy to evolve (e.g., add 'S' for
-- once-in-a-generation voices later) without a schema migration.
--
-- RLS posture: podcasts is `read by authenticated`, write via service-
-- role. The new column is catalog metadata, no policy change needed.

alter table podcasts
  add column if not exists tier text not null default 'C'
  check (tier in ('A', 'B', 'C'));

comment on column podcasts.tier is
  'Editorial tier (A/B/C). A = named voices that surface solo cards. B = coverage shows that cluster into theme cards. C = frequency-signal only. Seeded from config/tiers.ts; manual override via DB write always wins.';
