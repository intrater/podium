import { describe, expect, it, vi } from "vitest";

import { evaluateThemeNovelty } from "@/lib/themes/novelty-gate";
import type { MomentForClustering, ThemeCandidate } from "@/lib/themes/types";
import type { TeamBrain } from "@/lib/team-brain/types";
import type { AnthropicClient } from "@/lib/anthropic/client";
import { AnthropicTransientError } from "@/lib/anthropic/types";

const TEAM_ID = "49ers";
const NOW = "2026-05-17T12:00:00Z";

function makeBrain(): TeamBrain {
  return {
    team_id: TEAM_ID,
    team_name: "the 49ers",
    sport: "NFL",
    season_context: "Test offseason.",
    season_storyline: "Test storyline.",
    roster: [],
    narrative_arcs: [],
    fan_psychology: [],
    recent_themes: [],
    updated_at: "2026-05-17T00:00:00Z",
  };
}

function makeMember(overrides: Partial<MomentForClustering> = {}): MomentForClustering {
  return {
    segment_id: "seg_test",
    voice_id: "the-mina-kimes-show",
    topic_key: "purdy-contract",
    summary: "Purdy is worth the extension.",
    surfacing_entities: ["Brock Purdy"],
    match_source: "entity",
    episode_published_at: "2026-05-17T08:00:00Z",
    pull_quote: "Worth every penny.",
    ...overrides,
  };
}

function makeTheme(overrides: Partial<ThemeCandidate> = {}): ThemeCandidate {
  return {
    label: "Purdy contract takes",
    theme_signature: "test_signature_abc",
    member_segment_ids: ["seg_test"],
    member_voice_ids: ["the-mina-kimes-show"],
    surfacing_entities: ["Brock Purdy"],
    news_echo: false,
    ...overrides,
  };
}

/** Builds a supabase stub that returns canned shapes for the three
 *  queries the gate makes: themes count (recurrence), voice_positions
 *  count (has-prior), voice_positions full load. */
function makeSupabaseStub(state: {
  themeRecurredCount: number;
  voicePriors: Record<string, { id: string; created_at: string; position_summary: string; evidence_quote: string | null }[]>;
}) {
  return {
    from: (table: string) => {
      const filters: { col: string; val: unknown; op: string }[] = [];
      const builder = {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          const isCountHead = opts?.head === true;
          return {
            eq: (col: string, val: unknown) => {
              filters.push({ col, val, op: "eq" });
              return builder.select(_cols, opts);
            },
            gte: (col: string, val: unknown) => {
              filters.push({ col, val, op: "gte" });
              return builder.select(_cols, opts);
            },
            order: () => ({
              ...builder.select(_cols, opts),
              then: async (resolve: (v: { data: unknown[]; error: null }) => void) => {
                const voiceId = filters.find((f) => f.col === "voice_id")?.val as string;
                const data = voiceId ? state.voicePriors[voiceId] ?? [] : [];
                resolve({ data, error: null });
              },
            }),
            then: async (resolve: (v: unknown) => void) => {
              if (table === "themes" && isCountHead) {
                resolve({ count: state.themeRecurredCount, error: null });
                return;
              }
              if (table === "voice_positions" && isCountHead) {
                const voiceId = filters.find((f) => f.col === "voice_id")?.val as string;
                const count = (state.voicePriors[voiceId] ?? []).length;
                resolve({ count, error: null });
                return;
              }
              // voice_positions full select with order chain handled above
              const voiceId = filters.find((f) => f.col === "voice_id")?.val as string;
              const data = voiceId ? state.voicePriors[voiceId] ?? [] : [];
              resolve({ data, error: null });
            },
          };
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeAnthropicStub(
  shiftKind: "restate" | "position_shift" | null,
): AnthropicClient {
  return {
    createMessage: vi.fn(async () => {
      if (shiftKind === null) {
        // Transient failure path — detectShift returns null. Gate
        // treats null as "default to restate" per dealbreaker policy.
        throw new AnthropicTransientError("detect_shift", "Simulated transient failure");
      }
      return {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        stop_reason: "tool_use",
        stop_sequence: null,
        content: [
          {
            type: "tool_use",
            id: "tu_test",
            name: "submit_shift_classification",
            input: {
              classification: shiftKind,
              rationale: shiftKind === "position_shift" ? "Voice flipped from bullish to bearish." : "Same argument as last week.",
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 30 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }),
  };
}

describe("evaluateThemeNovelty", () => {
  it("surfaces a first-surfacing theme (signature never seen)", async () => {
    const supabase = makeSupabaseStub({ themeRecurredCount: 0, voicePriors: {} });
    const anthropic = makeAnthropicStub("restate");
    const decision = await evaluateThemeNovelty(
      { supabase, anthropic, teamBrain: makeBrain() },
      {
        teamId: TEAM_ID,
        now: NOW,
        theme: makeTheme(),
        members: [makeMember()],
        voiceDisplayNames: new Map([["the-mina-kimes-show", "Mina Kimes Show"]]),
      },
    );
    expect(decision.surface).toBe(true);
    expect(decision.signals.some((s) => s.kind === "first_surfacing")).toBe(true);
  });

  it("surfaces a recurring theme when a new voice joins", async () => {
    const supabase = makeSupabaseStub({
      themeRecurredCount: 1, // theme seen recently
      voicePriors: {}, // no priors for any voice → new_voice signal
    });
    const anthropic = makeAnthropicStub("restate");
    const decision = await evaluateThemeNovelty(
      { supabase, anthropic, teamBrain: makeBrain() },
      {
        teamId: TEAM_ID,
        now: NOW,
        theme: makeTheme(),
        members: [makeMember()],
        voiceDisplayNames: new Map([["the-mina-kimes-show", "Mina Kimes Show"]]),
      },
    );
    expect(decision.surface).toBe(true);
    expect(decision.signals.some((s) => s.kind === "new_voice")).toBe(true);
  });

  it("suppresses a recurring theme with no novelty signals (THE PRIMARY DEALBREAKER)", async () => {
    // Theme has been seen recently AND the only member voice has prior
    // positions AND the shift-detector classifies as restate → suppress.
    const supabase = makeSupabaseStub({
      themeRecurredCount: 1, // recurred
      voicePriors: {
        "the-mina-kimes-show": [
          { id: "vp1", created_at: "2026-05-16T12:00:00Z", position_summary: "Purdy is worth it.", evidence_quote: null },
        ],
      },
    });
    const anthropic = makeAnthropicStub("restate");
    const decision = await evaluateThemeNovelty(
      { supabase, anthropic, teamBrain: makeBrain() },
      {
        teamId: TEAM_ID,
        now: NOW,
        theme: makeTheme(),
        members: [makeMember()],
        voiceDisplayNames: new Map([["the-mina-kimes-show", "Mina Kimes Show"]]),
      },
    );
    expect(decision.surface).toBe(false);
    expect(decision.rationale).toMatch(/recurred/);
  });

  it("surfaces a recurring theme when the shift-detector classifies a position_shift", async () => {
    const supabase = makeSupabaseStub({
      themeRecurredCount: 1,
      voicePriors: {
        "the-mina-kimes-show": [
          { id: "vp1", created_at: "2026-05-16T12:00:00Z", position_summary: "Purdy is overpaid.", evidence_quote: null },
        ],
      },
    });
    const anthropic = makeAnthropicStub("position_shift");
    const decision = await evaluateThemeNovelty(
      { supabase, anthropic, teamBrain: makeBrain() },
      {
        teamId: TEAM_ID,
        now: NOW,
        theme: makeTheme(),
        members: [makeMember()],
        voiceDisplayNames: new Map([["the-mina-kimes-show", "Mina Kimes Show"]]),
      },
    );
    expect(decision.surface).toBe(true);
    expect(decision.signals.some((s) => s.kind === "position_shift")).toBe(true);
    expect(decision.rationale).toContain("flipped from bullish");
  });

  it("biases toward suppression when shift-detect returns null (dealbreaker policy)", async () => {
    const supabase = makeSupabaseStub({
      themeRecurredCount: 1,
      voicePriors: {
        "the-mina-kimes-show": [
          { id: "vp1", created_at: "2026-05-16T12:00:00Z", position_summary: "Purdy is overpaid.", evidence_quote: null },
        ],
      },
    });
    const anthropic = makeAnthropicStub(null); // transient failure
    const decision = await evaluateThemeNovelty(
      { supabase, anthropic, teamBrain: makeBrain() },
      {
        teamId: TEAM_ID,
        now: NOW,
        theme: makeTheme(),
        members: [makeMember()],
        voiceDisplayNames: new Map([["the-mina-kimes-show", "Mina Kimes Show"]]),
      },
    );
    // No first_surfacing (recurred), no new_voice (has priors), null
    // shift-detect → no signals → suppress. Bias toward dealbreaker
    // avoidance.
    expect(decision.surface).toBe(false);
  });
});
