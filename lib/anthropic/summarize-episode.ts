/**
 * Episode-level rollup summary.
 *
 * Given the segment summaries from a single episode, produces a 2–3
 * sentence rollup that drives the card surface text (R5). Smaller and
 * faster than `summarizeSegment` — just a prose synthesis, no quote
 * fidelity. Mirrors `summarizeSegment`'s retry pattern (single retry
 * via tool_result on schema failure) so caller behavior is symmetric.
 */

import "server-only";

import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import type { AnthropicClient } from "./client.ts";
import { findToolUse } from "./summarize.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicSchemaError,
  AnthropicTransientError,
  type EpisodeSummary,
  type EpisodeSummaryInput,
} from "./types.ts";

const TOOL_NAME = "submit_episode_summary";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description: "Submit a 2-3 sentence rollup that captures the episode's relevant content for the team.",
  input_schema: {
    type: "object" as const,
    required: ["summary"],
    properties: {
      summary: { type: "string" as const },
    },
  },
};

const TOOL_INPUT_SCHEMA = z.object({
  summary: z.string().min(1),
});

const MAX_OUTPUT_TOKENS = 256;
const MAX_ATTEMPTS = 2;

export async function summarizeEpisode(
  client: AnthropicClient,
  input: EpisodeSummaryInput,
): Promise<EpisodeSummary | null> {
  if (input.segmentSummaries.length === 0) return null;

  const systemPrompt = buildEpisodeSystemPrompt(input.team.name);
  const userMessage = buildEpisodeUserMessage(input);

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
      response = await client.createMessage("summarize_episode", {
        ...baseParams,
        messages,
      });
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(
          `summarizeEpisode: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseEpisodeResponse(response);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) {
        const toolUse = findToolUse(response, TOOL_NAME);
        const corrective = `Your prior tool call did not match the required shape: ${lastError.message}. Call ${TOOL_NAME} again with the summary field populated.`;
        if (toolUse) {
          const userContent: ContentBlockParam[] = [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              is_error: true,
              content: corrective,
            },
          ];
          messages = [
            ...baseParams.messages,
            { role: "assistant", content: response.content },
            { role: "user", content: userContent },
          ];
        } else {
          messages = [
            ...baseParams.messages,
            { role: "assistant", content: response.content },
            { role: "user", content: corrective },
          ];
        }
        continue;
      }
    }
  }

  console.error(
    `summarizeEpisode: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function parseEpisodeResponse(message: Message): EpisodeSummary {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "summarize_episode",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }
  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "summarize_episode",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }
  return { summary: parsed.data.summary };
}

function buildEpisodeSystemPrompt(teamName: string): string {
  return `You are a sports content editor. Given a list of segment summaries from a single podcast episode about the ${teamName}, write a 2-3 sentence rollup that captures the episode's relevant content for fans.

Submit the rollup through the submit_episode_summary tool.

Rules:

1. Lead with the most substantive take across the segments. The rollup is the headline of the card; if a fan reads only the rollup, they should know what mattered.
2. Avoid generic framing ("This episode covers..." / "In this episode the hosts discuss..."). Open with content.
3. Match the analytical voice of the segments — no editorializing, no padding.
4. 2-3 sentences total. Hard ceiling: 80 words.
5. If multiple segments make conflicting claims, surface the disagreement (it's interesting). Don't paper over it.
6. Don't invent facts. Synthesize only what the segments say.
7. Use specific names and numbers from the segments when they exist.

Quality bar: a fan who reads only the rollup should be able to decide whether the rest of the card is worth opening, and have an honest summary of the episode's stance on the team.`;
}

function buildEpisodeUserMessage(input: EpisodeSummaryInput): string {
  const segments = input.segmentSummaries
    .map((s, i) => `Segment ${i + 1}${s.title ? ` — ${s.title}` : ""}:\n${s.summary}`)
    .join("\n\n");
  return `Podcast: ${input.podcast.name}
Episode: ${input.episode.title}

Segment summaries:

${segments}`;
}
