-- Podium v2 — voices catalog + per-voice position history.
--
-- U3 of the v2 plan (docs/plans/2026-05-17-001-feat-podium-v2-editorial-
-- reframe-plan.md). Voice memory is the foundation of the take-level
-- novelty gate: when a moment surfaces, the gate compares the take to
-- the voice's prior positions on the same topic. New voice / new fact
-- / contrarian turn / position shift → surface; restate → suppress.
--
-- v1 ships SHOW-LEVEL voices (one voice = one podcast) per the speaker-
-- attribution probe finding 2026-05-17: Particle's segment.speaker_name
-- is sparsely populated on Tier-A shows, so host-level voice would be
-- built on unreliable signal. The schema supports both `kind = 'host'`
-- and `kind = 'show'` so we can revisit later without migration.
--
-- voice_positions is append-only — the gate compares against history
-- and writes a new row when a position is detected. No UPDATE / DELETE
-- policies; revisions are new rows. Idempotency: UNIQUE on
-- (voice_id, team_id, topic_key, segment_id) so a re-extract of the
-- same segment doesn't duplicate the position.
--
-- RLS posture (matches existing catalog tables):
--   voices: read by authenticated; service-role writes
--   voice_positions: read by authenticated (positions are facts about
--     what was said publicly on a podcast — not user data); service-
--     role writes; no UPDATE / DELETE.

create table if not exists voices (
  id text primary key,
  kind text not null check (kind in ('host', 'show')),
  display_name text not null,
  tier text not null check (tier in ('A', 'B', 'C')),
  podcast_id uuid references podcasts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists voice_positions (
  id uuid primary key default gen_random_uuid(),
  voice_id text not null references voices(id) on delete cascade,
  team_id text not null references teams(id) on delete cascade,
  topic_key text not null,
  position_summary text not null,
  evidence_quote text,
  segment_id uuid references segments(id) on delete cascade,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

-- Idempotency: re-extracting a segment must not duplicate its position.
create unique index if not exists voice_positions_segment_uniq
  on voice_positions (voice_id, team_id, topic_key, segment_id);

-- The novelty gate's hot-path query: "what are voice X's recent positions
-- on topic Y for team Z, newest first." Composite index covers it.
create index if not exists voice_positions_lookup_idx
  on voice_positions (voice_id, team_id, topic_key, created_at desc);

alter table voices enable row level security;
alter table voice_positions enable row level security;

create policy "read by authenticated" on voices
  for select to authenticated using (true);

create policy "read by authenticated" on voice_positions
  for select to authenticated using (true);

-- No INSERT / UPDATE / DELETE policies for either table — service-role
-- writes only, matching the existing operational-table posture from
-- migration 0010.

comment on table voices is
  'Editorial voices. v1 ships show-level only (one row per Tier-A podcast). Host-level voices land later when speaker attribution is reliable.';

comment on column voices.kind is
  '"host" = individual person (Mina, Simmons). "show" = whole podcast as one voice. v1 = show only.';

comment on table voice_positions is
  'Append-only history of what each voice has argued on each topic per team. Source of truth for the novelty gate''s position-shift detection.';

comment on column voice_positions.topic_key is
  'Stable identifier for the position''s topic (e.g., "purdy-contract", "wr-room"). Slug derived deterministically at write time in lib/voice-memory/extract-topic-key.ts (U4).';

comment on column voice_positions.evidence_quote is
  'Verbatim transcript quote that captures the position. Nullable for positions inferred without a single sharp quote.';
