/**
 * Browser-side Supabase client.
 *
 * v1 reality: the digest renders entirely from server components, and any
 * mutation a user kicks off (feedback verdicts, hide-card toggles) goes
 * through a `/api/*` route handler that uses `createSupabaseServerClient`.
 * This browser client therefore does no direct database I/O in v1 — it
 * exists for shape consistency with v3, when real Supabase auth lands and
 * client-side reads become valuable for realtime subscriptions and
 * optimistic UI.
 *
 * If a v1 caller imports this for a direct DB call, it will succeed only
 * for tables whose RLS policies allow anonymous access (none, by design).
 * That's the intended outcome — push the caller toward an /api route.
 */

import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/lib/env";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
