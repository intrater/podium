/**
 * Typed, validated environment variables for Podium.
 *
 * Import `env` from this module instead of reading `process.env` directly.
 * The `@t3-oss/env-nextjs` wrapper enforces a server/client split: any
 * server-only variable referenced from a client component fails the build,
 * not silently at runtime.
 *
 * On boot, every required variable is validated against its zod schema. A
 * missing or malformed value fails fast at module load with a descriptive
 * error pointing at the variable name — not a confusing runtime error 30
 * minutes later.
 *
 * To add a new variable:
 *   1. Add it to .env.local.example (with a comment explaining the source)
 *   2. Add it to the `server` or `client` block below with a zod schema
 *   3. Wire it into `runtimeEnv` so Next.js bundles it correctly
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-only variables. Referencing any of these from a client
   * component will cause `next build` to fail with a clear error.
   */
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWT_SECRET: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    PARTICLE_API_KEY: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    PODIUM_USER_ID: z.string().uuid(),
    INGEST_DEV_MODE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    INGEST_FORCE_REPROCESS: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    /**
     * Selects the candidate-episode discovery path the daily pipeline
     * uses. "mentions" (default) calls /v1/podcasts/mentions per entity
     * (premium tier). "list-episodes" calls /v1/podcasts/episodes per
     * entity (standard tier, ~10× cheaper) and lets Claude find moments
     * from the full transcript instead of mention windows. A/B comparison
     * is operator-driven across two manual runs; see
     * docs/plans/2026-05-14-001-refactor-particle-api-optimizations-plan.md.
     */
    INGEST_DISCOVERY_MODE: z.enum(["mentions", "list-episodes"]).default("mentions"),
  },

  /**
   * Client variables (NEXT_PUBLIC_*). Safe to read from a browser bundle.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    /**
     * v2 editorial-reframe feature flag. When "on", the home-page
     * feed includes theme + notable-take cards alongside episode
     * cards. Default "off" so production users see only the v1
     * episode-card surface until v2 is dogfooded clean. Flip via
     * .env.local + Vercel env to roll v2 out.
     */
    NEXT_PUBLIC_PODIUM_V2_FEED: z
      .enum(["on", "off"])
      .default("off"),
  },

  /**
   * `runtimeEnv` is required when using Next.js — it tells the bundler
   * which variables to inline. Mirror every variable from `server` and
   * `client` above.
   */
  runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_PODIUM_V2_FEED: process.env.NEXT_PUBLIC_PODIUM_V2_FEED,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    PARTICLE_API_KEY: process.env.PARTICLE_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    PODIUM_USER_ID: process.env.PODIUM_USER_ID,
    INGEST_DEV_MODE: process.env.INGEST_DEV_MODE,
    INGEST_FORCE_REPROCESS: process.env.INGEST_FORCE_REPROCESS,
    INGEST_DISCOVERY_MODE: process.env.INGEST_DISCOVERY_MODE,
  },

  /**
   * Skip validation during `next lint` and similar tooling. Useful when
   * a developer wants to lint without populating the full env.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as missing values. Some hosts (and editors)
   * inject `KEY=""` for unset env vars; this catches the gotcha.
   */
  emptyStringAsUndefined: true,
});
