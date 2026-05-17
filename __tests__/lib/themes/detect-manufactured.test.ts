import { describe, expect, it } from "vitest";

import {
  detectManufactured,
  hasSharedPhrase,
  type ClusterMomentLite,
} from "@/lib/themes/detect-manufactured";

function makeMember(overrides: Partial<ClusterMomentLite> = {}): ClusterMomentLite {
  return {
    segment_id: "seg_" + Math.random().toString(36).slice(2, 8),
    match_source: "entity",
    episode_published_at: "2026-05-15T10:00:00Z",
    pull_quote: "Some quote",
    surfacing_entities: ["Brock Purdy"],
    ...overrides,
  };
}

describe("hasSharedPhrase", () => {
  it("returns false for fewer than 2 members with quotes", () => {
    expect(hasSharedPhrase([], 6)).toBe(false);
    expect(hasSharedPhrase([makeMember({ pull_quote: null })], 6)).toBe(false);
    expect(hasSharedPhrase([makeMember({ pull_quote: "foo bar baz qux quux corge" })], 6)).toBe(
      false,
    );
  });

  it("detects a 6-token shared phrase between two quotes", () => {
    const a = makeMember({
      pull_quote: "the schedule release this year is brutal across the board",
    });
    const b = makeMember({
      pull_quote: "honestly the schedule release this year is brutal and I'm worried",
    });
    expect(hasSharedPhrase([a, b], 6)).toBe(true);
  });

  it("ignores shared phrases below the minimum token count", () => {
    const a = makeMember({ pull_quote: "Brock Purdy looks good" });
    const b = makeMember({ pull_quote: "Brock Purdy looks ready for the year" });
    // "Brock Purdy looks" is 3 tokens — under 6.
    expect(hasSharedPhrase([a, b], 6)).toBe(false);
  });

  it("normalizes punctuation/casing before matching", () => {
    const a = makeMember({
      pull_quote: '"The 49ers traveled 38,000 miles this season"',
    });
    const b = makeMember({
      pull_quote: "the 49ers traveled 38 000 miles this season",
    });
    expect(hasSharedPhrase([a, b], 5)).toBe(true);
  });
});

describe("detectManufactured", () => {
  it("returns false for fewer than 2 members", () => {
    expect(detectManufactured([])).toBe(false);
    expect(detectManufactured([makeMember()])).toBe(false);
  });

  it("returns false when only one of the three signals fires", () => {
    // Only signal 2 fires: timestamps close, but match.source differs and no phrase overlap.
    const a = makeMember({
      match_source: "entity",
      episode_published_at: "2026-05-15T10:00:00Z",
      pull_quote: "Totally different sentence A",
    });
    const b = makeMember({
      match_source: "semantic",
      episode_published_at: "2026-05-15T11:00:00Z",
      pull_quote: "Completely unrelated sentence B",
    });
    expect(detectManufactured([a, b])).toBe(false);
  });

  it("returns true when match.source + entity shared AND publication proximity fires", () => {
    const a = makeMember({
      match_source: "keyword",
      surfacing_entities: ["NFL schedule"],
      episode_published_at: "2026-05-15T10:00:00Z",
      pull_quote: "Different wording A",
    });
    const b = makeMember({
      match_source: "keyword",
      surfacing_entities: ["NFL schedule"],
      episode_published_at: "2026-05-15T12:00:00Z",
      pull_quote: "Different wording B",
    });
    expect(detectManufactured([a, b])).toBe(true);
  });

  it("returns true when publication proximity + verbatim phrase overlap fire", () => {
    const a = makeMember({
      match_source: "entity",
      episode_published_at: "2026-05-15T10:00:00Z",
      pull_quote: "the 49ers will travel a record 38000 miles this year",
    });
    const b = makeMember({
      match_source: "semantic",
      episode_published_at: "2026-05-15T11:00:00Z",
      pull_quote: "experts agree the 49ers will travel a record 38000 miles this year",
    });
    expect(detectManufactured([a, b])).toBe(true);
  });

  it("returns false when publication proximity fires but nothing else", () => {
    // Different sources, different entities, no phrase overlap.
    const a = makeMember({
      match_source: "entity",
      surfacing_entities: ["Purdy"],
      episode_published_at: "2026-05-15T10:00:00Z",
      pull_quote: "Sentence one",
    });
    const b = makeMember({
      match_source: "semantic",
      surfacing_entities: ["Kittle"],
      episode_published_at: "2026-05-15T10:30:00Z",
      pull_quote: "Sentence two",
    });
    expect(detectManufactured([a, b])).toBe(false);
  });

  it("ignores match.source signal when not every member shares the same source", () => {
    const a = makeMember({
      match_source: "keyword",
      surfacing_entities: ["NFL schedule"],
      episode_published_at: "2026-05-15T10:00:00Z",
    });
    const b = makeMember({
      match_source: "entity", // different source
      surfacing_entities: ["NFL schedule"],
      episode_published_at: "2026-05-15T11:00:00Z",
    });
    // Only signal 2 fires.
    expect(detectManufactured([a, b])).toBe(false);
  });
});
