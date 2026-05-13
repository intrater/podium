---
date: 2026-05-13
topic: anthropic-prompt-caching
applies-to: claude-haiku-4-5 (and any prefix-caching work on Anthropic models)
related: docs/plans/2026-05-12-001-refactor-cost-optimization-plan.md (U2)
---

# Anthropic Haiku 4.5 prompt-caching minimum is 4,096 tokens

## Summary

U2 of the cost-optimization plan added `cache_control: { type: "ephemeral" }` markers on both `system[0]` and `tools[0]` in `lib/anthropic/summarize.ts` and `summarize-episode.ts`. Unit tests passed. Live verification (24 calls under `?force=1`) showed `cache_creation_input_tokens = 0` AND `cache_read_input_tokens = 0` on every call.

Root cause: **Claude Haiku 4.5's minimum cacheable prefix is 4,096 tokens.** Below that threshold, Anthropic silently does not cache — no error, no warning, both usage fields return 0. Our cacheable prefix (system + tools) is ~2,800 tokens, which is below the minimum.

The plan's "ranked suspects" (spread serialization, top-level marker, content variance, template interpolation) were all wrong trees. The markers were structurally correct and reaching Anthropic; Anthropic was just choosing not to cache because the prefix was too short.

## How we diagnosed it

`scripts/debug-cache.ts` runs three back-to-back call pairs with raw SDK and prints `usage.cache_creation_input_tokens` and `usage.cache_read_input_tokens` from each.

Result on Haiku 4.5:

| Variant | Prefix tokens | Cache write | Cache read |
|---|---|---|---|
| A — production shape, `cache_control` on system + tools | ~2,827 | 0 | 0 |
| B — top-level `cache_control` auto-apply | ~2,827 | 0 | 0 |
| C — padded prefix (identical code to A) | ~7,921 | 7,921 | 7,921 |

Same code path, three different prefix sizes. The 2,827-token prefixes silently failed; the 7,921-token prefix worked perfectly. That's how we knew the issue was the prefix length, not the marker placement.

## Anthropic's documented minimums (verified 2026-05-13 via platform.claude.com docs)

| Model | Minimum cacheable prefix |
|---|---|
| Claude Opus 4.5 / 4.6 / 4.7 / Mythos Preview | 4,096 |
| Claude Opus 4.0 / 4.1 | 1,024 |
| Claude Sonnet 4.5 / 4 | 1,024 |
| Claude Sonnet 4.6 | 2,048 |
| **Claude Haiku 4.5** | **4,096** |
| Claude Haiku 3.5 | 2,048 |
| Claude Haiku 3 | 1,024 |

Haiku 4.5 is the family outlier — same threshold as the largest Opus models. If you assume the older Haiku 2,048 figure, you'll under-build your prefix and get silent cache misses.

## How to detect this in the future

Both `cache_creation_input_tokens = 0` AND `cache_read_input_tokens = 0` on a call you expect to cache means **prefix too short**, not a placement bug. If only `cache_read` is 0 (and `cache_creation` > 0), the marker is working — the next call should hit. If both are 0, recount your cacheable prefix tokens.

Tokens are roughly chars/4 for English. The fastest check: `console.log(prompt.length)` and divide by 4 — if the result is well under ~4,000, expect Haiku 4.5 to skip caching.

## What we did about U2

U2 is marked "structurally correct, dormant until prefix grows past 4,096." We're not expanding `SHARED_RULES` purely to clear the threshold — U4 is about to rewrite the prompt structure for per-episode extraction, where prompts will naturally grow well past 4,096 (full episode transcripts in context). Caching will turn on automatically there.

## What changes downstream

- **U4 verification** should include re-running `scripts/debug-cache.ts` (or watching `cache_creation_input_tokens` after the first ingest call) to confirm caching actually fires.
- **U7 model swap evaluation** must check each candidate model's prompt-caching minimum. The script is a quick way to test — change `MODEL` and re-run.

## Diagnostic tool

`scripts/debug-cache.ts` is kept in the repo. Run it any time you suspect cache behavior is off:

```
node --env-file=.env.local --experimental-transform-types --no-warnings=ExperimentalWarning scripts/debug-cache.ts
```

Costs ~$0.05 per run. Tests Variants A/B/C against whichever model is set in the script.
