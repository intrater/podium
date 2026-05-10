import { describe, expect, it } from "vitest";

import { podcasts } from "@/config/podcasts";

describe("config/podcasts", () => {
  it("contains exactly 31 entries", () => {
    expect(podcasts).toHaveLength(31);
  });

  it("hits the plan's kind-count thresholds", () => {
    const teamSpecific = podcasts.filter((p) => p.kind === "team-specific");
    const national = podcasts.filter((p) => p.kind === "national");
    expect(teamSpecific.length).toBeGreaterThanOrEqual(7);
    expect(national.length).toBeGreaterThanOrEqual(20);
  });

  it("uses lowercase kebab-case Particle slugs (no nulls in v1)", () => {
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const podcast of podcasts) {
      expect(podcast.particleSlug, `slug for "${podcast.name}"`).toMatch(slugPattern);
    }
  });

  it("has no duplicate slugs (idempotent seed depends on this)", () => {
    const slugs = podcasts.map((p) => p.particleSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("requires a non-empty name on every entry", () => {
    for (const podcast of podcasts) {
      expect(podcast.name.length).toBeGreaterThan(0);
    }
  });
});
