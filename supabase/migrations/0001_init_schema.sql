-- Podium v1 — initial schema.
--
-- Multi-team, multi-user shape from day one (v1 ships single-user / single-team
-- via stub-auth; the schema does not assume that). RLS policies live in
-- 0002_rls_policies.sql and key off auth.uid() — they fire identically for
-- the v1 stub-JWT and the v3 real-auth client.
--
-- Three U1 Round 2 additions on `segments` (vs the original plan):
--   - match_source       : how the segment was surfaced (keyword|semantic|entity)
--   - speaker_name        : optional speaker attribution from Particle
--   - speaker_role        : optional role string (HOST|PANELIST|...)

create extension if not exists "pgcrypto";

-- ─── Reference data (catalog-side) ───────────────────────────────────────

create table teams (
  id          text primary key,
  sport       text not null,
  slug        text not null,
  name        text not null,
  palette     jsonb not null,
  universe_id uuid
);

create table universes (
  id         uuid primary key default gen_random_uuid(),
  team_id    text not null references teams(id) on delete cascade,
  entities   jsonb not null,
  storylines jsonb not null,
  updated_at timestamptz not null default now()
);

alter table teams
  add constraint teams_universe_fk
  foreign key (universe_id) references universes(id) on delete set null;

create table podcasts (
  id             uuid primary key default gen_random_uuid(),
  particle_slug  text unique,
  name           text not null,
  kind           text not null check (kind in ('team-specific', 'national')),
  in_catalog     boolean not null default true
);

create table episodes (
  id                   uuid primary key default gen_random_uuid(),
  podcast_id           uuid not null references podcasts(id) on delete cascade,
  particle_episode_id  text unique not null,
  title                text not null,
  published_at         timestamptz,
  audio_url            text,
  raw_payload          jsonb
);

create table segments (
  id                  uuid primary key default gen_random_uuid(),
  episode_id          uuid not null references episodes(id) on delete cascade,
  particle_segment_id text unique,
  start_seconds       int,
  end_seconds         int,
  audio_url           text,
  speaker_name        text,
  speaker_role        text,
  match_source        text check (match_source in ('keyword', 'semantic', 'entity')),
  raw_transcript      jsonb,
  summary             text,
  pull_quotes         text[],
  bullets             text[],
  engagement_score    numeric,
  surfacing_entities  text[]
);

-- ─── User-scoped data ────────────────────────────────────────────────────

create table cards (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  team_id                text not null references teams(id) on delete cascade,
  episode_id             uuid not null references episodes(id) on delete cascade,
  surfaced_at            timestamptz not null default now(),
  total_relevant_seconds int,
  hidden                 boolean not null default false,
  unique (user_id, team_id, episode_id)
);

create table feedback (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  card_id           uuid references cards(id) on delete cascade,
  segment_id        uuid references segments(id) on delete cascade,
  surfacing_entity  text,
  verdict           text not null check (verdict in ('not_relevant', 'not_substantive', 'love')),
  created_at        timestamptz not null default now()
);

-- ─── Operational / observability ─────────────────────────────────────────

create table api_calls (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  provider      text not null,
  endpoint      text,
  tier          text,
  model         text,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10, 6) not null,
  request_id    text,
  metadata      jsonb
);

create table system_alerts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  started_at      timestamptz,
  finished_at     timestamptz,
  episodes_count  int,
  segments_count  int,
  cost_usd        numeric(10, 6),
  notes           text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);

create table ingest_jobs (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null,
  shard_index  int not null,
  podcast_ids  uuid[] not null,
  status       text not null check (status in ('pending', 'running', 'done', 'failed')),
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text
);
