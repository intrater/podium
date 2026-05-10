-- Podium v1 — pg_cron stub.
--
-- U5 only enables the extension and reserves the schedule slot. The actual
-- cron job that triggers the daily ingest worker is registered in U8 once
-- the worker endpoint exists. This migration is intentionally minimal so
-- the staging Supabase project has the extension primed without a dangling
-- empty schedule.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;
