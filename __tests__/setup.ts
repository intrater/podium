/**
 * Vitest global setup.
 *
 * Loads .env.local so tests see the same Supabase credentials as `next dev`.
 * Server-only imports (like lib/auth/stub-jwt.ts) are tolerated in vitest's
 * Node environment by treating "server-only" as a no-op module.
 *
 * Also installs an afterEach hook that calls @testing-library/react's
 * cleanup() — RTL auto-cleanup only fires when `globals: true` is set in
 * vitest config, which we don't enable, so without this hook portal-
 * rendered DOM (Radix Sheet/Dialog) leaks between component tests.
 */

import fs from "node:fs";
import path from "node:path";

import { afterEach, vi } from "vitest";

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

vi.mock("server-only", () => ({}));
