-- Podium v2 — per-team running brain.
--
-- U2 of the v2 editorial reframe (see docs/plans/2026-05-17-001-feat-
-- podium-v2-editorial-reframe-plan.md). Each row is the running model
-- of a team: roster shape, season storyline, active narrative arcs,
-- fan psychology, and a rolling list of recent themes. The brain is
-- inlined as the cacheable system prefix on every v2 Claude call
-- (theme clustering, novelty detection, card writing) — when serialized
-- to ≥4,096 tokens it clears Haiku 4.5's prompt-cache minimum (see
-- docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md) AND
-- grounds Podium's voice in one move.
--
-- v1 ships with a hand-curated seed; U10 of the plan adds a weekly
-- auto-update job that summarizes the past week and refreshes the
-- brain content. The DB column is the canonical source — manual writes
-- always win.
--
-- prompt_version mirrors the segments.prompt_version pattern from
-- migration 0014: bumping the version triggers downstream re-processing
-- without a manual cleanup.
--
-- RLS posture: catalog table — `read by authenticated`, write via
-- service-role only. Matches teams / universes / podcasts.

create table if not exists team_brain (
  team_id text primary key references teams(id) on delete cascade,
  payload jsonb not null,
  prompt_version text not null,
  updated_at timestamptz not null default now()
);

alter table team_brain enable row level security;

create policy "read by authenticated" on team_brain
  for select to authenticated using (true);

comment on table team_brain is
  'Per-team running model: roster, storyline, narrative arcs, fan psychology, recent themes. Serialized as the cacheable system prefix on every v2 Claude call. Updated weekly by the brain-update cron + manual edits.';

comment on column team_brain.payload is
  'JSON shape defined by TeamBrain type in lib/team-brain/types.ts. Versioned via prompt_version so prompt iterations auto-trigger re-processing.';

comment on column team_brain.prompt_version is
  'Bump to trigger downstream re-processing of cards that depend on this brain prefix. Mirrors segments.prompt_version (migration 0014).';
