-- Podium v2 — theme cards (Stage 2 of the pipeline).
--
-- U5 of the v2 plan (docs/plans/2026-05-17-001-feat-podium-v2-editorial-
-- reframe-plan.md). After per-episode moment extraction (Stage 1) lands
-- segments in DB, Stage 2 reads the 24h moment window and asks Claude
-- to cluster moments into themes — "8 podcasts are talking about the
-- schedule release this week" is the unit. Each theme persists as a
-- row here with its member segment + voice ids, the news_echo flag
-- (KD5 manufactured-aggregation detection), and a stable signature
-- for cross-day dedupe.
--
-- User-scoped because the surfacing is per-user: when v2 supports
-- multi-team users, each user's feed is a different mix of teams,
-- and the theme set per user is the union of themes per followed team.
-- The clustering math itself is team-scoped (one cluster pass per
-- team per day), but the surfaced theme rows are user-scoped to mirror
-- `cards` and reuse the existing RLS posture.
--
-- theme_signature is a deterministic content hash (sorted member
-- segment ids + dominant entity) computed in lib/themes/cluster-
-- moments.ts. Same theme detected on a subsequent day produces an
-- identical signature, which the novelty gate (U6) uses to decide
-- whether to re-surface or suppress.
--
-- UNIQUE constraint: (user_id, team_id, theme_signature,
-- date(surfaced_at)) — same theme can appear once per day at most.
-- Cross-day recurrence produces a new row with the same signature on
-- a different day, which is exactly how the novelty gate detects
-- "this is week 3 of the same theme."
--
-- prompt_version mirrors segments.prompt_version (migration 0014):
-- bumping it triggers re-clustering on the next run without manual
-- cleanup.
--
-- RLS posture: owner-only read (matches `cards`); service-role
-- write.

create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  theme_signature text not null,
  label text not null,
  member_segment_ids uuid[] not null default '{}',
  member_voice_ids text[] not null default '{}',
  surfacing_entities text[] not null default '{}',
  news_echo boolean not null default false,
  prompt_version text not null,
  surfaced_at timestamptz not null default now()
);

-- One theme per day per signature per user — recurring themes produce
-- a new row each day with the same signature on a different
-- surfaced_at date. Postgres requires IMMUTABLE expressions in
-- functional indexes; `surfaced_at::date` is not (session-timezone
-- dependent) but `(surfaced_at at time zone 'UTC')::date` is.
create unique index if not exists themes_signature_per_day_uniq
  on themes (
    user_id,
    team_id,
    theme_signature,
    ((surfaced_at at time zone 'UTC')::date)
  );

-- Hot-path query: "themes for user X on team Y, surfaced in window".
create index if not exists themes_surfaced_idx
  on themes (user_id, team_id, surfaced_at desc);

-- Cross-day novelty lookup: "has this signature appeared in the last N
-- days?" The novelty gate (U6) hits this query per cluster candidate.
create index if not exists themes_signature_recency_idx
  on themes (theme_signature, surfaced_at desc);

alter table themes enable row level security;

create policy "themes_owner_select"
  on themes for select to authenticated
  using (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies — service-role writes only,
-- matching the cards table posture.

comment on table themes is
  'Theme cards produced by Stage 2 clustering. One row per surfaced theme per user per day. Cross-day recurrence reuses theme_signature so the novelty gate can detect repeating discussions.';

comment on column themes.theme_signature is
  'Deterministic content hash (sorted member segment ids + dominant entity). Stable across re-runs and re-clusters; identical hash on a different day means "this is the same conversation continuing."';

comment on column themes.member_segment_ids is
  'Segments contributing to this theme. Card display fetches summaries + quotes by joining against segments.id.';

comment on column themes.member_voice_ids is
  'Distinct voice_ids represented in the cluster. Used to compute "8 podcasts" badge and to attribute pull quotes by voice. Includes Tier B/C voice rows when present.';

comment on column themes.news_echo is
  'KD5 manufactured-aggregation tag. True when the cluster looks like multiple shows echoing one upstream news article (shared match.source on the same entity + published_at proximity + verbatim phrase overlap) rather than independent engagement.';
