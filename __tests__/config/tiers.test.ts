import { describe, expect, it } from "vitest";

import { podcasts } from "@/config/podcasts";
import { tierForSlug, tiers, type Tier } from "@/config/tiers";

describe("config/tiers", () => {
  it("assigns a tier to every catalog podcast", () => {
    const missing = podcasts
      .filter((p) => !(p.particleSlug in tiers))
      .map((p) => p.particleSlug);
    expect(missing, "podcasts in config/podcasts.ts without a tier").toEqual([]);
  });

  it("does not contain tier entries for unknown slugs (no orphans)", () => {
    const knownSlugs = new Set(podcasts.map((p) => p.particleSlug));
    const orphans = Object.keys(tiers).filter((slug) => !knownSlugs.has(slug));
    expect(orphans, "tiers entries pointing at slugs that don't exist in config/podcasts.ts").toEqual([]);
  });

  it("only uses valid tier values", () => {
    const validTiers = new Set<Tier>(["A", "B", "C"]);
    for (const [slug, tier] of Object.entries(tiers)) {
      expect(validTiers.has(tier as Tier), `tier '${tier}' for slug '${slug}'`).toBe(true);
    }
  });

  it("Tier A roster contains the 7 voices the maker selected", () => {
    const tierA = new Set(
      Object.entries(tiers)
        .filter(([, tier]) => tier === "A")
        .map(([slug]) => slug),
    );
    const expectedTierA = [
      "the-mina-kimes-show",
      "the-bill-simmons",
      "the-dan-patrick-show",
      "the-rich-eisen-show",
      "the-ringer-nfl-show",
      "football-301",
      "the-athletic-football-show",
    ];
    for (const slug of expectedTierA) {
      expect(tierA.has(slug), `Tier A must include '${slug}'`).toBe(true);
    }
  });

  it("Tier A is the smallest tier (the spine, not the volume)", () => {
    const counts = { A: 0, B: 0, C: 0 } as Record<Tier, number>;
    for (const tier of Object.values(tiers)) {
      counts[tier as Tier] += 1;
    }
    expect(counts.A).toBeLessThan(counts.B);
    expect(counts.B).toBeLessThan(counts.C);
  });

  it("tierForSlug is deterministic — same slug returns same tier across calls", () => {
    for (const slug of Object.keys(tiers)) {
      expect(tierForSlug(slug)).toBe(tierForSlug(slug));
    }
  });

  it("tierForSlug returns 'C' for unknown slugs (fail-closed default)", () => {
    expect(tierForSlug("never-heard-of-this-podcast")).toBe("C");
    expect(tierForSlug("")).toBe("C");
  });

  it("every catalog slug resolves to the same tier via tierForSlug and direct lookup", () => {
    for (const podcast of podcasts) {
      expect(tierForSlug(podcast.particleSlug)).toBe(tiers[podcast.particleSlug]);
    }
  });
});
