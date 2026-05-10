/**
 * RLS smoke tests — the non-negotiable guard on data isolation before v3.
 *
 * Hits the real Supabase project from `.env.local`. Two ephemeral test users
 * (A and B) are created in `auth.users`; one card is inserted for A through
 * the service-role client; the anon-key + stub-JWT path is then used as B
 * to verify B cannot read A's card and cannot insert as A.
 *
 * Cleans up users and rows after the suite, even on failure.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mintStubJwt } from "@/lib/auth/stub-jwt";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface Fixture {
  userAId: string;
  userBId: string;
  teamId: string;
  episodeId: string;
  podcastId: string;
  cardId: string;
}

const fixture: Partial<Fixture> = {};
const fingerprint = `rls-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function clientForUser(userId: string): Promise<SupabaseClient> {
  const token = await mintStubJwt(userId);
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

beforeAll(async () => {
  const admin = getSupabaseAdmin();

  const { data: a, error: aErr } = await admin.auth.admin.createUser({
    email: `${fingerprint}-a@example.test`,
    password: "test-password-not-used",
    email_confirm: true,
  });
  if (aErr || !a.user) throw aErr ?? new Error("could not create user A");
  fixture.userAId = a.user.id;

  const { data: b, error: bErr } = await admin.auth.admin.createUser({
    email: `${fingerprint}-b@example.test`,
    password: "test-password-not-used",
    email_confirm: true,
  });
  if (bErr || !b.user) throw bErr ?? new Error("could not create user B");
  fixture.userBId = b.user.id;

  fixture.teamId = `team-${fingerprint}`;
  const { error: teamErr } = await admin.from("teams").insert({
    id: fixture.teamId,
    sport: "nfl",
    slug: fingerprint,
    name: "Test Team",
    palette: { primary: "#000000" },
  });
  if (teamErr) throw teamErr;

  const { data: podcast, error: podcastErr } = await admin
    .from("podcasts")
    .insert({ name: `Podcast ${fingerprint}`, kind: "team-specific" })
    .select("id")
    .single();
  if (podcastErr || !podcast) throw podcastErr ?? new Error("podcast insert");
  fixture.podcastId = podcast.id;

  const { data: episode, error: epErr } = await admin
    .from("episodes")
    .insert({
      podcast_id: fixture.podcastId,
      particle_episode_id: `ep-${fingerprint}`,
      title: "Test Episode",
    })
    .select("id")
    .single();
  if (epErr || !episode) throw epErr ?? new Error("episode insert");
  fixture.episodeId = episode.id;

  const { data: card, error: cardErr } = await admin
    .from("cards")
    .insert({
      user_id: fixture.userAId,
      team_id: fixture.teamId,
      episode_id: fixture.episodeId,
    })
    .select("id")
    .single();
  if (cardErr || !card) throw cardErr ?? new Error("card insert");
  fixture.cardId = card.id;
}, 30_000);

afterAll(async () => {
  const admin = getSupabaseAdmin();
  if (fixture.cardId) await admin.from("cards").delete().eq("id", fixture.cardId);
  if (fixture.episodeId) await admin.from("episodes").delete().eq("id", fixture.episodeId);
  if (fixture.podcastId) await admin.from("podcasts").delete().eq("id", fixture.podcastId);
  if (fixture.teamId) await admin.from("teams").delete().eq("id", fixture.teamId);
  if (fixture.userAId) await admin.auth.admin.deleteUser(fixture.userAId);
  if (fixture.userBId) await admin.auth.admin.deleteUser(fixture.userBId);
}, 30_000);

describe("RLS — happy path (A reads A's card)", () => {
  it("returns the card", async () => {
    const supabase = await clientForUser(fixture.userAId!);
    const { data, error } = await supabase.from("cards").select("id").eq("id", fixture.cardId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].id).toBe(fixture.cardId);
  });
});

describe("RLS — cross-user read isolation (security-critical)", () => {
  it("B cannot read A's card", async () => {
    const supabase = await clientForUser(fixture.userBId!);
    const { data, error } = await supabase.from("cards").select("id").eq("id", fixture.cardId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

describe("RLS — cross-user write rejection (security-critical)", () => {
  it("B cannot insert feedback as A (WITH CHECK enforces the user_id boundary)", async () => {
    const supabase = await clientForUser(fixture.userBId!);
    const { error } = await supabase.from("feedback").insert({
      user_id: fixture.userAId,
      card_id: fixture.cardId,
      verdict: "love",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("A cannot insert feedback as B (catches missing WITH CHECK)", async () => {
    const supabase = await clientForUser(fixture.userAId!);
    const { error } = await supabase.from("feedback").insert({
      user_id: fixture.userBId,
      card_id: fixture.cardId,
      verdict: "love",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("A can insert feedback as themselves", async () => {
    const supabase = await clientForUser(fixture.userAId!);
    const { data, error } = await supabase
      .from("feedback")
      .insert({
        user_id: fixture.userAId,
        card_id: fixture.cardId,
        verdict: "love",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    if (data?.id) {
      await getSupabaseAdmin().from("feedback").delete().eq("id", data.id);
    }
  });
});
