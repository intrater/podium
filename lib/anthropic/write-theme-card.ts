import "server-only";

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import type { AnthropicClient } from "./client.ts";
import { findToolUse, normalizeQuotes } from "./_helpers.ts";
import { buildThemeCardSystemPrompt } from "./prompts/theme-card.ts";
import { serializeBrainForPrompt } from "../team-brain/serialize-for-prompt.ts";
import type { TeamBrain } from "../team-brain/types.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicSchemaError,
  AnthropicTransientError,
} from "./types.ts";

/** Card-writer prompt-shape version. Bump on any structural change to
 *  the tool definition or output expectations. */
export const THEME_CARD_PROMPT_VERSION = "v1";

const TOOL_NAME = "submit_theme_card";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit the editorial copy for a theme card: title, lede, per-voice contributions with verbatim quotes, and optional delta copy.",
  input_schema: {
    type: "object" as const,
    required: ["title", "lede", "voice_contributions"],
    properties: {
      title: { type: "string" as const },
      lede: { type: "string" as const },
      voice_contributions: {
        type: "array" as const,
        minItems: 1,
        items: {
          type: "object" as const,
          required: ["voice_id", "framing"],
          properties: {
            voice_id: { type: "string" as const },
            framing: { type: "string" as const },
            quote: { type: ["string", "null"] as const },
          },
        },
      },
      delta_copy: { type: ["string", "null"] as const },
    },
  },
};

const VOICE_CONTRIB_SCHEMA = z.object({
  voice_id: z.string().min(1),
  framing: z.string().min(1).max(400),
  quote: z.string().min(1).nullable(),
});

const TOOL_INPUT_SCHEMA = z.object({
  title: z.string().min(1).max(160),
  lede: z.string().min(1).max(500),
  voice_contributions: z.array(VOICE_CONTRIB_SCHEMA).min(1),
  delta_copy: z.string().max(500).nullable().optional(),
});

const MAX_OUTPUT_TOKENS = 1_500;
const MAX_ATTEMPTS = 2;

export interface VoiceContribution {
  voice_id: string;
  framing: string;
  /** Verbatim from the moment's pull_quotes; null if no quote was
   *  surfaced for this voice. */
  quote: string | null;
}

export interface ThemeCardOutput {
  title: string;
  lede: string;
  voice_contributions: readonly VoiceContribution[];
  delta_copy: string | null;
}

export interface ThemeCardInputMember {
  voice_id: string;
  voice_display_name: string;
  summary: string;
  /** All pull_quotes available for this voice in the cluster. Quote
   *  validation forces the writer to use a verbatim substring of any
   *  of these. */
  available_pull_quotes: readonly string[];
}

export interface WriteThemeCardInput {
  teamBrain: TeamBrain;
  theme_label: string;
  theme_surfacing_entities: readonly string[];
  /** Most-recent contributing voices, ordered Tier-A first. The
   *  writer is told to prioritize these for voice_contributions. */
  members: readonly ThemeCardInputMember[];
  /** Novelty gate rationale (when the gate fired position_shift or
   *  new_voice). Null when only first_surfacing. */
  novelty_rationale: string | null;
}

export async function writeThemeCard(
  client: AnthropicClient,
  input: WriteThemeCardInput,
): Promise<ThemeCardOutput | null> {
  const systemBrain = serializeBrainForPrompt(input.teamBrain);
  const systemRules = buildThemeCardSystemPrompt();
  const userMessage = buildUserMessage(input);

  // Quote-validation reference: union of all pull_quotes across all
  // members. Card writer must use VERBATIM substrings.
  const allQuotes = input.members
    .flatMap((m) => m.available_pull_quotes)
    .map(normalizeQuotes);

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
      response = await client.createMessage("write_theme_card", baseParams);
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(
          `writeThemeCard: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseAndValidate(response, allQuotes);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  console.error(
    `writeThemeCard: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function buildUserMessage(input: WriteThemeCardInput): string {
  const lines: string[] = [
    `# Theme: ${input.theme_label}`,
    `# Surfacing entities: ${input.theme_surfacing_entities.join(", ")}`,
    ``,
  ];
  if (input.novelty_rationale) {
    lines.push(`## Novelty gate rationale (use for delta_copy)`);
    lines.push(input.novelty_rationale);
    lines.push("");
  }
  lines.push(`## Voice contributions`);
  for (const m of input.members) {
    lines.push("");
    lines.push(`### voice_id: ${m.voice_id} — ${m.voice_display_name}`);
    lines.push(`Summary: ${m.summary}`);
    if (m.available_pull_quotes.length > 0) {
      lines.push("Available pull_quotes (use one VERBATIM as quote, or null):");
      for (const q of m.available_pull_quotes) {
        lines.push(`  > ${q}`);
      }
    } else {
      lines.push("Available pull_quotes: (none — quote must be null)");
    }
  }
  lines.push("");
  lines.push(`Write the theme card. Submit via the \`${TOOL_NAME}\` tool.`);
  return lines.join("\n");
}

function parseAndValidate(
  message: Message,
  allQuotesNormalized: readonly string[],
): ThemeCardOutput {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "write_theme_card",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }
  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "write_theme_card",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }

  // Verbatim-quote validation. Each contribution's quote must be a
  // substring of one of the available pull_quotes (after Unicode-
  // quote normalization). Quote-failure-as-graceful-degradation:
  // drop the offending quote, keep the contribution (matches
  // extract-episode-moments.ts pattern).
  const cleaned: VoiceContribution[] = [];
  let droppedQuotes = 0;
  for (const v of parsed.data.voice_contributions) {
    if (v.quote === null) {
      cleaned.push({ voice_id: v.voice_id, framing: v.framing, quote: null });
      continue;
    }
    const normalized = normalizeQuotes(v.quote);
    const isVerbatim = allQuotesNormalized.some((q) => q.includes(normalized));
    if (isVerbatim) {
      cleaned.push({ voice_id: v.voice_id, framing: v.framing, quote: v.quote });
    } else {
      droppedQuotes += 1;
      cleaned.push({ voice_id: v.voice_id, framing: v.framing, quote: null });
    }
  }
  if (droppedQuotes > 0) {
    console.warn(
      `writeThemeCard: dropped ${droppedQuotes} non-verbatim quote(s); card output kept with quote=null on those.`,
    );
  }

  return {
    title: parsed.data.title,
    lede: parsed.data.lede,
    voice_contributions: cleaned,
    delta_copy: parsed.data.delta_copy ?? null,
  };
}
