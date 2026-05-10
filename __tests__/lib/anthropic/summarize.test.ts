/**
 * Anthropic summarization unit tests.
 *
 * Mocks the Anthropic SDK at the `messages.create` level. Mocks Supabase
 * so cost-telemetry writes are observable without hitting the live DB.
 */

import { describe, expect, it, vi } from "vitest";

import { createAnthropicClient } from "@/lib/anthropic/client";
import { summarizeEpisode } from "@/lib/anthropic/summarize-episode";
import { normalizeQuotes, summarizeSegment } from "@/lib/anthropic/summarize";
import {
  ANTHROPIC_HAIKU_PRICE_USD,
  AnthropicTransientError,
  type SegmentSummaryInput,
} from "@/lib/anthropic/types";

interface RecordedCall {
  endpoint: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  metadata: Record<string, unknown>;
}

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
  for (const response of responses) create.mockResolvedValueOnce(response);
  return {
    messages: { create } as unknown as { create: typeof create },
    create,
  };
}

function toolUseMessage(input: unknown, opts?: Partial<MessageLike["usage"]>): MessageLike {
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
        name: "submit_segment_analysis",
        input,
      },
    ],
    usage: {
      input_tokens: opts?.input_tokens ?? 5_000,
      output_tokens: opts?.output_tokens ?? 200,
      cache_creation_input_tokens: opts?.cache_creation_input_tokens ?? null,
      cache_read_input_tokens: opts?.cache_read_input_tokens ?? null,
    },
  };
}

const TRANSCRIPT = `Mina Kimes: I think the most underrated thing about Brock Purdy this year is just how comfortable he looks in the pocket.
Domonique Foxworth: Yeah, and Trent Williams is still Trent Williams.`;

const baseInput: SegmentSummaryInput = {
  team: {
    name: "San Francisco 49ers",
    sport: "nfl",
    entities: ["brock-purdy", "trent-williams", "san-francisco-49ers"],
    storylines: ["49ers offseason moves and free agency"],
  },
  podcast: { name: "The Mina Kimes Show", kind: "national" },
  episode: { title: "49ers OL deep dive" },
  segment: {
    title: "Purdy's pocket presence",
    transcript: TRANSCRIPT,
  },
};

// ─── summarizeSegment ────────────────────────────────────────────────

describe("summarizeSegment — happy path", () => {
  it("parses tool-use response, validates fields, and returns the summary", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage({
        is_team_relevant: true,
        summary: "The 49ers' OL is the underrated story.",
        pull_quotes: [
          "I think the most underrated thing about Brock Purdy this year is just how comfortable he looks in the pocket.",
        ],
        bullets: [
          "Purdy's pocket presence is the underrated story.",
          "Trent Williams remains the OL anchor.",
          "The OL has gelled faster than expected.",
        ],
        surfacing_entities: ["brock-purdy", "trent-williams"],
      }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);

    expect(result).not.toBeNull();
    expect(result?.summary).toContain("OL is the underrated story");
    expect(result?.pullQuotes).toHaveLength(1);
    expect(result?.bullets).toHaveLength(3);
    expect(result?.surfacingEntities).toEqual(["brock-purdy", "trent-williams"]);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].endpoint).toBe("summarize_segment");
    expect(recorded[0].input_tokens).toBe(5_000);
  });
});

// ─── Off-topic returns null ─────────────────────────────────────────

describe("summarizeSegment — off-topic detection", () => {
  it("returns null when is_team_relevant=false", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage({ is_team_relevant: false }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);
    expect(result).toBeNull();
    // Cost still recorded — the request was made and we paid for it.
    expect(recorded).toHaveLength(1);
  });
});

// ─── Quote fidelity ─────────────────────────────────────────────────

describe("summarizeSegment — quote fidelity reject and retry", () => {
  it("retries once when pull_quotes are not substrings of the transcript; succeeds on retry", async () => {
    const recorded: RecordedCall[] = [];
    // First response includes a fabricated quote.
    const fabricated = toolUseMessage({
      is_team_relevant: true,
      summary: "Summary",
      pull_quotes: ["This quote does not appear anywhere in the transcript."],
      bullets: ["a", "b", "c"],
      surfacing_entities: ["brock-purdy"],
    });
    // Retry succeeds.
    const valid = toolUseMessage({
      is_team_relevant: true,
      summary: "Summary",
      pull_quotes: ["Trent Williams is still Trent Williams."],
      bullets: ["a", "b", "c"],
      surfacing_entities: ["brock-purdy", "trent-williams"],
    });
    const { messages, create } = makeSdkStub(fabricated, valid);
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);
    expect(result).not.toBeNull();
    expect(result?.pullQuotes).toEqual(["Trent Williams is still Trent Williams."]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(2);
  });

  it("returns null after both attempts fail quote fidelity", async () => {
    const recorded: RecordedCall[] = [];
    const fabricatedA = toolUseMessage({
      is_team_relevant: true,
      summary: "S",
      pull_quotes: ["Not in the transcript A."],
      bullets: ["a", "b", "c"],
      surfacing_entities: [],
    });
    const fabricatedB = toolUseMessage({
      is_team_relevant: true,
      summary: "S",
      pull_quotes: ["Not in the transcript B."],
      bullets: ["a", "b", "c"],
      surfacing_entities: [],
    });
    const { messages, create } = makeSdkStub(fabricatedA, fabricatedB);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);
    expect(result).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

// ─── Schema-shape recovery ──────────────────────────────────────────

describe("summarizeSegment — invalid tool_use input recovery", () => {
  it("retries when tool_use input fails shape validation, then succeeds", async () => {
    const recorded: RecordedCall[] = [];
    // Missing required `is_team_relevant` field.
    const malformed = toolUseMessage({ summary: "Summary" });
    const valid = toolUseMessage({
      is_team_relevant: true,
      summary: "S",
      pull_quotes: [],
      bullets: ["a", "b", "c"],
      surfacing_entities: [],
    });
    const { messages, create } = makeSdkStub(malformed, valid);
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);
    expect(result).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

// ─── Cost telemetry ─────────────────────────────────────────────────

describe("summarizeSegment — token cost telemetry", () => {
  it("writes api_calls row with tokens and base-rate cost when no cache hit", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage(
        {
          is_team_relevant: true,
          summary: "S",
          pull_quotes: [],
          bullets: ["a", "b", "c"],
          surfacing_entities: [],
        },
        { input_tokens: 5_000, output_tokens: 200 },
      ),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    await summarizeSegment(client, baseInput);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].input_tokens).toBe(5_000);
    expect(recorded[0].output_tokens).toBe(200);
    const expected =
      5_000 * ANTHROPIC_HAIKU_PRICE_USD.inputPerToken +
      200 * ANTHROPIC_HAIKU_PRICE_USD.outputPerToken;
    expect(recorded[0].cost_usd).toBeCloseTo(expected, 8);
  });
});

describe("summarizeSegment — cache-hit cost math", () => {
  it("applies the cache-read discount when cache_read_input_tokens is non-zero", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage(
        {
          is_team_relevant: true,
          summary: "S",
          pull_quotes: [],
          bullets: ["a", "b", "c"],
          surfacing_entities: [],
        },
        {
          input_tokens: 500, // Only the user message portion is non-cached.
          cache_read_input_tokens: 4_500, // System prompt cache hit.
          output_tokens: 200,
        },
      ),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    await summarizeSegment(client, baseInput);

    expect(recorded).toHaveLength(1);
    // Cost = 500 * inputRate + 4500 * cacheReadRate + 200 * outputRate.
    const expected =
      500 * ANTHROPIC_HAIKU_PRICE_USD.inputPerToken +
      4_500 * ANTHROPIC_HAIKU_PRICE_USD.cacheReadPerToken +
      200 * ANTHROPIC_HAIKU_PRICE_USD.outputPerToken;
    expect(recorded[0].cost_usd).toBeCloseTo(expected, 8);
    expect(recorded[0].metadata.cache_read_input_tokens).toBe(4_500);

    // Sanity: cache hit should be substantially cheaper than the no-cache
    // version (4500 tokens charged at 10% of input rate vs. full rate).
    const noCacheEquivalent =
      5_000 * ANTHROPIC_HAIKU_PRICE_USD.inputPerToken +
      200 * ANTHROPIC_HAIKU_PRICE_USD.outputPerToken;
    expect(recorded[0].cost_usd).toBeLessThan(noCacheEquivalent / 3);
  });
});

// ─── Episode summary ────────────────────────────────────────────────

// ─── Response missing tool_use block ────────────────────────────────

describe("summarizeSegment — response without tool_use block", () => {
  it("retries when the model returns text only and succeeds on retry", async () => {
    const recorded: RecordedCall[] = [];
    const textOnly: MessageLike = {
      id: "msg_text",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5",
      stop_reason: "end_turn",
      stop_sequence: null,
      content: [{ type: "text", text: "I would describe the segment as..." }],
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const valid = toolUseMessage({
      is_team_relevant: true,
      summary: "S",
      pull_quotes: [],
      bullets: ["a", "b", "c"],
      surfacing_entities: [],
    });
    const { messages, create } = makeSdkStub(textOnly, valid);
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);
    expect(result).not.toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

// ─── Transient error → null ─────────────────────────────────────────

describe("summarizeSegment — transient API error returns null", () => {
  it("returns null without retrying when the SDK throws an AnthropicTransientError", async () => {
    const recorded: RecordedCall[] = [];
    const create = vi.fn().mockImplementation(async () => {
      throw new AnthropicTransientError(
        "test_op",
        "Anthropic returned 503",
        new Error("upstream"),
        503,
      );
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages: { create } } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, baseInput);
    expect(result).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

// ─── Retry payload shape ────────────────────────────────────────────

describe("summarizeSegment — retry payload includes tool_result block", () => {
  it("the second call's last message contains a tool_result content block referencing the prior tool_use_id", async () => {
    const recorded: RecordedCall[] = [];
    const fabricated = toolUseMessage({
      is_team_relevant: true,
      summary: "S",
      pull_quotes: ["This quote is fabricated and not in the transcript."],
      bullets: ["a", "b", "c"],
      surfacing_entities: [],
    });
    const valid = toolUseMessage({
      is_team_relevant: true,
      summary: "S",
      pull_quotes: [],
      bullets: ["a", "b", "c"],
      surfacing_entities: [],
    });
    const { messages, create } = makeSdkStub(fabricated, valid);
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    await summarizeSegment(client, baseInput);

    expect(create).toHaveBeenCalledTimes(2);
    const secondCall = create.mock.calls[1][0] as { messages: { role: string; content: unknown }[] };
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    const blocks = lastMessage.content as Array<{ type: string; tool_use_id?: string; is_error?: boolean; content?: string }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("tool_result");
    expect(blocks[0].tool_use_id).toBe("tu_1");
    expect(blocks[0].is_error).toBe(true);
    expect(blocks[0].content).toContain("fabricated");
  });
});

// ─── Quote normalization ────────────────────────────────────────────

describe("normalizeQuotes", () => {
  it("collapses curly to straight quotes and en/em-dashes to hyphens", () => {
    expect(normalizeQuotes("“hello”")).toBe('"hello"');
    expect(normalizeQuotes("don’t")).toBe("don't");
    expect(normalizeQuotes("a — b")).toBe("a - b");
    expect(normalizeQuotes("a – b")).toBe("a - b");
    expect(normalizeQuotes("…")).toBe("...");
  });
});

describe("summarizeSegment — curly-vs-straight-quote tolerance", () => {
  it("accepts a pull quote that uses straight ASCII quotes when the transcript uses curly", async () => {
    const recorded: RecordedCall[] = [];
    const inputWithCurly: SegmentSummaryInput = {
      ...baseInput,
      segment: {
        ...baseInput.segment,
        transcript: `Mina Kimes: “Trent Williams is still Trent Williams.”`,
      },
    };
    const { messages } = makeSdkStub(
      toolUseMessage({
        is_team_relevant: true,
        summary: "S",
        pull_quotes: ['"Trent Williams is still Trent Williams."'],
        bullets: ["a", "b", "c"],
        surfacing_entities: ["trent-williams"],
      }),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeSegment(client, inputWithCurly);
    expect(result).not.toBeNull();
    expect(result?.pullQuotes[0]).toContain("Trent Williams");
  });
});

// ─── Telemetry contract: no-cache metadata zeroes ───────────────────

describe("summarizeSegment — no-cache telemetry zeros cache fields", () => {
  it("metadata records cache_creation_input_tokens=0 and cache_read_input_tokens=0 when SDK returns null for both", async () => {
    const recorded: RecordedCall[] = [];
    const { messages } = makeSdkStub(
      toolUseMessage(
        {
          is_team_relevant: true,
          summary: "S",
          pull_quotes: [],
          bullets: ["a", "b", "c"],
          surfacing_entities: [],
        },
        { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: null, cache_read_input_tokens: null },
      ),
    );
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    await summarizeSegment(client, baseInput);
    expect(recorded[0].metadata.cache_creation_input_tokens).toBe(0);
    expect(recorded[0].metadata.cache_read_input_tokens).toBe(0);
  });
});

describe("summarizeEpisode", () => {
  it("returns null on empty input without making a call", async () => {
    const recorded: RecordedCall[] = [];
    const create = vi.fn();
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages: { create } } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeEpisode(client, {
      team: baseInput.team,
      podcast: { name: "The Mina Kimes Show" },
      episode: { title: "49ers OL deep dive" },
      segmentSummaries: [],
    });
    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("parses tool_use response into an EpisodeSummary", async () => {
    const recorded: RecordedCall[] = [];
    const message: MessageLike = {
      id: "msg_ep",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5",
      stop_reason: "tool_use",
      stop_sequence: null,
      content: [
        {
          type: "tool_use",
          id: "tu_ep",
          name: "submit_episode_summary",
          input: { summary: "The 49ers' OL is the underrated story across two segments." },
        },
      ],
      usage: { input_tokens: 800, output_tokens: 60 },
    };
    const create = vi.fn().mockResolvedValueOnce(message);
    const client = createAnthropicClient({
      supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof createAnthropicClient>[0]["supabase"],
      sdk: { messages: { create } } as unknown as Parameters<typeof createAnthropicClient>[0]["sdk"],
    });

    const result = await summarizeEpisode(client, {
      team: baseInput.team,
      podcast: { name: "The Mina Kimes Show" },
      episode: { title: "49ers OL deep dive" },
      segmentSummaries: [
        { title: "Purdy", summary: "Purdy's pocket presence is the story." },
        { title: "OL", summary: "The OL has gelled faster than expected." },
      ],
    });

    expect(result?.summary).toContain("OL");
    expect(create).toHaveBeenCalledTimes(1);
    expect(recorded[0].endpoint).toBe("summarize_episode");
  });
});
