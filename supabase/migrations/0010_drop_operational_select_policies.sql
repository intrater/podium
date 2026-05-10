-- Podium v1 — drop SELECT-only RLS policies on operational tables.
--
-- The original 0002_rls_policies.sql granted `read by authenticated` SELECT
-- access on `api_calls`, `system_alerts`, and `ingest_jobs`. That was
-- harmless in v1 single-user mode but leaks operational metadata at v3
-- multi-user time — billing rows, error logs, and ingestion progress have
-- no per-user scoping yet. The plan committed to "policies do not change
-- between versions"; the consistent way to honor that is to make these
-- tables service-role-only now.
--
-- After this migration, the only path that reads or writes these tables
-- is the service-role admin client (`lib/supabase/admin.ts`). The daily
-- worker (U8) uses the admin client for ingest_jobs / system_alerts;
-- cost telemetry already routes through the admin path via
-- `lib/anthropic/client.ts` and `lib/particle/tracked-call.ts`.
--
-- Resolves U5 review residual #3.

drop policy if exists "read by authenticated" on api_calls;
drop policy if exists "read by authenticated" on system_alerts;
drop policy if exists "read by authenticated" on ingest_jobs;
