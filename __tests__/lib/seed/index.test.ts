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
import { beforeAll, describe, expect, it } from "vitest";

import { podcasts } from "@/config/podcasts";
import { runSeed, type SeedResult } from "@/lib/seed/index";
import { niners } from "@/lib/universes/49ers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PODIUM_USER_ID = process.env.PODIUM_USER_ID;
const haveEnv = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && PODIUM_USER_ID);

describe.skipIf(!haveEnv)("runSeed (live Supabase)", () => {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let firstRun: SeedResult;
  let secondRun: SeedResult;

  beforeAll(async () => {
    firstRun = await runSeed(supabase, {
      podiumUserId: PODIUM_USER_ID!,
      podiumUserEmail: "podium-stub-user@example.test",
    });
    secondRun = await runSeed(supabase, {
      podiumUserId: PODIUM_USER_ID!,
      podiumUserEmail: "podium-stub-user@example.test",
    });
  }, 60_000);

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
});
