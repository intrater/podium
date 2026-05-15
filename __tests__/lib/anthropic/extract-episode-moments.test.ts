/**
 * Per-episode extraction unit tests (U4 of the cost-optimization plan).
 *
 * Mocks the Anthropic SDK at `messages.create`. Mocks Supabase so cost
 * telemetry writes are observable without hitting the live DB. Mirrors
 * the patterns from `summarize.test.ts`.
 */

import { describe, expect, it, vi } from "vitest";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { extractEpisodeMoments } from "@/lib/anthropic/extract-episode-moments";
import type {
  EpisodeExtractionInput,
  MentionAnchor,
  TranscriptLine,
} from "@/lib/anthropic/types";

interface MessageLike {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

interface RecordedCall {
  endpoint: string;
  cost_usd: number;
  metadata: Record<string, unknown>;
}

function makeSupabaseStub(recorded: RecordedCall[]) {
  return {
    from: () => ({
      insert: async (row: unknown) => {
        recorded.push(row as RecordedCall);
        return { error: null };
      },
    }),
  };
}

function makeSdkStub(...responses: MessageLike[]) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return {
    messages: { create } as unknown as { create: typeof create },
    create,
  };
}

function toolUseMessage(input: unknown): MessageLike {
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
        id: "tu_1",
        name: "submit_episode_extraction",
        input,
      },
    ],
    usage: {
      input_tokens: 5_000,
      output_tokens: 500,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
  };
}

function proseOnlyMessage(): MessageLike {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    content: [{ type: "text", text: "Here are some moments from the episode..." }],
    usage: { input_tokens: 5_000, output_tokens: 100 },
  };
}

const TRANSCRIPT: TranscriptLine[] = [
  {
    start_seconds: 735,
    end_seconds: 750,
    speaker: "Mina Kimes",
    text: "I think the most underrated thing about Brock Purdy this year is just how comfortable he looks in the pocket.",
  },
  {
    start_seconds: 752,
    end_seconds: 770,
    speaker: "Domonique Foxworth",
    text: "Yeah, and the offensive line — Trent Williams is still Trent Williams, but the rest of that group has gelled in a way I didn't see coming.",
  },
  {
    start_seconds: 794,
    end_seconds: 820,
    speaker: "Domonique Foxworth",
    text: "Deebo's contract, Aiyuk's contract — that's eating the cap and not producing.",
  },
];

const ANCHORS: MentionAnchor[] = [
  {
    particle_segment_id: "seg_purdy_pocket",
    start_seconds: 720,
    end_seconds: 780,
    title: "Purdy pocket presence",
    match_source: "entity",
    surfacing_entities: ["brock-purdy"],
  },
  {
    particle_segment_id: "seg_receiver_cap",
    start_seconds: 790,
    end_seconds: 825,
    title: "Receiver contracts",
    match_source: "entity",
    surfacing_entities: ["deebo-samuel", "brandon-aiyuk"],
  },
];

const baseInput: EpisodeExtractionInput = {
  team: {
    name: "San Francisco 49ers",
    sport: "nfl",
    entities: ["brock-purdy", "trent-williams", "deebo-samuel", "brandon-aiyuk"],
    storylines: ["49ers offseason moves and free agency"],
  },
  podcast: { name: "The Mina Kimes Show", kind: "national" },
  episode: { title: "49ers OL deep dive" },
  transcript: TRANSCRIPT,
  anchors: ANCHORS,
};

const VALID_MOMENT = {
  particle_segment_id: "seg_purdy_pocket",
  start_seconds: 735,
  end_seconds: 770,
  summary: "Purdy looks more composed in the pocket; the offensive line beyond Trent Williams is gelling.",
  pull_quotes: [
    "I think the most underrated thing about Brock Purdy this year is just how comfortable he looks in the pocket.",
    "Trent Williams is still Trent Williams, but the rest of that group has gelled in a way I didn't see coming.",
  ],
  bullets: [
    "Purdy looks markedly more composed in the pocket than the 2023 season.",
    "The OL beyond Trent Williams has gelled faster than expected.",
    "Mina frames the protection as the underrated story.",
  ],
  surfacing_entities: ["brock-purdy", "trent-williams"],
};

// ── happy path ────────────────────────────────────────────────────────

describe("extractEpisodeMoments — happy path", () => {
  it("returns parsed moments + rollup when the tool call validates", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage({
        moments: [VALID_MOMENT],
        episode_rollup: "Purdy looks better in the pocket; OL is the underrated story.",
      }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    expect(out!.moments).toHaveLength(1);
    expect(out!.moments[0].particle_segment_id).toBe("seg_purdy_pocket");
    expect(out!.episode_rollup).toContain("Purdy");
  });

  it("treats empty moments array as a valid 'no relevant content' output", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage({ moments: [], episode_rollup: "" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    expect(out!.moments).toHaveLength(0);
    expect(out!.episode_rollup).toBe("");
  });
});

// ── quote fidelity (graceful degradation) ────────────────────────────
//
// Quote fidelity failures are no longer fatal. Bad quotes get dropped;
// the moment survives with its summary + bullets + any valid quotes.
// This preserves cards on real 49ers content when the model lightly
// rephrases a quote — the worse failure mode is the entire episode
// disappearing from the digest.

describe("extractEpisodeMoments — quote fidelity (graceful degradation)", () => {
  it("drops a fabricated pull_quote and keeps the moment with the valid quote(s)", async () => {
    const recorded: RecordedCall[] = [];
    const mixedMoment = {
      ...VALID_MOMENT,
      pull_quotes: [
        // Valid — appears verbatim in the transcript.
        "I think the most underrated thing about Brock Purdy this year is just how comfortable he looks in the pocket.",
        // Fabricated — not in transcript.
        "Brock Purdy is the best QB in the NFL.",
      ],
    };
    const { messages } = makeSdkStub(
      toolUseMessage({ moments: [mixedMoment], episode_rollup: "Roll up" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    expect(out!.moments).toHaveLength(1);
    // Only the valid quote survives. No retry — graceful degrade.
    expect(out!.moments[0].pull_quotes).toHaveLength(1);
    expect(out!.moments[0].pull_quotes[0]).toContain("comfortable he looks in the pocket");
    expect(recorded).toHaveLength(1);
  });

  it("keeps the moment with an empty quotes array when ALL quotes fail fidelity", async () => {
    const recorded: RecordedCall[] = [];
    const allFabricated = {
      ...VALID_MOMENT,
      pull_quotes: [
        "This quote was never said by anyone.",
        "Neither was this one.",
      ],
    };
    const { messages } = makeSdkStub(
      toolUseMessage({ moments: [allFabricated], episode_rollup: "Roll up" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    // Moment survives with empty pull_quotes; summary + bullets are still there.
    expect(out!.moments).toHaveLength(1);
    expect(out!.moments[0].pull_quotes).toHaveLength(0);
    expect(out!.moments[0].summary).toBeTruthy();
    expect(out!.moments[0].bullets.length).toBeGreaterThan(0);
  });

  it("normalizes typographic differences so smart-quote / case / punctuation drift doesn't fail the check", async () => {
    const recorded: RecordedCall[] = [];
    const cosmeticallyDifferentQuote = {
      ...VALID_MOMENT,
      pull_quotes: [
        // Smart-quoted, capitalized, with an extra comma — still the same content.
        "“I think the most underrated thing about Brock Purdy this year, is just how comfortable he looks in the pocket”",
      ],
    };
    const { messages } = makeSdkStub(
      toolUseMessage({ moments: [cosmeticallyDifferentQuote], episode_rollup: "r" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    // Quote passed despite cosmetic differences.
    expect(out!.moments[0].pull_quotes).toHaveLength(1);
  });
});

// ── particle_segment_id validation ────────────────────────────────────

describe("extractEpisodeMoments — anchor id validation", () => {
  it("rejects a moment whose particle_segment_id isn't in the anchors list, then accepts a corrected retry", async () => {
    const recorded: RecordedCall[] = [];
    const ghostAnchorMoment = { ...VALID_MOMENT, particle_segment_id: "seg_does_not_exist" };
    const { messages } = makeSdkStub(
      toolUseMessage({ moments: [ghostAnchorMoment], episode_rollup: "r" }),
      toolUseMessage({ moments: [VALID_MOMENT], episode_rollup: "r" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    expect(out!.moments[0].particle_segment_id).toBe("seg_purdy_pocket");
  });
});

// ── empty anchors (list-episodes discovery, U4) ───────────────────────

describe("extractEpisodeMoments — empty anchors (list-episodes mode)", () => {
  it("accepts moments with free-form particle_segment_id when anchors are empty", async () => {
    const recorded: RecordedCall[] = [];
    const freeFormMoment = { ...VALID_MOMENT, particle_segment_id: "auto-735-770" };
    const { messages } = makeSdkStub(
      toolUseMessage({ moments: [freeFormMoment], episode_rollup: "Rollup." }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, { ...baseInput, anchors: [] });
    expect(out).not.toBeNull();
    expect(out!.moments).toHaveLength(1);
    expect(out!.moments[0].particle_segment_id).toBe("auto-735-770");
  });

  it("builds the user message without an Anchors block when anchors are empty", async () => {
    const recorded: RecordedCall[] = [];
    const { messages, create } = makeSdkStub(
      toolUseMessage({ moments: [], episode_rollup: "" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    await extractEpisodeMoments(client, { ...baseInput, anchors: [] });
    const callArgs = create.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const userContent = callArgs.messages[0].content;
    expect(userContent).not.toContain("Anchors (Particle-flagged");
    expect(userContent).toContain("No pre-flagged anchors");
  });
});

// ── schema failure recovery ───────────────────────────────────────────

describe("extractEpisodeMoments — schema failure recovery", () => {
  it("retries when the model returns prose without a tool call, then succeeds on the second attempt", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      proseOnlyMessage(),
      toolUseMessage({ moments: [VALID_MOMENT], episode_rollup: "rollup" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const out = await extractEpisodeMoments(client, baseInput);
    expect(out).not.toBeNull();
    expect(out!.moments).toHaveLength(1);
    expect(recorded).toHaveLength(2);
  });
});

// ── cache_control + max_tokens placement ──────────────────────────────

describe("extractEpisodeMoments — request-shape invariants", () => {
  it("places cache_control on the system block AND the tools entry, and sets max_tokens to 4096", async () => {
    const recorded: RecordedCall[] = [];
    const { messages, create } = makeSdkStub(
      toolUseMessage({ moments: [VALID_MOMENT], episode_rollup: "rollup" }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    await extractEpisodeMoments(client, baseInput);

    const callArgs = create.mock.calls[0][0] as {
      system: Array<{ cache_control?: { type: string } }>;
      tools: Array<{ cache_control?: { type: string } }>;
      max_tokens: number;
    };
    expect(callArgs.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(callArgs.tools[0].cache_control).toEqual({ type: "ephemeral" });
    expect(callArgs.max_tokens).toBe(4096);
  });
});
