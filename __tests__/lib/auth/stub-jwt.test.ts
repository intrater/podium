import { jwtVerify } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mintStubJwt } from "@/lib/auth/stub-jwt";

describe("mintStubJwt", () => {
  it("mints a JWT whose sub matches PODIUM_USER_ID", async () => {
    const token = await mintStubJwt();
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);

    expect(payload.sub).toBe(process.env.PODIUM_USER_ID);
    expect(payload.role).toBe("authenticated");
    expect(payload.aud).toBe("authenticated");
  });

  it("mints a distinct token for a different user", async () => {
    const otherId = "00000000-0000-4000-8000-000000000999";
    const token = await mintStubJwt(otherId);
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const { payload } = await jwtVerify(token, secret);

    expect(payload.sub).toBe(otherId);
  });

  it("returns user-specific tokens across A → B → A alternation", async () => {
    const userA = process.env.PODIUM_USER_ID!;
    const userB = "00000000-0000-4000-8000-000000000777";

    const tokenA1 = await mintStubJwt(userA);
    const tokenB = await mintStubJwt(userB);
    const tokenA2 = await mintStubJwt(userA);

    expect(tokenA1).not.toBe(tokenB);
    expect(tokenA2).not.toBe(tokenB);
    expect(tokenA1).toBe(tokenA2);

    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const { payload: payloadA } = await jwtVerify(tokenA2, secret);
    const { payload: payloadB } = await jwtVerify(tokenB, secret);
    expect(payloadA.sub).toBe(userA);
    expect(payloadB.sub).toBe(userB);
  });

  describe("production guard against impersonation", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("throws if a non-default userId is requested in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const otherId = "00000000-0000-4000-8000-000000000888";
      await expect(mintStubJwt(otherId)).rejects.toThrow(/impersonate/i);
    });
  });
});
