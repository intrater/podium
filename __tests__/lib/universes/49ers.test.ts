import { describe, expect, it } from "vitest";

import { niners } from "@/lib/universes/49ers";

describe("lib/universes/49ers", () => {
  it("targets the 49ers team", () => {
    expect(niners.teamId).toBe("49ers");
  });

  it("carries enough entities to drive the daily worker (>= 25)", () => {
    expect(niners.entities.length).toBeGreaterThanOrEqual(25);
  });

  it("uses lowercase kebab-case slugs (Particle convention) and no duplicates", () => {
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    for (const slug of niners.entities) {
      expect(slug, `entity slug "${slug}"`).toMatch(slugPattern);
    }
    expect(new Set(niners.entities).size).toBe(niners.entities.length);
  });

  it("includes the team itself plus core staff and starters", () => {
    expect(niners.entities).toContain("san-francisco-49ers");
    expect(niners.entities).toContain("kyle-shanahan");
    expect(niners.entities).toContain("brock-purdy");
    expect(niners.entities).toContain("nick-bosa");
    expect(niners.entities).toContain("fred-warner");
  });

  it("nameFallbacks is empty in v1 (U1 verified 100% slug coverage)", () => {
    expect(niners.nameFallbacks).toHaveLength(0);
  });

  it("provides at least 6 storylines for semantic search", () => {
    expect(niners.storylines.length).toBeGreaterThanOrEqual(6);
    for (const storyline of niners.storylines) {
      expect(storyline.length).toBeGreaterThan(10);
    }
  });
});
