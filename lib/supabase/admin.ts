/**
 * Service-role Supabase client for trusted server contexts.
 *
 * **Service role bypasses RLS.** This client can read and write any row in
 * the database. Only call sites that legitimately need that authority — the
 * daily ingest worker, system_alerts writes, api_calls cost-tracking — may
 * import from here. Every query made through this client must include an
 * explicit user_id filter when it touches a user-scoped table; the RLS
 * policies are not there to catch mistakes.
 *
 * **Never import this from a client component.** The service role key is
 * a forge-everything credential.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
