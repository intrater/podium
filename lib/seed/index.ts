/**
 * Idempotent seed runner for the v1 schema.
 *
 * Writes the curated catalog (`config/podcasts.ts`), the team registry
 * (`config/teams.ts`), and the niners universe (`lib/universes/49ers.ts`)
 * into Supabase. Re-runs propagate config edits — every upsert updates on
 * conflict — so the database always reflects the in-process configs after
 * a successful run. Concurrent runs are race-safe because every conflict
 * key (`teams.id`, `universes.team_id`, `podcasts.particle_slug`) carries
 * a UNIQUE constraint that PostgreSQL serializes on.
 *
 * The seed is decoupled from `lib/supabase/admin.ts` on purpose. That
 * module carries a `server-only` marker for Next.js' build-time guard;
 * importing it from a plain Node script (the `scripts/seed-supabase.ts`
 * runner) would fail at module load. This module accepts an already-built
 * `SupabaseClient`, so callers — Next.js routes, the standalone runner,
 * and Vitest — supply whichever client fits their context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// Relative imports (with .ts extensions) so this module loads cleanly under
// Node's native TS support — used by `scripts/seed-supabase.ts`. Vitest and
// Next.js both still resolve these via tsconfig's bundler resolution.
import { podcasts } from "../../config/podcasts.ts";
import { teams } from "../../config/teams.ts";
import { niners } from "../universes/49ers.ts";

export interface SeedConfig {
  podiumUserId: string;
  /** Email used when creating the Auth user. Cosmetic in v1 stub auth. */
  podiumUserEmail: string;
}

export interface SeedResult {
  authUserCreated: boolean;
  teamsUpserted: number;
  universeUpserted: number;
  podcastsUpserted: number;
}

export async function runSeed(
  supabase: SupabaseClient,
  config: SeedConfig,
): Promise<SeedResult> {
  const result: SeedResult = {
    authUserCreated: false,
    teamsUpserted: 0,
    universeUpserted: 0,
    podcastsUpserted: 0,
  };

  // 1. Auth user (idempotent: getUserById, then createUser only if missing).
  //    A real lookup error (5xx, network) is distinct from "user not found"
  //    and must surface — silent fall-through to createUser would mask the
  //    root cause behind a misleading "auth.createUser failed: conflict".
  const adminAuth = supabase.auth.admin;
  const { data: existing, error: lookupErr } = await adminAuth.getUserById(config.podiumUserId);
  if (lookupErr) {
    const status = (lookupErr as { status?: number }).status;
    if (status !== 404) {
      throw new Error(`auth.getUserById failed: ${lookupErr.message}`);
    }
  }
  if (!existing?.user) {
    const { error } = await adminAuth.createUser({
      id: config.podiumUserId,
      email: config.podiumUserEmail,
      email_confirm: true,
    });
    if (error) throw new Error(`auth.createUser failed: ${error.message}`);
    result.authUserCreated = true;
  }

  // 2. Team rows. True upsert (not ignoreDuplicates) so palette/name/slug
  //    edits in config/teams.ts propagate on the next run.
  for (const team of teams) {
    const { error } = await supabase
      .from("teams")
      .upsert(
        {
          id: team.id,
          sport: team.sport,
          slug: team.slug,
          name: team.name,
          palette: team.palette,
        },
        { onConflict: "id" },
      );
    if (error) throw new Error(`teams upsert failed: ${error.message}`);
    result.teamsUpserted += 1;
  }

  // 3. Universe row. Migration 0008 added UNIQUE(team_id), so PostgreSQL
  //    serializes the conflict path and we can use a native upsert.
  const { data: universeRow, error: universeErr } = await supabase
    .from("universes")
    .upsert(
      {
        team_id: niners.teamId,
        entities: niners.entities,
        storylines: niners.storylines,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id" },
    )
    .select("id")
    .single();
  if (universeErr || !universeRow) {
    throw new Error(`universes upsert failed: ${universeErr?.message ?? "no row returned"}`);
  }
  const universeId = universeRow.id;
  result.universeUpserted = 1;

  // 4. Link teams.universe_id → universe. Always set explicitly so a
  //    misaligned link self-heals on the next run.
  const { error: linkErr } = await supabase
    .from("teams")
    .update({ universe_id: universeId })
    .eq("id", niners.teamId);
  if (linkErr) throw new Error(`teams.universe_id link failed: ${linkErr.message}`);

  // 5. Podcast rows. True upsert keyed on particle_slug — name/kind edits
  //    propagate, but a renamed slug creates a new row (the old slug
  //    becomes orphaned and gets caught by the no-orphan test).
  for (const podcast of podcasts) {
    const { error } = await supabase
      .from("podcasts")
      .upsert(
        {
          particle_slug: podcast.particleSlug,
          name: podcast.name,
          kind: podcast.kind,
          in_catalog: true,
        },
        { onConflict: "particle_slug" },
      );
    if (error) throw new Error(`podcasts upsert failed: ${error.message}`);
    result.podcastsUpserted += 1;
  }

  return result;
}
