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
import { tierForSlug } from "../../config/tiers.ts";
import { assertTierConsistency, voices } from "../../config/voices.ts";
import { teams } from "../../config/teams.ts";
import { niners } from "../universes/49ers.ts";
import {
  SeedResolverHttpError,
  type SeedParticleResolver,
} from "./particle-resolver.ts";

export interface SeedConfig {
  podiumUserId: string;
  /** Email used when creating the Auth user. Cosmetic in v1 stub auth. */
  podiumUserEmail: string;
  /**
   * Optional Particle resolver for slug→id lookup at seed time. When
   * present, podcast `particle_id` and universe `entity_id_map` are
   * populated via live API calls. When absent, only the slug-keyed data
   * is seeded — useful for tests that don't need ID resolution.
   *
   * The resolver interface is intentionally narrower than the full
   * `lib/particle/client.ts` ParticleClient — the seed only needs
   * slug→id GETs and runs outside the Next.js server-only graph.
   */
  particle?: SeedParticleResolver;
}

export interface SeedResult {
  authUserCreated: boolean;
  teamsUpserted: number;
  universeUpserted: number;
  podcastsUpserted: number;
  podcastIdsResolved: number;
  entityIdsResolved: number;
  voicesUpserted: number;
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
    podcastIdsResolved: 0,
    entityIdsResolved: 0,
    voicesUpserted: 0,
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
          tier: tierForSlug(podcast.particleSlug),
          in_catalog: true,
        },
        { onConflict: "particle_slug" },
      );
    if (error) throw new Error(`podcasts upsert failed: ${error.message}`);
    result.podcastsUpserted += 1;
  }

  // 6. Voices catalog. v2 editorial voices — currently show-level only,
  //    one row per Tier-A podcast. Upserts keyed on voice id; tier
  //    drift between config/voices and config/tiers fails loudly.
  assertTierConsistency();
  for (const voice of voices) {
    // Look up the local podcast row by particle_slug so we can FK.
    const { data: podcastRow, error: podcastErr } = await supabase
      .from("podcasts")
      .select("id")
      .eq("particle_slug", voice.podcastSlug)
      .maybeSingle();
    if (podcastErr) {
      throw new Error(
        `voices: lookup of podcast ${voice.podcastSlug} failed: ${podcastErr.message}`,
      );
    }
    if (!podcastRow) {
      throw new Error(
        `voices: voice ${voice.id} points at podcast ${voice.podcastSlug} which is not in the catalog`,
      );
    }
    const { error } = await supabase.from("voices").upsert(
      {
        id: voice.id,
        kind: voice.kind,
        display_name: voice.displayName,
        tier: voice.tier,
        podcast_id: podcastRow.id,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(`voices upsert failed: ${error.message}`);
    result.voicesUpserted += 1;
  }

  // 7. Resolve slug→id when a Particle client is supplied. Only fills
  //    `podcasts.particle_id` rows that are still null — re-runs against
  //    a fully-resolved table no-op. Same for `universes.entity_id_map`.
  if (config.particle) {
    result.podcastIdsResolved = await resolvePodcastIds(supabase, config.particle);
    result.entityIdsResolved = await resolveEntityIds(supabase, config.particle, universeId);
  }

  return result;
}

async function resolvePodcastIds(
  supabase: SupabaseClient,
  particle: SeedParticleResolver,
): Promise<number> {
  // Resolve rows missing particle_id OR image_url. Once a podcast's
  // image_url is added in a later seed run, the row gets backfilled
  // with one extra GET; subsequent runs no-op.
  const { data: rows, error } = await supabase
    .from("podcasts")
    .select("particle_slug, name, particle_id, image_url")
    .or("particle_id.is.null,image_url.is.null");
  if (error) throw new Error(`podcasts ID-resolution lookup failed: ${error.message}`);
  if (!rows || rows.length === 0) return 0;

  let resolved = 0;
  for (const row of rows) {
    const podcast = await lookupPodcast(particle, row.particle_slug as string);
    if (!podcast) {
      console.warn(
        `seed: could not resolve podcast slug "${row.particle_slug}" via Particle; leaving fields null`,
      );
      continue;
    }
    const update: Record<string, string | null> = {};
    if (!row.particle_id) update.particle_id = podcast.id;
    if (!row.image_url && podcast.image_url) update.image_url = podcast.image_url;
    if (Object.keys(update).length === 0) continue;

    const { error: updErr } = await supabase
      .from("podcasts")
      .update(update)
      .eq("particle_slug", row.particle_slug);
    if (updErr) {
      throw new Error(
        `failed to persist resolution for ${row.particle_slug}: ${updErr.message}`,
      );
    }
    resolved += 1;
  }
  return resolved;
}

async function lookupPodcast(
  particle: SeedParticleResolver,
  slug: string,
): Promise<{ id: string; image_url?: string } | undefined> {
  try {
    const podcast = await particle.getPodcastBySlug(slug);
    return { id: podcast.id, image_url: podcast.image_url };
  } catch (err) {
    // 404 is "not found", every other status is genuine failure that
    // shouldn't masquerade as an unresolved slug.
    if (err instanceof SeedResolverHttpError && err.status === 404) return undefined;
    throw err;
  }
}

async function resolveEntityIds(
  supabase: SupabaseClient,
  particle: SeedParticleResolver,
  universeId: string,
): Promise<number> {
  const { data: row, error } = await supabase
    .from("universes")
    .select("entities, entity_id_map")
    .eq("id", universeId)
    .single();
  if (error) throw new Error(`universe ID-resolution lookup failed: ${error.message}`);

  const slugs = (row.entities as string[]) ?? [];
  const existingMap = (row.entity_id_map as Record<string, string>) ?? {};

  const updatedMap = { ...existingMap };
  let resolved = 0;
  for (const slug of slugs) {
    if (updatedMap[slug]) continue;
    const id = await lookupEntityId(particle, slug);
    if (!id) {
      console.warn(`seed: could not resolve entity slug "${slug}" via Particle; leaving unmapped`);
      continue;
    }
    updatedMap[slug] = id;
    resolved += 1;
  }

  if (resolved > 0) {
    const { error: updErr } = await supabase
      .from("universes")
      .update({ entity_id_map: updatedMap })
      .eq("id", universeId);
    if (updErr) {
      throw new Error(`failed to persist entity_id_map: ${updErr.message}`);
    }
  }
  return resolved;
}

async function lookupEntityId(
  particle: SeedParticleResolver,
  slug: string,
): Promise<string | undefined> {
  // Particle's `/v1/entities/{id}` resolves slug → record directly,
  // sidestepping the prior free-text query variants needed to invert
  // hyphenated names like "yetur-gross-matos".
  try {
    const entity = await particle.getEntityBySlug(slug);
    return entity.id;
  } catch (err) {
    if (err instanceof SeedResolverHttpError && err.status === 404) return undefined;
    throw err;
  }
}
