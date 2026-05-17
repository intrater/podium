import { describe, expect, it } from "vitest";

import { computeThemeSignature } from "@/lib/themes/cluster-moments";
import type { MomentForClustering } from "@/lib/themes/types";

function makeMoment(overrides: Partial<MomentForClustering> = {}): MomentForClustering {
  return {
    segment_id: "seg_" + Math.random().toString(36).slice(2, 8),
    voice_id: "the-mina-kimes-show",
    topic_key: "purdy-contract",
    summary: "Purdy is worth the extension.",
    surfacing_entities: ["Brock Purdy"],
    match_source: "entity",
    episode_published_at: "2026-05-15T10:00:00Z",
    pull_quote: "Worth every penny.",
    ...overrides,
  };
}

describe("computeThemeSignature", () => {
  it("is deterministic — same input produces same hash", () => {
    const members = [makeMoment(), makeMoment()];
    const sig1 = computeThemeSignature([], ["Brock Purdy"], members);
    const sig2 = computeThemeSignature([], ["Brock Purdy"], members);
    expect(sig1).toBe(sig2);
  });

  it("returns a stable 16-character hex string", () => {
    const sig = computeThemeSignature([], ["Brock Purdy"], [makeMoment()]);
    expect(sig).toMatch(/^[a-f0-9]{16}$/);
  });

  it("produces the same signature for the same conversation on different days", () => {
    // Two days of the same Purdy contract discussion → same signature.
    const day1Members = [
      makeMoment({ topic_key: "purdy-contract", episode_published_at: "2026-05-15T10:00:00Z" }),
      makeMoment({ topic_key: "purdy-contract", episode_published_at: "2026-05-15T14:00:00Z" }),
    ];
    const day2Members = [
      makeMoment({ topic_key: "purdy-contract", episode_published_at: "2026-05-16T09:00:00Z" }),
      makeMoment({ topic_key: "purdy-contract", episode_published_at: "2026-05-16T11:00:00Z" }),
    ];
    const sig1 = computeThemeSignature([], ["Brock Purdy"], day1Members);
    const sig2 = computeThemeSignature([], ["Brock Purdy"], day2Members);
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different topics", () => {
    const purdy = [makeMoment({ topic_key: "purdy-contract" })];
    const schedule = [
      makeMoment({ topic_key: "nfl-schedule", surfacing_entities: ["NFL schedule"] }),
    ];
    const sig1 = computeThemeSignature([], ["Brock Purdy"], purdy);
    const sig2 = computeThemeSignature([], ["NFL schedule"], schedule);
    expect(sig1).not.toBe(sig2);
  });

  it("is order-independent in member topic_keys", () => {
    // The signature should reflect the *set* of topic_keys, not the order they appear in.
    const a = [
      makeMoment({ topic_key: "wr-room" }),
      makeMoment({ topic_key: "purdy-contract" }),
    ];
    const b = [
      makeMoment({ topic_key: "purdy-contract" }),
      makeMoment({ topic_key: "wr-room" }),
    ];
    const sigA = computeThemeSignature([], ["Brock Purdy"], a);
    const sigB = computeThemeSignature([], ["Brock Purdy"], b);
    expect(sigA).toBe(sigB);
  });

  it("normalizes the dominant entity into the slug space", () => {
    // "Brock Purdy" and "brock purdy" should yield the same signature
    // because the slug step lowercases and collapses spaces.
    const sigA = computeThemeSignature([], ["Brock Purdy"], [makeMoment()]);
    const sigB = computeThemeSignature([], ["brock purdy"], [makeMoment()]);
    expect(sigA).toBe(sigB);
  });

  it("falls back to a deterministic default when surfacing_entities is empty", () => {
    const sig1 = computeThemeSignature([], [], [makeMoment()]);
    const sig2 = computeThemeSignature([], [], [makeMoment()]);
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{16}$/);
  });
});
