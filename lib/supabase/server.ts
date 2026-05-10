/**
 * Server-side Supabase client bound to the v1 stub-auth bridge.
 *
 * Each call returns a fresh client with the anon key plus a stub JWT in the
 * Authorization header. RLS evaluates `auth.uid()` against that JWT's `sub`,
 * so policies fire just as they will under real auth in v3 — the smoke
 * tests in __tests__/lib/supabase/server.test.ts exercise this path.
 *
 * In v3 this file swaps to `createServerClient` from `@supabase/ssr` and
 * reads the real session cookie via `next/headers`. The call sites do not
 * change; the contract is "give me a Supabase client scoped to the current
 * user."
 *
 * **Server-only.** Importing from a client component fails at build time
 * because `lib/auth/stub-jwt.ts` carries a `server-only` marker.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mintStubJwt } from "@/lib/auth/stub-jwt";
import { env } from "@/lib/env";

export async function createSupabaseServerClient(userId?: string): Promise<SupabaseClient> {
  const token = await mintStubJwt(userId);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
