/**
 * Per-episode moment extraction via Claude Haiku tool use (U4 of the
 * cost-optimization plan).
 *
 * Replaces the per-segment fan-out (`summarizeSegment`) — one Claude call
 * covers all relevant moments in a single episode. Mirrors the validation
 * pipeline from `summarize.ts`:
 *
 *   1. Parse the `submit_episode_extraction` tool call.
 *   2. Validate the shape via zod.
 *   3. Verify every pull_quote in every moment is a verbatim substring of
 *      the transcript (after Unicode-quote normalization).
 *   4. Verify each moment's `particle_segment_id` came from the anchors
 *      list — the persistence layer relies on this for idempotency.
 *   5. On any validation failure, retry once with a tool_result block.
 *   6. After two failures, return null and let the caller surface a degraded
 *      card (or skip the episode entirely).
 *
 * Empty moments array is valid output — the episode has no relevant content.
 * Caller treats this as "drop the episode, no card created" same as
 * `summarizeSegment` returning null today.
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
import { findToolUse, normalizeQuotes } from "./_helpers.ts";
import { buildEpisodeExtractionSystemPrompt } from "./prompts/episode-extraction.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicError,
  AnthropicSchemaError,
  AnthropicTransientError,
  type EpisodeExtractionInput,
  type EpisodeExtractionOutput,
  type EpisodeMoment,
} from "./types.ts";

const TOOL_NAME = "submit_episode_extraction";

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit the relevant moments extracted from this podcast episode, plus an episode-level rollup. Set moments=[] and episode_rollup='' if no relevant content is present.",
  input_schema: {
    type: "object" as const,
    required: ["moments", "episode_rollup"],
    properties: {
      moments: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: [
            "particle_segment_id",
            "start_seconds",
            "end_seconds",
            "summary",
            "pull_quotes",
            "bullets",
            "surfacing_entities",
          ],
          properties: {
            particle_segment_id: { type: "string" as const },
            start_seconds: { type: "integer" as const },
            end_seconds: { type: "integer" as const },
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
      },
      episode_rollup: { type: "string" as const },
    },
  },
};

const MOMENT_SCHEMA = z.object({
  particle_segment_id: z.string().min(1),
  start_seconds: z.number().int().nonnegative(),
  end_seconds: z.number().int().positive(),
  summary: z.string().min(1),
  pull_quotes: z.array(z.string()).max(3),
  bullets: z.array(z.string()).min(3).max(5),
  surfacing_entities: z.array(z.string()),
});

const TOOL_INPUT_SCHEMA = z.object({
  moments: z.array(MOMENT_SCHEMA),
  episode_rollup: z.string(),
});

// 4,096 max output tokens — chosen to handle long episodes with 10+ moments
// without truncation. v0 A/B run hit 2,048 cap on an 11-segment episode;
// 4,096 leaves headroom while costing essentially the same on real usage
// (output tokens are billed on what's emitted, not the cap).
const MAX_OUTPUT_TOKENS = 4_096;
const MAX_ATTEMPTS = 2;

export async function extractEpisodeMoments(
  client: AnthropicClient,
  input: EpisodeExtractionInput,
): Promise<EpisodeExtractionOutput | null> {
  const systemPrompt = buildEpisodeExtractionSystemPrompt(input.team);
  const userMessage = buildUserMessage(input);
  const anchorIds = new Set(input.anchors.map((a) => a.particle_segment_id));
  const fullTranscriptText = input.transcript.map((l) => l.text).join(" ");
  const normalizedTranscript = normalizeQuotes(fullTranscriptText);

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
    // cache_control on both system AND tools extends the cacheable prefix
    // to cover both. The prompt is sized to clear Haiku 4.5's 4,096-token
    // minimum (see docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md).
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  };

  let messages = baseParams.messages;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Message;
    try {
      response = await client.createMessage("extract_episode_moments", {
        ...baseParams,
        messages,
      });
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(
          `extractEpisodeMoments: transient error on attempt ${attempt}: ${err.message}`,
        );
        return null;
      }
      throw err;
    }

    try {
      return parseAndValidate(response, normalizedTranscript, anchorIds);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) {
        messages = buildRetryMessages(baseParams.messages, response, lastError);
        continue;
      }
    }
  }

  console.error(
    `extractEpisodeMoments: returning null after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`,
  );
  return null;
}

function parseAndValidate(
  message: Message,
  normalizedTranscript: string,
  anchorIds: Set<string>,
): EpisodeExtractionOutput {
  const toolUse = findToolUse(message, TOOL_NAME);
  if (!toolUse) {
    throw new AnthropicSchemaError(
      "extract_episode_moments",
      `Response missing ${TOOL_NAME} tool_use block`,
    );
  }

  const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AnthropicSchemaError(
      "extract_episode_moments",
      `Tool input failed shape validation: ${parsed.error.message}`,
    );
  }

  // Anchor-id validation is fatal in mentions mode: a moment whose
  // particle_segment_id isn't in our anchors list breaks the persistence
  // layer's FK assumption. We retry on this to let the model self-correct.
  //
  // In list-episodes discovery mode (U4 of the Particle API
  // optimizations plan), anchors are empty — the pipeline overwrites
  // each moment's particle_segment_id with a synthetic
  // `${episode_id}:${start}-${end}` after extraction. Skip the check
  // entirely when there are no anchors to match against.
  if (anchorIds.size > 0) {
    const unknownAnchors: string[] = [];
    for (const moment of parsed.data.moments) {
      if (!anchorIds.has(moment.particle_segment_id)) {
        unknownAnchors.push(moment.particle_segment_id);
      }
    }
    if (unknownAnchors.length > 0) {
      throw new AnthropicSchemaError(
        "extract_episode_moments",
        `Moments reference particle_segment_id(s) not in the anchors list: ${unknownAnchors.join(", ")}`,
      );
    }
  }

  // Pull quote fidelity: graceful degradation, not fatal. The model
  // sometimes paraphrases or smooths quotes even with strict prompt
  // language. Dropping the offending quote and keeping the rest of the
  // moment (summary, bullets, valid quotes) preserves the card. A
  // moment with zero quotes is still useful — it has the summary and
  // bullets. Failing the whole episode for one bad quote means real
  // 49ers content disappears from the digest entirely, which is the
  // worse failure mode.
  let droppedQuoteCount = 0;
  const validatedMoments: EpisodeMoment[] = parsed.data.moments.map((moment) => {
    const validQuotes: string[] = [];
    const droppedQuotes: string[] = [];
    for (const quote of moment.pull_quotes) {
      if (normalizedTranscript.includes(normalizeQuotes(quote))) {
        validQuotes.push(quote);
      } else {
        droppedQuotes.push(quote);
      }
    }
    if (droppedQuotes.length > 0) {
      droppedQuoteCount += droppedQuotes.length;
      // Log the first dropped quote per moment so prompt-iteration
      // debugging doesn't require re-running.
      console.warn(
        `extract_episode_moments: dropped ${droppedQuotes.length} non-verbatim quote(s) from moment ${moment.particle_segment_id}. Example: "${droppedQuotes[0].slice(0, 160)}"`,
      );
    }
    return { ...moment, pull_quotes: validQuotes };
  });

  if (droppedQuoteCount > 0) {
    console.warn(
      `extract_episode_moments: total ${droppedQuoteCount} quote(s) dropped across ${parsed.data.moments.length} moment(s) this call.`,
    );
  }

  return {
    moments: validatedMoments as readonly EpisodeMoment[],
    episode_rollup: parsed.data.episode_rollup,
  };
}

function buildRetryMessages(
  baseMessages: MessageCreateParamsNonStreaming["messages"],
  response: Message,
  err: Error,
): MessageCreateParamsNonStreaming["messages"] {
  const toolUse = findToolUse(response, TOOL_NAME);
  const correctiveText = correctiveMessage(err);

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
      tool_use_id: (toolUse as ToolUseBlock).id,
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
  if (err instanceof AnthropicSchemaError) {
    return `Your prior tool call did not match the required shape: ${err.message}. Call ${TOOL_NAME} again with the corrections applied.`;
  }
  if (err instanceof AnthropicError) {
    return `Your prior tool call could not be parsed: ${err.message}. Call ${TOOL_NAME} again.`;
  }
  return `Your prior tool call was invalid. Call ${TOOL_NAME} again.`;
}

function buildUserMessage(input: EpisodeExtractionInput): string {
  const lines = input.transcript
    .map((line) => {
      const start = Math.floor(line.start_seconds);
      const m = Math.floor(start / 60);
      const s = (start % 60).toString().padStart(2, "0");
      const speaker = line.speaker ? `${line.speaker}: ` : "";
      return `[${m}:${s}] ${speaker}${line.text}`;
    })
    .join("\n");

  const publishedLine = input.episode.published_at
    ? `Published: ${input.episode.published_at}\n`
    : "";

  // No anchors → list-episodes discovery mode (U4). Tell Claude to
  // identify its own moments from the transcript and use any unique
  // string per moment for particle_segment_id (the pipeline overwrites
  // it with a synthetic `${episode_id}:${start}-${end}` value before
  // persistence, so the value Claude returns is throwaway).
  if (input.anchors.length === 0) {
    return `Podcast: ${input.podcast.name} (${input.podcast.kind})
Episode: ${input.episode.title}
${publishedLine}
No pre-flagged anchors are provided for this episode. Read the full transcript and identify the relevant moments yourself. Use any unique string per moment for the \`particle_segment_id\` field (e.g., \`auto-${"${start_seconds}-${end_seconds}"}\`) — the post-processor replaces it before storage.

Full episode transcript (line-level, with [m:ss] episode-absolute timestamps and speaker names):

${lines}`;
  }

  const anchorBlocks = input.anchors
    .map((a) => {
      const startM = Math.floor(a.start_seconds / 60);
      const startS = (Math.floor(a.start_seconds) % 60).toString().padStart(2, "0");
      const endM = Math.floor(a.end_seconds / 60);
      const endS = (Math.floor(a.end_seconds) % 60).toString().padStart(2, "0");
      const titlePart = a.title ? ` — "${a.title}"` : "";
      const entitiesPart =
        a.surfacing_entities && a.surfacing_entities.length > 0
          ? ` (entities: ${a.surfacing_entities.join(", ")})`
          : "";
      return `  - particle_segment_id=${a.particle_segment_id}, range=${startM}:${startS}–${endM}:${endS}, match=${a.match_source}${titlePart}${entitiesPart}`;
    })
    .join("\n");

  return `Podcast: ${input.podcast.name} (${input.podcast.kind})
Episode: ${input.episode.title}
${publishedLine}
Anchors (Particle-flagged segments — use these particle_segment_id values when populating moments):
${anchorBlocks}

Full episode transcript (line-level, with [m:ss] episode-absolute timestamps and speaker names):

${lines}`;
}
