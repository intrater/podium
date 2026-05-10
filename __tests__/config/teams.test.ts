import { describe, expect, it } from "vitest";

import { teams } from "@/config/teams";

describe("config/teams", () => {
  it("ships one team in v1 (the 49ers)", () => {
    expect(teams).toHaveLength(1);
    expect(teams[0].id).toBe("49ers");
    expect(teams[0].sport).toBe("nfl");
  });

  it("uses OKLCH for every palette color", () => {
    // Tolerant of whitespace / decimal precision; rejects hex/rgb leftovers.
    const oklchPattern = /^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/;
    for (const team of teams) {
      expect(team.palette.primary, `${team.id} primary`).toMatch(oklchPattern);
      expect(team.palette.secondary, `${team.id} secondary`).toMatch(oklchPattern);
      expect(team.palette.onPrimary, `${team.id} onPrimary`).toMatch(oklchPattern);
    }
  });

  it("has unique ids (PK constraint mirrors this)", () => {
    const ids = teams.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
