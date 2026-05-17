import "server-only";

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import type { AnthropicClient } from "../anthropic/client.ts";
import { findToolUse } from "../anthropic/_helpers.ts";
import { buildDetectShiftSystemPrompt } from "../anthropic/prompts/detect-shift.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicSchemaError,
  AnthropicTransientError,
} from "../anthropic/types.ts";
import { serializeBrainForPrompt } from "../team-brain/serialize-for-prompt.ts";
import type { TeamBrain } from "../team-brain/types.ts";

import type { ShiftKind, VoicePosition } from "./types.ts";

const TOOL_NAME = "submit_shift_classification";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Classify whether the new take represents a position shift or a restate of a prior position.",
  input_schema: {
    type: "object" as const,
    required: ["classification", "rationale"],
    properties: {
      classification: {
        type: "string" as const,
        enum: ["restate", "position_shift"],
      },
      rationale: { type: "string" as const },
    },
  },
};

const TOOL_INPUT_SCHEMA = z.object({
  classification: z.enum(["restate", "position_shift"]),
  rationale: z.string().min(1).max(500),
});

const MAX_OUTPUT_TOKENS = 256;
const MAX_ATTEMPTS = 2;

export interface ShiftClassification {
  kind: Extract<ShiftKind, "restate" | "position_shift">;
  rationale: string;
}

export interface DetectShiftInput {
  teamBrain: TeamBrain;
  voiceDisplayName: string;
  topicKey: string;
  priorPositions: readonly VoicePosition[];
  newPositionSummary: string;
  newPositionEvidenceQuote: string | null;
}

/**
 * LLM-driven shift detector. Caller has already established that
 * priorPositions is non-empty (otherwise the classification is
 * trivially `new_voice` via SQL — no LLM call needed).
 *
 * Returns null on transient API failure; caller treats null as
 * "default to restate" per the dealbreaker bias.
 */
export async function detectShift(
  client: AnthropicClient,
  input: DetectShiftInput,
): Promise<ShiftClassification | null> {
  if (input.priorPositions.length === 0) {
    throw new Error(
      "detectShift requires at least one prior position; caller should classify new_voice via SQL before invoking",
    );
  }

  const systemBrain = serializeBrainForPrompt(input.teamBrain);
  const systemRules = buildDetectShiftSystemPrompt();
  const userMessage = buildUserMessage(input);

  const baseParams: MessageCreateParamsNonStreaming = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Team brain first (large stable prefix — caches across all
    // shift-detect calls for this team), then the smaller
    // shift-detection rules.
    system: [
      {
        type: "text",
        text: systemBrain,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: systemRules,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  };

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Message;
    try {
      response = await client.createMessage("detect_shift", baseParams);
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(
          `detectShift: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseAndValidate(response);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  console.error(
    `detectShift: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function buildUserMessage(input: DetectShiftInput): string {
  const lines: string[] = [
    `# Voice: ${input.voiceDisplayName}`,
    `# Topic: ${input.topicKey}`,
    ``,
    `## Prior positions on this topic (newest first)`,
  ];
  for (const p of input.priorPositions) {
    lines.push("");
    lines.push(`### ${p.created_at}`);
    lines.push(p.position_summary);
    if (p.evidence_quote) {
      lines.push(`> ${p.evidence_quote}`);
    }
  }
  lines.push("");
  lines.push(`## New take from this voice`);
  lines.push(input.newPositionSummary);
  if (input.newPositionEvidenceQuote) {
    lines.push("");
    lines.push(`> ${input.newPositionEvidenceQuote}`);
  }
  lines.push("");
  lines.push(`Classify the new take versus the prior positions. Submit via the \`${TOOL_NAME}\` tool.`);
  return lines.join("\n");
}

function parseAndValidate(message: Message): ShiftClassification {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "detect_shift",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }
  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "detect_shift",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }
  return {
    kind: parsed.data.classification,
    rationale: parsed.data.rationale,
  };
}
