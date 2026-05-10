-- Podium v1 — drop residual auth.users triggers from the prior schema.
--
-- The previous schema installed a `handle_new_user` trigger on
-- `auth.users` that copied each signup row into `public.user_profiles`.
-- That table is now gone (dropped in 0000_reset), so the trigger blocks
-- every `auth.users` insert with a foreign-table error — manifested as
-- "Database error creating new user" from Supabase Auth admin APIs.
--
-- Drop those leftovers defensively. IF EXISTS makes this a no-op against
-- a fresh Supabase project.

drop trigger if exists on_auth_user_created  on auth.users;
drop trigger if exists on_auth_user_updated  on auth.users;
drop trigger if exists on_auth_user_deleted  on auth.users;
drop function if exists public.handle_new_user()    cascade;
drop function if exists public.handle_user_update() cascade;
drop function if exists public.handle_user_delete() cascade;
