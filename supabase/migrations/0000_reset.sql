-- Podium v1 — reset.
--
-- ⚠️  DESTRUCTIVE.  Replaying this migration drops every v1 table —
-- including data tables (cards, feedback, segments, ...). `supabase db
-- reset` runs every migration including this one. **Never run db reset
-- against the live project (`fszzncbglomjtsardyej`) without explicit
-- intent and a backup — this will erase production data.**
--
-- This migration is the "nuke everything before 0001 lands" step. It runs
-- once against a clean target and is destructive by design.
--
-- Two generations of tables are dropped in dependency order:
--
--   1. The prior Apple-based ingestion schema (different identity model,
--      no segments, no universes). These were the tables that prompted the
--      original reset.
--   2. The v1 Particle-based tables defined in 0001. They aren't touched
--      on a fresh project (IF EXISTS = no-op), but listing them keeps the
--      reset honest: if a future replay collides with a partially-applied
--      v1 schema, 0000 cleans it before 0001 retries — instead of failing
--      mid-way with a relation-already-exists error.
--
-- Migration history is tracked by filename version, so editing this file's
-- contents does not cause Supabase to re-run it on already-applied
-- databases. The change here only affects fresh replays.

-- v1 tables (in reverse dependency order so cascades aren't required —
-- belt-and-braces with cascade anyway).
drop table if exists ingest_jobs   cascade;
drop table if exists system_alerts cascade;
drop table if exists api_calls     cascade;
drop table if exists feedback      cascade;
drop table if exists cards         cascade;
drop table if exists segments      cascade;
drop table if exists episodes      cascade;
drop table if exists podcasts      cascade;
drop table if exists universes     cascade;
drop table if exists teams         cascade;

-- Prior Apple-era tables (kept for replay safety on the original target).
drop table if exists summaries     cascade;
drop table if exists transcripts   cascade;
drop table if exists user_teams    cascade;
drop table if exists user_profiles cascade;

drop function if exists rls_auto_enable cascade;
