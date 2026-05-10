-- Podium v1 — UNIQUE constraint on universes.team_id.
--
-- The original schema (0001) declared `team_id text not null references
-- teams(id)` without a UNIQUE constraint. The seed runner does a
-- lookup-then-insert across two round-trips, which is a textbook race
-- window: two concurrent `npm run seed` invocations can both observe "no
-- existing universe", both insert, and leave duplicate rows that then
-- trip `.maybeSingle()` errors on every subsequent read.
--
-- Adding UNIQUE (team_id) closes the race mechanically and lets the seed
-- runner switch to a true upsert (`on conflict (team_id) do update`),
-- which also makes the seed propagate config edits to the row instead of
-- silently leaving stale entities/storylines.
--
-- Resolves U5 review residual #17.

alter table universes
  add constraint universes_team_id_unique unique (team_id);
