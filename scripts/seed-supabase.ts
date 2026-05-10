/**
 * Standalone seed runner.
 *
 * Run with: `npm run seed`
 *
 * Reads `.env.local` from the repo root, builds a service-role Supabase
 * client, and applies the universe + team + podcast catalog from `config/`
 * and `lib/universes/`. Idempotent — re-running produces zero new rows.
 *
 * The script does not import from `lib/supabase/admin.ts` because that
 * module carries a `server-only` marker that fails outside the Next.js
 * runtime. It builds its own service-role client from env values instead.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { createSeedParticleResolver } from "../lib/seed/particle-resolver.ts";
import { runSeed } from "../lib/seed/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "..", ".env.local");
loadDotEnv(envPath);

const url = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const podiumUserId = required("PODIUM_USER_ID");
const podiumUserEmail = process.env.PODIUM_USER_EMAIL ?? "podium-stub-user@example.test";

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const particle = process.env.PARTICLE_API_KEY
  ? createSeedParticleResolver(process.env.PARTICLE_API_KEY)
  : undefined;
if (!particle) {
  console.warn(
    "PARTICLE_API_KEY not set — skipping slug→id resolution. Re-run with the key set to populate particle_id and entity_id_map.",
  );
}

const result = await runSeed(supabase, { podiumUserId, podiumUserEmail, particle });

console.log("Seed complete.");
console.log(`  auth user:        ${result.authUserCreated ? "created" : "already existed"}`);
console.log(`  teams:            ${result.teamsUpserted} upserted`);
console.log(`  universe:         ${result.universeUpserted} upserted`);
console.log(`  podcasts:         ${result.podcastsUpserted} upserted`);
console.log(`  podcast ids:      ${result.podcastIdsResolved} resolved this run`);
console.log(`  entity ids:       ${result.entityIdsResolved} resolved this run`);

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Missing required env var: ${key}. Populate .env.local before running.`);
    process.exit(1);
  }
  return value;
}

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
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
