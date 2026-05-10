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
const REFRESH_BUFFER_SECONDS = 5 * 60;

const cache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Mint (or reuse) a JWT whose `sub` claim is the configured user.
 *
 * Tokens are cached per-user in-process for ~55 minutes. JWTs are stateless,
 * so caching across requests is safe; misses cost a single HMAC-SHA256 sign.
 * The cache is keyed by user id so impersonation in tests does not poison
 * the production token.
 *
 * **Production guard.** Passing a `userId` other than the configured
 * `PODIUM_USER_ID` is impersonation. That capability is fine in tests — the
 * RLS smoke suite needs it — but in production it would be a forge-anyone
 * primitive. Throw at runtime if production code reaches for it.
 */
export async function mintStubJwt(userId: string = env.PODIUM_USER_ID): Promise<string> {
  if (userId !== env.PODIUM_USER_ID && process.env.NODE_ENV === "production") {
    throw new Error(
      "mintStubJwt: refusing to impersonate a non-default user in production",
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const cached = cache.get(userId);
  if (cached && cached.expiresAt - now > REFRESH_BUFFER_SECONDS) {
    return cached.token;
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

  cache.set(userId, { token, expiresAt });
  return token;
}
