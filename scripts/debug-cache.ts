/**
 * Diagnostic for U2 cache-miss bug (plan: 2026-05-12-001, Phase A pickup).
 *
 * Reproduces the exact baseParams shape from lib/anthropic/summarize.ts in
 * isolation — same system prompt builder, same tool definition shape, same
 * cache_control placement — and runs two back-to-back calls with raw SDK.
 *
 * What it tells us:
 *   - The full outbound request body (logged once, system text truncated for
 *     readability) — confirms whether `tools[0].cache_control` survives the
 *     spread and lands in the JSON sent to Anthropic (suspect #1).
 *   - usage.cache_creation_input_tokens and usage.cache_read_input_tokens
 *     on both calls — call 1 should create the cache, call 2 should hit it.
 *   - If both are 0 on both calls, the bug is upstream of our wrapper —
 *     either the marker is malformed in a way the API silently ignores, or
 *     prompt caching isn't enabled for this account/model combination.
 *
 * Run:
 *   node --env-file=.env.local --experimental-transform-types --no-warnings=ExperimentalWarning scripts/debug-cache.ts
 *
 * Cost: ~$0.01 (two calls @ ~2,000 prefix tokens + ~50 output tokens).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";

import { buildSegmentSummarySystemPrompt } from "../lib/anthropic/prompts/segment-summary.ts";

const MODEL = "claude-haiku-4-5";
const TOOL_NAME = "submit_segment_analysis";

// Same shape as lib/anthropic/summarize.ts TOOL_DEFINITION.
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

// Mirror the actual production team context for the 49ers (slimmed list).
const team = {
  name: "San Francisco 49ers",
  sport: "nfl",
  entities: [
    "brock-purdy",
    "trent-williams",
    "san-francisco-49ers",
    "deebo-samuel",
    "george-kittle",
    "christian-mccaffrey",
  ],
  storylines: ["49ers offseason moves and free agency"],
};

const systemPrompt = buildSegmentSummarySystemPrompt(team);

function buildParams(userText: string): MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userText }],
  };
}

function summarizeUsage(label: string, m: Message) {
  const u = m.usage;
  console.log(
    `\n${label}: input=${u.input_tokens}  output=${u.output_tokens}  cache_creation=${u.cache_creation_input_tokens ?? "null"}  cache_read=${u.cache_read_input_tokens ?? "null"}`,
  );
}

async function runPair(
  sdk: Anthropic,
  label: string,
  p1: MessageCreateParamsNonStreaming,
  p2: MessageCreateParamsNonStreaming,
) {
  console.log(`\n========== ${label} ==========`);
  const r1 = await sdk.messages.create(p1);
  summarizeUsage("call 1", r1);
  await new Promise((r) => setTimeout(r, 1_000));
  const r2 = await sdk.messages.create(p2);
  summarizeUsage("call 2", r2);
  return { r1, r2 };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY missing from env");
    process.exit(1);
  }
  const sdk = new Anthropic({ apiKey, timeout: 30_000 });

  // Two distinct user messages so the model can't reuse output but the
  // cacheable prefix (system + tools) is identical.
  const params1 = buildParams("Transcript:\nMina Kimes: I think Purdy looks more comfortable in the pocket.");
  const params2 = buildParams("Transcript:\nMina Kimes: Trent Williams is still Trent Williams.");

  // Diagnostic dump of the FIRST call's params, with the long system text
  // truncated so the cache_control fields are easy to spot.
  const dump = JSON.parse(JSON.stringify(params1)) as Record<string, unknown> & {
    system?: Array<{ text?: string }>;
  };
  if (Array.isArray(dump.system) && dump.system[0]?.text) {
    const t = dump.system[0].text;
    dump.system[0].text = `[${t.length} chars] ${t.slice(0, 120)}…`;
  }
  console.log("=== outbound params shape (system text truncated) ===");
  console.log(JSON.stringify(dump, null, 2));

  // ── Variant A: production shape (system + tools cache_control)
  const variantA = await runPair(sdk, "Variant A — production shape (system+tools cache_control)", params1, params2);

  // ── Variant B: top-level cache_control alternative (suspect #2)
  function stripCC(p: MessageCreateParamsNonStreaming): MessageCreateParamsNonStreaming {
    return {
      ...p,
      system: [{ type: "text", text: (p.system as Array<{ text: string }>)[0].text }],
      tools: [{ ...TOOL_DEFINITION }],
      // top-level marker — SDK auto-applies it to the last cacheable block
      cache_control: { type: "ephemeral" },
    };
  }
  const variantB = await runPair(
    sdk,
    "Variant B — top-level cache_control auto-apply",
    stripCC(params1),
    stripCC(params2),
  );

  // ── Variant C: padded prefix (rules out Haiku's 2048-token minimum if A failed)
  // Pad the system text with filler so the prefix is comfortably over any
  // model's minimum-cache threshold.
  const padding = "This is filler text for token-count testing. ".repeat(500);
  const paddedSystem = systemPrompt + "\n\n# Padding (ignore)\n\n" + padding;
  function padded(userText: string): MessageCreateParamsNonStreaming {
    return {
      ...buildParams(userText),
      system: [
        {
          type: "text",
          text: paddedSystem,
          cache_control: { type: "ephemeral" },
        },
      ],
    };
  }
  const variantC = await runPair(
    sdk,
    "Variant C — padded prefix (~5,000 prefix tokens)",
    padded("Transcript:\nMina Kimes: Purdy looks comfortable."),
    padded("Transcript:\nMina Kimes: Trent Williams is great."),
  );

  console.log("\n========== summary ==========");
  const sum = (label: string, r1: Message, r2: Message) => {
    const w = r1.usage.cache_creation_input_tokens ?? 0;
    const rRead = r2.usage.cache_read_input_tokens ?? 0;
    const inputTokens = r1.usage.input_tokens;
    console.log(
      `${label}: input≈${inputTokens}  call1 cache_creation=${w}  call2 cache_read=${rRead}  ${w > 0 && rRead > 0 ? "✓ CACHE WORKS" : "✗ CACHE OFF"}`,
    );
  };
  sum("A (system+tools markers)    ", variantA.r1, variantA.r2);
  sum("B (top-level cache_control) ", variantB.r1, variantB.r2);
  sum("C (padded ~5k prefix)       ", variantC.r1, variantC.r2);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
