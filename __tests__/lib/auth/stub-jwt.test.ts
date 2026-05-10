import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

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
});
