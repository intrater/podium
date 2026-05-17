import { describe, expect, it } from "vitest";

import { serializeBrainForPrompt } from "@/lib/team-brain/serialize-for-prompt";
import type { TeamBrain } from "@/lib/team-brain/types";

function makeBrain(overrides: Partial<TeamBrain> = {}): TeamBrain {
  return {
    team_id: "test-team",
    team_name: "the Test Team",
    sport: "NFL",
    season_context: "Preseason 2026.",
    season_storyline: "A storyline.",
    roster: [{ name: "Player One", role: "QB" }],
    narrative_arcs: [
      { label: "Arc one", summary: "Arc summary one.", state: "hot" },
    ],
    fan_psychology: ["We obsess over close losses."],
    recent_themes: [],
    updated_at: "2026-05-17T00:00:00Z",
    ...overrides,
  };
}

describe("serializeBrainForPrompt", () => {
  it("is byte-stable across repeated calls with the same input", () => {
    const brain = makeBrain();
    const first = serializeBrainForPrompt(brain);
    const second = serializeBrainForPrompt(brain);
    const third = serializeBrainForPrompt(brain);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("does NOT include updated_at in the output (cache prefix must be stable across days)", () => {
    const day1 = makeBrain({ updated_at: "2026-05-17T00:00:00Z" });
    const day2 = makeBrain({ updated_at: "2026-05-18T13:42:11Z" });
    expect(serializeBrainForPrompt(day1)).toBe(serializeBrainForPrompt(day2));
    expect(serializeBrainForPrompt(day1)).not.toMatch(/2026-05-17/);
  });

  it("renders the recent-themes heading even when the list is empty (shape stability)", () => {
    const empty = makeBrain({ recent_themes: [] });
    const out = serializeBrainForPrompt(empty);
    expect(out).toMatch(/## Recent themes/);
    expect(out).toMatch(/No themes surfaced yet/);
  });

  it("renders narrative arcs with state tags", () => {
    const brain = makeBrain({
      narrative_arcs: [
        { label: "Hot arc", summary: "Hot.", state: "hot" },
        { label: "Simmering arc", summary: "Simmering.", state: "simmering" },
        { label: "Cold arc", summary: "Cold.", state: "cold" },
        { label: "Untagged arc", summary: "No state." },
      ],
    });
    const out = serializeBrainForPrompt(brain);
    expect(out).toMatch(/Hot arc \[HOT\]/);
    expect(out).toMatch(/Simmering arc \[SIMMERING\]/);
    expect(out).toMatch(/Cold arc \[COLD\]/);
    // Untagged arc has no state tag
    expect(out).toMatch(/### Untagged arc\nNo state\./);
  });

  it("renders roster entries with optional notes", () => {
    const brain = makeBrain({
      roster: [
        { name: "WithNote", role: "QB", note: "starter" },
        { name: "WithoutNote", role: "WR" },
      ],
    });
    const out = serializeBrainForPrompt(brain);
    expect(out).toMatch(/\*\*WithNote\*\* \(QB\) — starter/);
    expect(out).toMatch(/\*\*WithoutNote\*\* \(WR\)/);
    expect(out).not.toMatch(/WithoutNote.*—.*[a-z]/); // no em-dash after role for note-less entry
  });

  it("the seeded 49ers brain produces output above 14,000 characters (proxy for ≥4,096 tokens)", async () => {
    // Anthropic tokenization runs at ~4 chars/token for English prose;
    // 14,000 chars is a conservative floor for >=3,500 tokens, which
    // with the surrounding tools block clears Haiku 4.5's 4,096-token
    // cache minimum in practice. Runtime verification via
    // scripts/debug-team-brain-cache.ts is the authoritative check.
    const { niners49ers } = await import("../../../scripts/seed-team-brain.ts");
    const brain: TeamBrain = { ...niners49ers, updated_at: "2026-05-17T00:00:00Z" };
    const out = serializeBrainForPrompt(brain);
    expect(out.length).toBeGreaterThanOrEqual(14_000);
  });
});
