import { describe, expect, it } from "vitest";

import {
  HOST_LEVEL_THRESHOLD,
  MIN_SAMPLE_SIZE,
  recommendKindFromFillRate,
} from "../../scripts/probe-speaker-attribution.ts";

describe("recommendKindFromFillRate", () => {
  it("recommends 'show' when sample size is below the minimum", () => {
    // 100% fill rate but only 3 segments — not enough to be confident.
    expect(recommendKindFromFillRate(MIN_SAMPLE_SIZE - 1, MIN_SAMPLE_SIZE - 1)).toBe("show");
    expect(recommendKindFromFillRate(0, 0)).toBe("show");
    expect(recommendKindFromFillRate(1, 1)).toBe("show");
  });

  it("recommends 'host' when fill rate clears the threshold with sufficient data", () => {
    // 95% of 100 segments named.
    expect(recommendKindFromFillRate(100, 95)).toBe("host");
    // Exactly at threshold (90%).
    expect(recommendKindFromFillRate(100, 90)).toBe("host");
    // 90% with the minimum sample size.
    expect(
      recommendKindFromFillRate(MIN_SAMPLE_SIZE, Math.ceil(MIN_SAMPLE_SIZE * HOST_LEVEL_THRESHOLD)),
    ).toBe("host");
  });

  it("recommends 'show' when fill rate is below the threshold despite sufficient data", () => {
    // 50% of 100 segments named.
    expect(recommendKindFromFillRate(100, 50)).toBe("show");
    // Just below threshold (89%).
    expect(recommendKindFromFillRate(100, 89)).toBe("show");
    // 0% on a full sample.
    expect(recommendKindFromFillRate(100, 0)).toBe("show");
  });

  it("uses 90% as the host-level threshold", () => {
    expect(HOST_LEVEL_THRESHOLD).toBe(0.9);
  });

  it("requires at least 5 segments for a data-driven recommendation", () => {
    expect(MIN_SAMPLE_SIZE).toBe(5);
  });
});
