-- Podium v1 — per-team cost attribution on `api_calls`.
--
-- Adds a nullable `team_id` column so the cost-optimization plan's CE1
-- success metric (per-team-per-day cost ≤ $0.20, 30-day rolling average)
-- can actually be measured rather than estimated from total spend.
--
-- Nullable, no FK to keep the column lightweight and avoid cascade
-- entanglement with `teams`. Historical rows stay null; inspect-costs
-- treats null as "unknown team." Server-side writers (the tracked-call
-- wrapper in lib/particle/tracked-call.ts and lib/anthropic/client.ts)
-- populate the column on every new insert.
--
-- RLS posture unchanged. `api_calls` has `read by authenticated` only
-- (write goes through service-role); the new column is non-sensitive
-- operational metadata.

alter table api_calls
  add column if not exists team_id text;
