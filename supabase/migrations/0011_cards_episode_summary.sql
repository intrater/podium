-- Podium v1 — store the team-relevant episode rollup on cards.
--
-- The ingest pipeline calls `summarizeEpisode` (lib/anthropic/summarize-
-- episode.ts) once per episode to produce a 2-3 sentence rollup that
-- drives the card's surface text (R5 — "an episode-level summary across
-- all relevant segments"). Stored on `cards` rather than `episodes`
-- because the rollup is team-relevant: a 49ers-flavored rollup of a
-- multi-team episode would read differently from a Patriots-flavored
-- one. v1 single-user / single-team makes the distinction moot today,
-- but the schema honors v2 multi-team without a rewrite.

alter table cards
  add column if not exists episode_summary text;
