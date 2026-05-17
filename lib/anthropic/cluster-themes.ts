/**
 * Theme clustering via Claude Haiku tool use (Stage 2 of v2).
 *
 * Takes a list of pre-extracted moments and asks the model to group
 * them into themes. Mirrors the validation pipeline from
 * `extract-episode-moments.ts`:
 *
 *   1. Parse the `submit_theme_clustering` tool call.
 *   2. Validate the shape via zod.
 *   3. Verify every segment_id in every theme came from the input
 *      moments list (the model can't invent ids).
 *   4. Verify every input moment is assigned to exactly one theme
 *      (no orphans, no duplicates).
 *   5. On any validation failure, retry once with a tool_result block.
 *   6. After two failures, return null and let the caller decide.
 */

import "server-only";

import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import type { AnthropicClient } from "./client.ts";
import { findToolUse } from "./_helpers.ts";
import { buildThemeClusteringSystemPrompt } from "./prompts/theme-clustering.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicSchemaError,
  AnthropicTransientError,
} from "./types.ts";
import type {
  MomentForClustering,
  RawThemeCandidate,
} from "../themes/types.ts";

const TOOL_NAME = "submit_theme_clustering";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit the clustered themes for this day's moments. Every input segment_id must appear in exactly one theme's member_segment_ids. Themes with one member are valid.",
  input_schema: {
    type: "object" as const,
    required: ["themes"],
    properties: {
      themes: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["label", "member_segment_ids", "surfacing_entities"],
          properties: {
            label: { type: "string" as const },
            member_segment_ids: {
              type: "array" as const,
              items: { type: "string" as const },
              minItems: 1,
            },
            surfacing_entities: {
              type: "array" as const,
              items: { type: "string" as const },
              minItems: 1,
              maxItems: 5,
            },
          },
        },
      },
    },
  },
};

const RAW_THEME_SCHEMA = z.object({
  label: z.string().min(1).max(80),
  member_segment_ids: z.array(z.string().min(1)).min(1),
  surfacing_entities: z.array(z.string().min(1)).min(1).max(5),
});

const TOOL_INPUT_SCHEMA = z.object({
  themes: z.array(RAW_THEME_SCHEMA),
});

const MAX_OUTPUT_TOKENS = 4_096;
const MAX_ATTEMPTS = 2;

export interface ClusterThemesInput {
  /** Team identifier — passed through to tracked-call telemetry. */
  team_id: string;
  /** All moments to cluster. Each must appear in exactly one output theme. */
  moments: readonly MomentForClustering[];
  /** Date label for the day's window (YYYY-MM-DD). Used in user-message
   *  framing so the model has a context anchor. */
  date_label: string;
  /** Team display name used in user-message framing only. */
  team_name: string;
}

export async function clusterThemes(
  client: AnthropicClient,
  input: ClusterThemesInput,
): Promise<readonly RawThemeCandidate[] | null> {
  if (input.moments.length === 0) return [];

  const systemPrompt = buildThemeClusteringSystemPrompt();
  const userMessage = buildUserMessage(input);
  const validSegmentIds = new Set(input.moments.map((m) => m.segment_id));

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
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  };

  let messages = baseParams.messages;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Message;
    try {
      response = await client.createMessage("cluster_themes", {
        ...baseParams,
        messages,
      });
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(
          `clusterThemes: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseAndValidate(response, validSegmentIds);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) {
        messages = buildRetryMessages(baseParams.messages, response, lastError);
        continue;
      }
    }
  }

  console.error(
    `clusterThemes: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function buildUserMessage(input: ClusterThemesInput): string {
  const lines: string[] = [
    `# Team: ${input.team_name}`,
    `# Date: ${input.date_label}`,
    ``,
    `Below are the moments extracted today across the curated podcast catalog. Cluster them into themes per the rules. Every segment_id must appear in exactly one theme.`,
    ``,
    `# Moments`,
  ];
  for (const m of input.moments) {
    lines.push("");
    lines.push(`## segment_id: ${m.segment_id}`);
    lines.push(`- voice: ${m.voice_id ?? "(no voice — Tier B/C show)"}`);
    lines.push(`- topic_key: ${m.topic_key}`);
    lines.push(
      `- entities: ${m.surfacing_entities.length > 0 ? m.surfacing_entities.join(", ") : "(none surfaced)"}`,
    );
    lines.push(`- summary: ${m.summary}`);
    if (m.pull_quote) {
      lines.push(`- pull_quote: "${m.pull_quote}"`);
    }
  }
  return lines.join("\n");
}

function parseAndValidate(
  message: Message,
  validSegmentIds: Set<string>,
): readonly RawThemeCandidate[] {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "cluster_themes",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }

  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "cluster_themes",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }

  // segment_id validation: every claimed member must be a real input
  // segment_id. The model can't invent ids.
  const claimed = new Set<string>();
  const unknown: string[] = [];
  const duplicates: string[] = [];
  for (const theme of parsed.data.themes) {
    for (const id of theme.member_segment_ids) {
      if (!validSegmentIds.has(id)) {
        unknown.push(id);
      }
      if (claimed.has(id)) {
        duplicates.push(id);
      }
      claimed.add(id);
    }
  }
  if (unknown.length > 0) {
    throw new AnthropicSchemaError(
      "cluster_themes",
      `Themes claim ${unknown.length} segment_id(s) not in the input: ${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? "..." : ""}`,
    );
  }
  if (duplicates.length > 0) {
    throw new AnthropicSchemaError(
      "cluster_themes",
      `${duplicates.length} segment_id(s) appear in multiple themes: ${duplicates.slice(0, 3).join(", ")}${duplicates.length > 3 ? "..." : ""}`,
    );
  }

  // Orphan check: every input must be assigned.
  const orphans: string[] = [];
  for (const id of validSegmentIds) {
    if (!claimed.has(id)) orphans.push(id);
  }
  if (orphans.length > 0) {
    throw new AnthropicSchemaError(
      "cluster_themes",
      `${orphans.length} input moment(s) not assigned to any theme: ${orphans.slice(0, 3).join(", ")}${orphans.length > 3 ? "..." : ""}`,
    );
  }

  return parsed.data.themes;
}

function buildRetryMessages(
  initialMessages: MessageCreateParamsNonStreaming["messages"],
  failedResponse: Message,
  error: Error,
): MessageCreateParamsNonStreaming["messages"] {
  const toolUse = findToolUse(failedResponse, TOOL_NAME);
  const toolUseId = (toolUse as ToolUseBlock | null)?.id;
  if (!toolUseId) return initialMessages;

  const retryContent: ContentBlockParam[] = [
    {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: `Your previous response failed validation: ${error.message}. Re-run the clustering. Every segment_id in the original moments list must appear in exactly one theme's member_segment_ids — no inventing ids, no orphans, no duplicates.`,
      is_error: true,
    },
  ];
  return [
    ...initialMessages,
    { role: "assistant", content: failedResponse.content },
    { role: "user", content: retryContent },
  ];
}
