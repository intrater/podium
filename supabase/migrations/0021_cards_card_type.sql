-- Podium v2 — extend cards for theme + notable-take card types.
--
-- U7 of the v2 plan. v1 cards were per-episode summaries; v2 adds
-- theme cards (cross-source aggregation) and notable-take cards
-- (single Tier-A voice with a substantive take). All three coexist
-- in the same `cards` table so:
--   - The existing user-scoped RLS posture covers all card types.
--   - Feedback (hidden_card_id) generalizes naturally.
--   - The home-page load path can dispatch by `card_type` without a
--     UNION query across three tables.
--
-- All new columns are nullable for back-compat: existing v1 episode
-- card rows keep `card_type` = NULL (interpreted as 'episode' by the
-- application) and the new fields stay empty. v2 writers always set
-- `card_type` explicitly.
--
-- Each card_type uses a different combination of FKs:
--   episode      → episode_id set, theme_id and notable_take_voice_id
--                  NULL. Legacy v1 path.
--   theme        → theme_id set, episode_id and
--                  notable_take_voice_id NULL.
--   notable_take → notable_take_voice_id set, episode_id refers to
--                  the source episode (so audio playback continues
--                  to work), theme_id NULL.

alter table cards
  add column if not exists card_type text
    check (card_type in ('episode', 'theme', 'notable_take'));

alter table cards
  add column if not exists theme_id uuid references themes(id) on delete cascade;

alter table cards
  add column if not exists notable_take_voice_id text references voices(id) on delete cascade;

alter table cards
  add column if not exists prompt_version text;

alter table cards
  add column if not exists card_title text;

-- Structured body produced by the v2 card-writer prompts. Shape is
-- card-type-dependent and validated in TypeScript at write time.
-- See lib/digest/types.ts for the discriminated-union body shapes.
alter table cards
  add column if not exists card_body jsonb;

-- Backfill v1 rows so the discriminator is uniformly populated. Any
-- existing row without a card_type is an episode card by construction
-- (no v2 card writer has run yet against this DB).
update cards set card_type = 'episode' where card_type is null;

-- Theme cards span multiple episodes — episode_id can no longer be
-- required. Notable-take cards reference a single source episode so
-- they keep it populated, but theme cards leave it null. The v1
-- episode-card writer continues to set it as before.
alter table cards
  alter column episode_id drop not null;

-- The legacy uniqueness constraint unique(user_id, team_id, episode_id)
-- assumed one card per episode. v2 needs many cards per episode (one
-- episode can contribute to multiple themes; one episode + 1 notable
-- take in the same run). Replace with a partial unique that ONLY
-- applies to episode cards (the original v1 semantic).
alter table cards drop constraint if exists cards_user_id_team_id_episode_id_key;

create unique index if not exists cards_episode_card_uniq
  on cards (user_id, team_id, episode_id)
  where card_type = 'episode';

-- Theme cards: at most one row per (user, team, theme, day). The
-- per-day match uses the same UTC-cast pattern as the themes table
-- (functional indexes need IMMUTABLE expressions).
create unique index if not exists cards_theme_card_per_day_uniq
  on cards (user_id, team_id, theme_id, ((surfaced_at at time zone 'UTC')::date))
  where card_type = 'theme';

-- Notable-take cards: at most one row per (user, team, voice, source
-- segment) — i.e., a re-extract of the same segment is a no-op.
create unique index if not exists cards_notable_take_card_uniq
  on cards (user_id, team_id, notable_take_voice_id, episode_id)
  where card_type = 'notable_take';

-- Indexes for the typed-feed query paths the v8 surfacing layer
-- depends on.
create index if not exists cards_user_team_type_surfaced_idx
  on cards (user_id, team_id, card_type, surfaced_at desc);

create index if not exists cards_theme_id_idx
  on cards (theme_id) where theme_id is not null;

create index if not exists cards_notable_take_voice_id_idx
  on cards (notable_take_voice_id) where notable_take_voice_id is not null;

comment on column cards.card_type is
  'Discriminator for the home-feed loader. v1 = "episode". v2 adds "theme" and "notable_take". Legacy NULL rows are treated as episode by the loader.';

comment on column cards.card_body is
  'Structured body produced by v2 card writers. Schema varies by card_type; see lib/digest/types.ts. Legacy episode cards use episode_summary text instead and leave this NULL.';

comment on column cards.theme_id is
  'For card_type = theme. Joins to themes for member moments + voice attribution.';

comment on column cards.notable_take_voice_id is
  'For card_type = notable_take. Identifies the single voice that produced the take.';
