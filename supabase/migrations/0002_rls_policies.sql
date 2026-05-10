-- Podium v1 — Row Level Security.
--
-- These policies key off auth.uid(). In v1 a stub JWT supplies that subject
-- (see lib/auth/stub-jwt.ts); in v3 a real Supabase auth session does. The
-- policies do not change between versions.
--
-- The non-negotiable property exercised by __tests__/lib/supabase/server.test.ts:
--   * a user's anon-key client never reads or writes another user's rows.
--
-- Service-role clients (lib/supabase/admin.ts) bypass RLS by design and are
-- responsible for explicit user_id scoping in their own SQL.

-- ─── Reference / catalog tables: read-by-authenticated, service-role write ───

alter table teams      enable row level security;
alter table universes  enable row level security;
alter table podcasts   enable row level security;
alter table episodes   enable row level security;
alter table segments   enable row level security;

create policy "read by authenticated" on teams      for select to authenticated using (true);
create policy "read by authenticated" on universes  for select to authenticated using (true);
create policy "read by authenticated" on podcasts   for select to authenticated using (true);
create policy "read by authenticated" on episodes   for select to authenticated using (true);
create policy "read by authenticated" on segments   for select to authenticated using (true);

-- ─── User-scoped tables: owner read/write only ───

alter table cards    enable row level security;
alter table feedback enable row level security;

create policy "owner_rw" on cards
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owner_rw" on feedback
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── Operational tables: read-by-authenticated (single-user v1; v3 may scope further) ───

alter table api_calls     enable row level security;
alter table system_alerts enable row level security;
alter table ingest_jobs   enable row level security;

create policy "read by authenticated" on api_calls     for select to authenticated using (true);
create policy "read by authenticated" on system_alerts for select to authenticated using (true);
create policy "read by authenticated" on ingest_jobs   for select to authenticated using (true);
