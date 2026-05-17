import "server-only";

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import type { AnthropicClient } from "./client.ts";
import { findToolUse, normalizeQuotes } from "./_helpers.ts";
import { buildNotableTakeCardSystemPrompt } from "./prompts/notable-take-card.ts";
import { serializeBrainForPrompt } from "../team-brain/serialize-for-prompt.ts";
import type { TeamBrain } from "../team-brain/types.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicSchemaError,
  AnthropicTransientError,
} from "./types.ts";

export const NOTABLE_TAKE_CARD_PROMPT_VERSION = "v1";

const TOOL_NAME = "submit_notable_take_card";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit the editorial copy for a notable-take card: title, verbatim quote, framing, and why_it_matters grounded in team brain.",
  input_schema: {
    type: "object" as const,
    required: ["title", "framing", "why_it_matters"],
    properties: {
      title: { type: "string" as const },
      framing: { type: "string" as const },
      quote: { type: ["string", "null"] as const },
      why_it_matters: { type: "string" as const },
    },
  },
};

const TOOL_INPUT_SCHEMA = z.object({
  title: z.string().min(1).max(160),
  framing: z.string().min(1).max(400),
  quote: z.string().min(1).nullable().optional(),
  why_it_matters: z.string().min(1).max(400),
});

const MAX_OUTPUT_TOKENS = 1_000;
const MAX_ATTEMPTS = 2;

export interface NotableTakeCardOutput {
  title: string;
  framing: string;
  /** Verbatim from source pull_quotes; null if no quote surfaced or
   *  every model attempt failed verbatim validation. */
  quote: string | null;
  why_it_matters: string;
}

export interface WriteNotableTakeCardInput {
  teamBrain: TeamBrain;
  voice_display_name: string;
  summary: string;
  /** Pull-quotes available from the source moment. The writer must
   *  pick one verbatim substring (or null). */
  available_pull_quotes: readonly string[];
  /** Novelty rationale — typically "new_voice on topic X" or a
   *  detect-shift rationale. Helps the writer frame why this take
   *  surfaces. */
  novelty_rationale: string | null;
}

export async function writeNotableTakeCard(
  client: AnthropicClient,
  input: WriteNotableTakeCardInput,
): Promise<NotableTakeCardOutput | null> {
  const systemBrain = serializeBrainForPrompt(input.teamBrain);
  const systemRules = buildNotableTakeCardSystemPrompt();
  const userMessage = buildUserMessage(input);

  const allQuotesNormalized = input.available_pull_quotes.map(normalizeQuotes);

  const baseParams: MessageCreateParamsNonStreaming = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [
      { type: "text", text: systemBrain, cache_control: { type: "ephemeral" } },
      { type: "text", text: systemRules, cache_control: { type: "ephemeral" } },
    ],
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  };

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Message;
    try {
      response = await client.createMessage("write_notable_take_card", baseParams);
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(
          `writeNotableTakeCard: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseAndValidate(response, allQuotesNormalized);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  console.error(
    `writeNotableTakeCard: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function buildUserMessage(input: WriteNotableTakeCardInput): string {
  const lines: string[] = [
    `# Voice: ${input.voice_display_name}`,
    ``,
    `## Moment summary`,
    input.summary,
    ``,
    `## Available pull_quotes (use one VERBATIM as quote, or null)`,
  ];
  if (input.available_pull_quotes.length === 0) {
    lines.push("(none — quote must be null)");
  } else {
    for (const q of input.available_pull_quotes) {
      lines.push(`> ${q}`);
    }
  }
  if (input.novelty_rationale) {
    lines.push("");
    lines.push(`## Novelty rationale (why this take surfaces solo)`);
    lines.push(input.novelty_rationale);
  }
  lines.push("");
  lines.push(
    `Write the notable-take card. Submit via the \`${TOOL_NAME}\` tool.`,
  );
  return lines.join("\n");
}

function parseAndValidate(
  message: Message,
  allQuotesNormalized: readonly string[],
): NotableTakeCardOutput {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "write_notable_take_card",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }
  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "write_notable_take_card",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }

  // Verbatim-quote validation. Same graceful degradation as
  // theme-card: drop the offending quote, keep the rest.
  let validQuote: string | null = null;
  if (parsed.data.quote) {
    const normalized = normalizeQuotes(parsed.data.quote);
    if (allQuotesNormalized.some((q) => q.includes(normalized))) {
      validQuote = parsed.data.quote;
    } else {
      console.warn(
        `writeNotableTakeCard: dropping non-verbatim quote; card output kept with quote=null.`,
      );
    }
  }

  return {
    title: parsed.data.title,
    framing: parsed.data.framing,
    quote: validQuote,
    why_it_matters: parsed.data.why_it_matters,
  };
}
