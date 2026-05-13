-- Podium v1 — per-team ingestion cadence.
--
-- U6 of the cost-optimization plan: drop ingestion frequency in the
-- off-season so the daily worker doesn't keep paying transcript and
-- Claude costs through the months when the team isn't playing.
--
-- The cadence_days column is the canonical "how often does this team
-- need a digest" knob. v1 default is 1 (run daily) so existing single-
-- team behavior is preserved. The cron handler computes an effective
-- cadence from config/teams.ts (which encodes in-season months and
-- the off-season cadence per team) but the DB column is the manual
-- override surface — flip it to 1 to force daily even off-season, or
-- to 7 to deliberately throttle a noisy team. NULL is not allowed so
-- the default applies cleanly to legacy rows.
--
-- RLS posture: teams is `read by authenticated`, write via service-role.
-- The new column is operational metadata, not user-facing — no policy
-- change needed.

alter table teams
  add column if not exists cadence_days int not null default 1;

comment on column teams.cadence_days is
  'How many days between scheduled ingest runs. v1 default 1 = daily. config/teams.ts derives this from in-season vs off-season; manual override always wins.';
