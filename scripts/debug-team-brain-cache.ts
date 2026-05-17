/**
 * Cache-prefix verification for the seeded 49ers team brain.
 *
 * The brain serves double duty in v2: grounds the voice on every Claude
 * call AND clears Haiku 4.5's 4,096-token prompt-cache minimum
 * (see docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md).
 *
 * This script makes two back-to-back Anthropic calls using the brain
 * as a cache-controlled system prompt and prints the cache token
 * counts so we can confirm:
 *
 *   - Call 1: `cache_creation_input_tokens` > 0  (cache written)
 *   - Call 2: `cache_read_input_tokens`      > 0  (cache hit)
 *
 * If both are 0 on both calls, the brain is below the floor and the
 * seed needs more content. ~$0.005 cost; safe to re-run.
 *
 * Run:
 *   node --env-file=.env.local --experimental-transform-types --no-warnings=ExperimentalWarning scripts/debug-team-brain-cache.ts
 */

import Anthropic from "@anthropic-ai/sdk";

import { serializeBrainForPrompt } from "../lib/team-brain/serialize-for-prompt.ts";
import { niners49ers } from "./seed-team-brain.ts";

const MODEL = "claude-haiku-4-5";

async function main() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const brain = serializeBrainForPrompt({
    ...niners49ers,
    updated_at: "2026-05-17T00:00:00Z",
  });
  console.log(`Serialized brain: ${brain.length} chars (~${Math.round(brain.length / 4)} tokens, chars/4 approximation)`);

  const baseParams = {
    model: MODEL,
    max_tokens: 50,
    system: [
      {
        type: "text" as const,
        text: brain,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user" as const,
        content:
          "In one sentence, summarize the 49ers' biggest narrative arc right now.",
      },
    ],
  };

  console.log("\nCall 1 — expect cache_creation > 0, cache_read = 0:");
  const r1 = await anthropic.messages.create(baseParams);
  printUsage(r1.usage);

  console.log("\nCall 2 — expect cache_creation = 0, cache_read > 0:");
  const r2 = await anthropic.messages.create(baseParams);
  printUsage(r2.usage);

  // Pass conditions:
  // - Fresh cache (no recent runs): r1 writes, r2 reads.
  // - Warm cache (within ~5min of a prior run): both r1 and r2 read.
  // Either way, ANY non-zero `cache_read_input_tokens` confirms the
  // brain prefix is large enough to be cached. The failure shape is
  // BOTH calls returning 0 for cache_read AND 0 for cache_creation —
  // that means the prefix never made it into the cache at all.
  const c1Create = r1.usage.cache_creation_input_tokens ?? 0;
  const c1Read = r1.usage.cache_read_input_tokens ?? 0;
  const c2Create = r2.usage.cache_creation_input_tokens ?? 0;
  const c2Read = r2.usage.cache_read_input_tokens ?? 0;
  const cacheFired = c1Create > 0 || c1Read > 0 || c2Create > 0 || c2Read > 0;

  console.log(`\n${cacheFired ? "✓ PASS" : "✗ FAIL"} — prompt cache ${cacheFired ? "is firing" : "did NOT fire"} on Haiku 4.5.`);
  if (!cacheFired) {
    console.log(
      "Brain prefix is below the 4,096-token cache minimum. Add more content to the seed.",
    );
    process.exit(1);
  }
}

interface UsageShape {
  input_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens: number;
}

function printUsage(usage: UsageShape) {
  console.log(`  input_tokens:                ${usage.input_tokens}`);
  console.log(`  cache_creation_input_tokens: ${usage.cache_creation_input_tokens ?? 0}`);
  console.log(`  cache_read_input_tokens:     ${usage.cache_read_input_tokens ?? 0}`);
  console.log(`  output_tokens:               ${usage.output_tokens}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
