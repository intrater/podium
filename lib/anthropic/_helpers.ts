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
 * Replace U+2018/2019/201C/201D and a few near-equivalents with their
 * straight-ASCII counterparts so substring fidelity checks ignore the
 * typographic normalization mismatches Particle's transcripts vs the
 * model's pull-quote output routinely exhibit.
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .replace(/…/g, "...");
}
