/**
 * Next.js middleware.
 *
 * v1: pass-through. The stub-auth bridge mints a fresh JWT per server-side
 * Supabase call, so there's nothing to refresh between requests.
 *
 * v3: this file activates Supabase session refresh — pulls the session
 * cookie, refreshes if expiring, writes the updated cookie back on the
 * response. Wire it then via `@supabase/ssr`'s `updateSession` helper.
 */

import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
