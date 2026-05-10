/**
 * Stub JWT minting for v1 single-user mode.
 *
 * Supabase RLS policies key off `auth.uid()`, which the database derives
 * from the `sub` claim of the bearer JWT supplied with each request. In v3
 * that JWT comes from a real Supabase auth session. In v1 we mint one here
 * with `sub` = PODIUM_USER_ID and the same `SUPABASE_JWT_SECRET` that the
 * Supabase API gateway uses to verify legitimate tokens. To Postgres, the
 * stub JWT is indistinguishable from a real session — RLS policies fire,
 * isolation works, the smoke tests in __tests__/lib/supabase/server.test.ts
 * exercise the real policy machinery.
 *
 * When v3 lands, delete this file and replace the call sites in
 * lib/supabase/{client,server}.ts with the Supabase auth helpers. The
 * RLS policies do not need to change.
 *
 * **Server-only.** Importing this from a client component must fail at
 * build time — `SUPABASE_JWT_SECRET` is a secret, never bundled.
 */

import "server-only";

import { SignJWT } from "jose";

import { env } from "@/lib/env";

const ONE_HOUR_SECONDS = 60 * 60;

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Mint (or reuse) a JWT whose `sub` claim is the configured PODIUM_USER_ID.
 *
 * The token is cached in-process for ~55 minutes. JWTs are stateless — there
 * is no server to invalidate them — so caching across requests is safe.
 * Cache misses are cheap (a single HMAC-SHA256 sign), so this caching is a
 * convenience, not a hot-path optimization.
 */
export async function mintStubJwt(userId: string = env.PODIUM_USER_ID): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (
    cachedToken &&
    cachedToken.expiresAt - now > 5 * 60 &&
    decodeSubject(cachedToken.token) === userId
  ) {
    return cachedToken.token;
  }

  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  const expiresAt = now + ONE_HOUR_SECONDS;

  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .sign(secret);

  cachedToken = { token, expiresAt };
  return token;
}

/**
 * Helper for tests: read the `sub` claim back out of a minted token without
 * verifying the signature. Production code never calls this — it's a sanity
 * check that the cached token still belongs to the requested user.
 */
function decodeSubject(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
