/**
 * Shared helpers used by the Anthropic call modules. Kept separate so
 * the extraction module doesn't have to depend on a sibling summarizer.
 */

import "server-only";

import type { Message, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

/**
 * Find the first `tool_use` content block matching the given tool name.
 * Returns undefined if the response didn't include a tool call.
 */
export function findToolUse(message: Message, toolName: string): ToolUseBlock | undefined {
  return message.content.find(
    (block): block is ToolUseBlock => block.type === "tool_use" && block.name === toolName,
  );
}

/**
 * Normalize text for substring-based quote fidelity checks.
 *
 * Pull quotes from the LLM need to match transcript text from Particle.
 * The LLM is faithful to content but drifts on surface: smooths
 * filler stutters, collapses speaker turn pauses, adjusts punctuation,
 * smart-quotes vs straight. Particle transcripts add their own noise:
 * variable whitespace, "[crosstalk]" markers, capitalization of
 * sentence-starts the LLM may not preserve when pulling mid-sentence.
 *
 * The aggressive normalization here strips all non-alphanumeric chars
 * except apostrophes (preserving contractions like "don't" → "don't"),
 * lowercases, collapses whitespace. The substring check after this
 * pass tolerates essentially all cosmetic drift. It only fails when
 * the quote contains words the transcript doesn't, which is the
 * fabrication case we actually want to flag.
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    // Strip everything that isn't a letter, number, apostrophe, or
    // whitespace. Apostrophes preserved so "don't" / "didn't" still
    // round-trip cleanly. Apostrophe inside word vs at end (like
    // possessive "Jones'") doesn't break the substring check because
    // the original transcript would have the same character.
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
