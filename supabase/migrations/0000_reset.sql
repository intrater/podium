-- Podium v1 — reset.
--
-- The Supabase project carried tables from a prior Apple-based ingestion
-- attempt (different identity model, no segments, no universes). Those
-- tables are dropped here so the Particle-based v1 schema in 0001 can land
-- cleanly. Safe because v1 has no production users.
--
-- If this migration runs against a fresh database, the IF EXISTS clauses
-- make every drop a no-op.

drop table if exists summaries     cascade;
drop table if exists transcripts   cascade;
drop table if exists user_teams    cascade;
drop table if exists user_profiles cascade;
drop table if exists episodes      cascade;
drop table if exists podcasts      cascade;
drop table if exists teams         cascade;

drop function if exists rls_auto_enable cascade;
