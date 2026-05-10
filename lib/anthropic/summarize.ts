/**
 * Segment summarization via Claude Haiku tool use.
 *
 * Calls `submit_segment_analysis` as a forced tool. After the tool call:
 *
 *   1. Validate the input via zod.
 *   2. Verify every pull_quote is a verbatim substring of the transcript
 *      (after Unicode-quote normalization on both sides — curly vs
 *      straight ASCII quotes are the realistic mismatch surface).
 *   3. On any validation failure, retry once with a tool_result block
 *      that signals the error and a corrective user message.
 *   4. After two failures (or any transient transport error), return null
 *      so the caller surfaces the segment as a degraded card.
 *
 * `is_team_relevant: false` returns `null` — caller marks the segment
 * non-relevant in the database rather than storing an empty summary.
 */

import "server-only";

import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import type { AnthropicClient } from "@/lib/anthropic/client";
import { buildSegmentSummarySystemPrompt } from "@/lib/anthropic/prompts/segment-summary";
import {
  ANTHROPIC_MODEL,
  AnthropicError,
  AnthropicQuoteFidelityError,
  AnthropicSchemaError,
  AnthropicTransientError,
  type SegmentSummary,
  type SegmentSummaryInput,
} from "@/lib/anthropic/types";

const TOOL_NAME = "submit_segment_analysis";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit your analysis of the segment in context of the team. Set is_team_relevant=false when the segment doesn't substantively discuss the team.",
  input_schema: {
    type: "object" as const,
    required: ["is_team_relevant"],
    properties: {
      is_team_relevant: { type: "boolean" as const },
      summary: { type: "string" as const },
      pull_quotes: {
        type: "array" as const,
        items: { type: "string" as const },
        maxItems: 3,
      },
      bullets: {
        type: "array" as const,
        items: { type: "string" as const },
        maxItems: 5,
      },
      surfacing_entities: {
        type: "array" as const,
        items: { type: "string" as const },
      },
    },
  },
};

const TOOL_INPUT_SCHEMA = z.object({
  is_team_relevant: z.boolean(),
  summary: z.string().optional(),
  pull_quotes: z.array(z.string()).max(3).optional(),
  bullets: z.array(z.string()).max(5).optional(),
  surfacing_entities: z.array(z.string()).optional(),
});

const RELEVANT_OUTPUT_SCHEMA = TOOL_INPUT_SCHEMA.extend({
  is_team_relevant: z.literal(true),
  summary: z.string().min(1),
  pull_quotes: z.array(z.string()).max(3),
  bullets: z.array(z.string()).min(3).max(5),
  surfacing_entities: z.array(z.string()),
});

const MAX_OUTPUT_TOKENS = 1024;
const MAX_ATTEMPTS = 2;

export async function summarizeSegment(
  client: AnthropicClient,
  input: SegmentSummaryInput,
): Promise<SegmentSummary | null> {
  const systemPrompt = buildSegmentSummarySystemPrompt(input.team);
  const userMessage = buildUserMessage(input);

  const baseParams: MessageCreateParamsNonStreaming = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [TOOL_DEFINITION],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  };

  let messages = baseParams.messages;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Message;
    try {
      response = await client.createMessage("summarize_segment", {
        ...baseParams,
        messages,
      });
    } catch (err) {
      // Transport / API errors are terminal — retrying with the same
      // payload won't help, and the SDK already retried internally.
      if (err instanceof AnthropicTransientError) {
        console.error(
          `summarizeSegment: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseAndValidate(response, input.segment.transcript);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) {
        // Re-shape the messages array per the Anthropic API contract:
        // any assistant turn carrying a tool_use block must be followed
        // by a user turn whose first content block is a tool_result for
        // that tool_use_id. The corrective text follows in a second
        // content block.
        messages = buildRetryMessages(baseParams.messages, response, lastError);
        continue;
      }
    }
  }

  console.error(
    `summarizeSegment: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function parseAndValidate(message: Message, transcript: string): SegmentSummary | null {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "summarize_segment",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }

  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "summarize_segment",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }

  if (!parsed.data.is_team_relevant) return null;

  const relevant = RELEVANT_OUTPUT_SCHEMA.safeParse(parsed.data);
  if (!relevant.success) {
    throw new AnthropicSchemaError(
      "summarize_segment",
      `Relevant-segment output missing required fields: ${relevant.error.message}`,
    );
  }

  // Quote fidelity — every pull quote must be a verbatim substring of the
  // transcript after canonical-quote normalization.
  const normalizedTranscript = normalizeQuotes(transcript);
  const offending = relevant.data.pull_quotes.filter(
    (quote) => !normalizedTranscript.includes(normalizeQuotes(quote)),
  );
  if (offending.length > 0) {
    throw new AnthropicQuoteFidelityError(
      "summarize_segment",
      `Pull quotes not found in transcript: ${offending.length} of ${relevant.data.pull_quotes.length}`,
      offending,
    );
  }

  return {
    summary: relevant.data.summary,
    pullQuotes: relevant.data.pull_quotes,
    bullets: relevant.data.bullets,
    surfacingEntities: relevant.data.surfacing_entities,
  };
}

export function findToolUse(message: Message, toolName: string): ToolUseBlock | undefined {
  return message.content.find(
    (block): block is ToolUseBlock => block.type === "tool_use" && block.name === toolName,
  );
}

/**
 * Replace U+2018/2019/201C/201D and a few near-equivalents with their
 * straight-ASCII counterparts so substring fidelity ignores typographic
 * normalization mismatches between Particle's transcript and the model's
 * output.
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/…/g, "...");
}

function buildRetryMessages(
  baseMessages: MessageCreateParamsNonStreaming["messages"],
  response: Message,
  err: Error,
): MessageCreateParamsNonStreaming["messages"] {
  const toolUse = findToolUse(response, TOOL_NAME);
  const correctiveText = correctiveMessage(err);

  // If the model didn't even use the tool, we don't have a tool_use_id to
  // tool_result against — skip the tool_result block and just append a
  // plain corrective user turn.
  if (!toolUse) {
    return [
      ...baseMessages,
      { role: "assistant", content: response.content },
      { role: "user", content: correctiveText },
    ];
  }

  const userContent: ContentBlockParam[] = [
    {
      type: "tool_result",
      tool_use_id: toolUse.id,
      is_error: true,
      content: correctiveText,
    },
  ];

  return [
    ...baseMessages,
    { role: "assistant", content: response.content },
    { role: "user", content: userContent },
  ];
}

function correctiveMessage(err: Error): string {
  if (err instanceof AnthropicQuoteFidelityError) {
    return `Your prior tool call included pull_quotes that are not verbatim substrings of the transcript. Offending quote(s): ${err.offendingQuotes
      .map((q) => `"${q}"`)
      .join("; ")}. Pull quotes must be exact substrings of the transcript text — drop any quote you can't reproduce verbatim and call submit_segment_analysis again.`;
  }
  if (err instanceof AnthropicSchemaError) {
    return `Your prior tool call did not match the required shape: ${err.message}. Call submit_segment_analysis again with all required fields populated correctly.`;
  }
  if (err instanceof AnthropicError) {
    return `Your prior tool call could not be parsed: ${err.message}. Call submit_segment_analysis again.`;
  }
  return `Your prior tool call was invalid. Call submit_segment_analysis again.`;
}

function buildUserMessage(input: SegmentSummaryInput): string {
  const segmentTitle = input.segment.title ?? "(untitled segment)";
  const segmentDescription = input.segment.description
    ? `Segment description: ${input.segment.description}\n`
    : "";
  return `Podcast: ${input.podcast.name} (${input.podcast.kind})
Episode: ${input.episode.title}
Segment: ${segmentTitle}
${segmentDescription}
Transcript:
${input.segment.transcript}`;
}
