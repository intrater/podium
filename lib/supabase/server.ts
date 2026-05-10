/**
 * Server-side Supabase client bound to the v1 stub-auth bridge.
 *
 * Each call returns a fresh client with the anon key plus a stub JWT whose
 * `sub` is the configured `PODIUM_USER_ID`. RLS evaluates `auth.uid()`
 * against that JWT, so policies fire just as they will under real auth in
 * v3 — the smoke tests in __tests__/lib/supabase/server.test.ts exercise
 * this path.
 *
 * The function takes **no parameters by design.** Accepting a `userId` here
 * would let any route handler that forwards user input ("?as=<uuid>")
 * impersonate other accounts the moment v3 multi-user auth lands. Tests
 * that need to simulate a second user mint a stub JWT directly via
 * `mintStubJwt(userId)`; that call is gated to non-production NODE_ENV.
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

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const token = await mintStubJwt();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
