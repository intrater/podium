-- Podium v1 — follow-up index adjustments from the U5 code-review pass.
--
-- Two issues surfaced when ce-code-review walked the schema:
--
-- 1. `segments_particle_id_idx` (a partial btree on
--    `where particle_segment_id is not null`) duplicates the auto-index
--    Postgres creates for the `unique` constraint on the same column.
--    Two btrees serve no read or write that the unique-constraint index
--    doesn't already serve. Drop the partial index.
--
-- 2. `feedback.card_id` and `feedback.segment_id` carry FKs with
--    `on delete cascade` but no FK-side indexes. Every parent delete
--    seq-scans `feedback`, which is fine at v1 scale but bites at v3.
--    Add the indexes now while the table is empty.

drop index if exists segments_particle_id_idx;

create index if not exists feedback_card_id_idx
  on feedback (card_id) where card_id is not null;

create index if not exists feedback_segment_id_idx
  on feedback (segment_id) where segment_id is not null;
