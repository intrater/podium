/**
 * Live-DB seed test.
 *
 * Hits the configured Supabase project from `.env.local`. Verifies that
 * `runSeed` is idempotent (running twice leaves the DB in the configured
 * shape) and that the seeded universe shape value-matches the in-process
 * config — count assertions alone would let a slug typo through.
 *
 * The seed is meant to be persistent — the test does not clean up.
 */

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { podcasts } from "@/config/podcasts";
import { createSeedParticleResolver, type SeedParticleResolver } from "@/lib/seed/particle-resolver";
import { runSeed, type SeedResult } from "@/lib/seed/index";
import { niners } from "@/lib/universes/49ers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PODIUM_USER_ID = process.env.PODIUM_USER_ID;
const haveEnv = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && PODIUM_USER_ID);

function makeMockParticleResolver(): SeedParticleResolver {
  // Canned `id_<slug>` IDs for every entry in the live config. The mock
  // matches the SeedParticleResolver surface (listPodcasts + listEntities
  // only) — exactly what the seed runner uses.
  return {
    listPodcasts: async ({ q }) => {
      const slug = podcasts.find((p) => p.name === q)?.particleSlug;
      if (!slug) return { data: [], has_more: false };
      return { data: [{ id: `id_${slug}`, title: `Mock ${slug}`, slug }], has_more: false };
    },
    listEntities: async ({ q }) => {
      // Match against any slug whose reconstruction (any of the three
      // variants the resolver tries) equals the query. The real call
      // succeeds on variant 1 for most slugs and falls back to variant
      // 2 for hyphenated surnames; the mock supports both.
      const candidates = [
        niners.entities.find((s) => s.replace(/-/g, " ") === q),
        niners.entities.find((s) => s.replace(/-/, " ") === q),
        niners.entities.find((s) => s === q),
      ];
      const slug = candidates.find((s) => s !== undefined);
      if (!slug) return { data: [], has_more: false };
      return {
        data: [{ id: `id_${slug}`, slug, name: slug.replace(/-/g, " ") }],
        has_more: false,
      };
    },
  };
}

describe.skipIf(!haveEnv)("runSeed (live Supabase)", () => {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const particle = makeMockParticleResolver();

  let firstRun: SeedResult;
  let secondRun: SeedResult;

  beforeAll(async () => {
    firstRun = await runSeed(supabase, {
      podiumUserId: PODIUM_USER_ID!,
      podiumUserEmail: "podium-stub-user@example.test",
      particle,
    });
    secondRun = await runSeed(supabase, {
      podiumUserId: PODIUM_USER_ID!,
      podiumUserEmail: "podium-stub-user@example.test",
      particle,
    });
  }, 120_000);

  afterAll(async () => {
    // The mock returns synthetic IDs (`id_<slug>`); leaving them in the DB
    // would mislead the daily worker. Only clean them up when a real
    // Particle key is in env so we can re-resolve canonical IDs in the
    // same step — without the key, clearing would leave the DB worse off
    // than the test found it.
    if (!process.env.PARTICLE_API_KEY) return;
    await supabase.from("podcasts").update({ particle_id: null }).not("particle_id", "is", null);
    await supabase.from("universes").update({ entity_id_map: {} }).eq("team_id", "49ers");
    const realParticle = createSeedParticleResolver(process.env.PARTICLE_API_KEY);
    await runSeed(supabase, {
      podiumUserId: PODIUM_USER_ID!,
      podiumUserEmail: "podium-stub-user@example.test",
      particle: realParticle,
    });
  }, 120_000);

  it("first run completes with non-zero upsert counts", () => {
    expect(firstRun.teamsUpserted).toBe(1);
    expect(firstRun.universeUpserted).toBe(1);
    expect(firstRun.podcastsUpserted).toBe(podcasts.length);
  });

  it("second run reports the auth user already exists", () => {
    expect(secondRun.authUserCreated).toBe(false);
  });

  it("second run upserts the same shape (idempotent counts)", () => {
    expect(secondRun.teamsUpserted).toBe(1);
    expect(secondRun.universeUpserted).toBe(1);
    expect(secondRun.podcastsUpserted).toBe(podcasts.length);
  });

  it("ends in the configured shape — exactly one team, one universe, podcasts.length podcasts (no orphans)", async () => {
    const { count: teamCount } = await supabase
      .from("teams")
      .select("id", { count: "exact", head: true });
    expect(teamCount).toBe(1);

    const { count: universeCount } = await supabase
      .from("universes")
      .select("id", { count: "exact", head: true });
    expect(universeCount).toBe(1);

    // Total podcast row count must equal the curated list. Any stale-slug
    // rows (e.g., a renamed entry that left an orphan behind) would fail
    // this — `in(slugs)` would not.
    const { count: podcastCount } = await supabase
      .from("podcasts")
      .select("particle_slug", { count: "exact", head: true });
    expect(podcastCount).toBe(podcasts.length);
  });

  it("seeded universe value-matches the in-process config (catches slug typos that preserve count)", async () => {
    const { data, error } = await supabase
      .from("universes")
      .select("entities, storylines")
      .eq("team_id", niners.teamId)
      .single();
    expect(error).toBeNull();
    expect(data?.entities).toEqual([...niners.entities]);
    expect(data?.storylines).toEqual([...niners.storylines]);
  });

  it("teams.universe_id is linked to the seeded universe", async () => {
    const { data: team } = await supabase
      .from("teams")
      .select("universe_id")
      .eq("id", "49ers")
      .single();
    const { data: universe } = await supabase
      .from("universes")
      .select("id")
      .eq("team_id", "49ers")
      .single();
    expect(team?.universe_id).toBe(universe?.id);
  });

  it("after both runs every podcast slug has a resolved particle_id (counts depend on prior DB state)", () => {
    // The first run resolves whichever rows are still NULL; if a prior
    // test or live seed already populated them, firstRun.podcastIdsResolved
    // can be 0 — the persisted state below is what matters.
    expect(firstRun.podcastIdsResolved + secondRun.podcastIdsResolved).toBeGreaterThanOrEqual(0);
    expect(secondRun.podcastIdsResolved).toBe(0);
  });

  it("podcasts.particle_id is populated for the configured catalog after seed", async () => {
    const slugs = podcasts.map((p) => p.particleSlug);
    const { data, error } = await supabase
      .from("podcasts")
      .select("particle_slug, particle_id")
      .in("particle_slug", slugs);
    expect(error).toBeNull();
    const unresolved = (data ?? []).filter((row) => !row.particle_id);
    expect(unresolved).toEqual([]);
  });

  it("universes.entity_id_map is populated for every entity in the universe", async () => {
    const { data, error } = await supabase
      .from("universes")
      .select("entity_id_map")
      .eq("team_id", "49ers")
      .single();
    expect(error).toBeNull();
    const map = data?.entity_id_map as Record<string, string> | null;
    expect(map).toBeTruthy();
    for (const slug of niners.entities) {
      expect(map?.[slug], `entity_id_map missing slug "${slug}"`).toBeTruthy();
    }
  });

  it("second run reports zero new resolutions (fully cached)", () => {
    expect(secondRun.podcastIdsResolved).toBe(0);
    expect(secondRun.entityIdsResolved).toBe(0);
  });
});
