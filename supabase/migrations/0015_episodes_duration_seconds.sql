-- Podium v1 — capture episode duration on persisted episodes.
--
-- Powers the "saved you ~N hours of listening" stat in the digest
-- header. Calculation: total scanned episode duration minus total
-- moment duration surfaced. Episode duration is already returned by
-- Particle's transcript endpoint (and the episodes list endpoint),
-- so the pipeline writes it during normal upsert — no extra API
-- call. The column is nullable so the 10 episodes ingested before
-- this migration aren't forced into a one-shot blocking backfill;
-- a separate backfill script tops them off via getClipTranscript.

alter table episodes
  add column duration_seconds int;

comment on column episodes.duration_seconds is
  'Total episode length in seconds. Returned by Particle on listEpisodes / transcript fetch. Nullable for backfill tolerance.';
