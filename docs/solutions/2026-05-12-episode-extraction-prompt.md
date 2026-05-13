---
date: 2026-05-12 (Stage 0 entry 2026-05-13)
topic: per-episode-claude-extraction
applies-to: U4 of docs/plans/2026-05-12-001-refactor-cost-optimization-plan.md
related: docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md (U2)
---

# U4 — per-episode Claude extraction (prompt design + iterations)

This doc captures U4's investigation, prompt iterations, and the user sign-off cycle. Lives under `docs/solutions/` so it carries forward as the canonical record of the per-episode pipeline's design decisions.

## North star

The plan's CE1 target: **≤$0.20/team/day** in steady state. Current baseline: ~$0.90/team/day. U4 is the dominant lever toward that target. Every design choice in this doc is evaluated against whether it moves cost toward $0.20 without regressing content quality.

## Stage 0 — baseline (2026-05-13)

**Decision:** **proceed with U4 as planned.** Baseline is well above the $0.40/day threshold at which the plan would have downscoped to caching-only.

Data used to derive the baseline:

- The plan's original cost analysis (2026-05-12) put per-team daily cost at ~$0.90 based on 2 days of `api_calls` data ($4.23 total).
- Post-U2 status: U2 went dormant because Haiku 4.5's caching minimum (4,096 tokens) is above our current prefix (~2,800 tokens). Anthropic cache hit rate today = 0.0%. So post-U2 actual cost ≈ pre-U2 baseline. No measurable cost reduction yet from Phase A's work.
- Today's natural cron pickup (2026-05-13 11:00 UTC) processed no new segments — every Particle search returned already-processed content because the overnight `?force=1` runs covered the full universe. The natural cron's $0.24 reflects only Particle mention searches with no downstream transcript or Claude work.
- A "clean post-U2 production-shape baseline" via fresh ingest isn't recoverable from today's state without waiting for new episodes. The plan's existing $0.90/day figure remains the best baseline.

**Why we didn't trigger another live run for the baseline:** would have cost ~$0.50 to learn nothing new. The pre-U2 baseline = post-U2 baseline because U2 produced no actual cost change. The Stage 0 decision threshold (≤$0.40/day = downscope) isn't close — we're at $0.90/day, more than 2× the threshold.

**Cost decomposition we're going after:**

| Line item | Today | After U4 (target) | Lever |
|---|---|---|---|
| Particle transcript fetches | ~$0.48/day (largest) | $0–$0.08/day | One fetch per episode (~8/day) instead of per segment (~50/day). If inline `windows[].lines[]` is sufficient (Stage 1), eliminate entirely. |
| Anthropic summarize_segment | ~$0.18/day | ~$0.04/day | One call per episode (~8/day) instead of per segment, with caching activated by the larger prefix (U2 reopened). |
| Particle mentions search | ~$0.17/day | unchanged | Fixed cost — independent of segment count. |
| Particle list (entities/podcasts) | minor (seed-side per U3) | unchanged | Already gated by U3's test fix. |

If the inline-transcript hypothesis lands (Stage 1) and per-episode Claude works (Stage 1.5/2), total per-team daily cost target after U4 ≈ $0.25–$0.30 — within 1.5× of CE1's $0.20 goal. Further reductions then come from U6 (cadence policy — ~50% cut during off-season) and U7 (model swap evaluation).

## Stage 1 — inline-transcript investigation (2026-05-13)

**Decision: fetch ONE full-episode transcript per episode + concat all `windows[].lines[]` from search/mention results as "anchors" in the Claude prompt.** Inline windows alone are insufficient for substantive summaries and pull-quote fidelity, but full-episode fetches at one call per episode (vs. ~50 per-segment calls today) deliver the 6× reduction on the Particle transcript line.

### Evidence

Two Particle response shapes feed the pipeline:

**`ParticleSearchResult` (storyline/semantic search)** — fixture: `lib/particle/__contracts__/search.json`
- Carries a full `segment` object with rich metadata: `title`, `description`, `summary` (Particle's pre-extracted 4-5 bullet list), `audio_url`, `start_seconds`, `end_seconds`.
- Also carries `clips[]` with `title`, `description`, `intro_statement`, `engagement_score`.
- `windows[].lines[]` are NARROW — typically 5–10 lines covering 30–60 seconds around each match. The fixture's "Cowboys vs. 49ers" segment had two windows totaling ~150 chars of transcript text (just match snippets + immediate neighbors).

**`ParticleMentionResult` (per-entity mention search)** — fixture: `lib/particle/__contracts__/mentions.json`
- Light shape: `mention_count`, `mention_variants`, `windows[].lines[]`.
- Windows contain ~5 lines around each mention with speaker attribution.
- The window's `segment` reference is THIN: just `{ id, type, title }` — no `description`, no `summary`, no `audio_url`.

### Why inline-only fails

Pull quotes require verbatim transcript substrings — that's a non-negotiable in `summarize.ts`'s validation. The narrow windows around mentions don't contain enough quoteable material to write 1–3 substantive pull quotes per segment. Storyline results have richer metadata (Particle's segment.summary, clip descriptions) that could carry summary + bullets, but the pull quotes still need actual transcript text and there's not enough of it in the inline windows.

### Why per-episode transcript wins

- `getClipTranscript` in `lib/particle/client.ts:232` calls `/v1/podcasts/episodes/{id}/transcript?start=X&end=Y` — the **same endpoint** as a full-episode transcript fetch, just with start/end filters applied. Cost is per call ($0.008/call), same either way.
- Drop the start/end filters → one call returns the full episode → Claude sees the whole context for one per-episode extraction.
- Episode count: ~8/day in current 49ers data vs. ~50 segments/day. Particle call savings: ~$0.34/day (~$0.40 → ~$0.06).

### What the per-episode Claude call gets fed

Single Claude call per episode with:
1. Full episode transcript (lines with speaker + start_seconds — keeps timestamps usable for the card surface).
2. **All** mention/storyline windows as "highlights of interest" — Claude uses these as anchors but is free to find adjacent moments worth surfacing too.
3. Each storyline result's segment metadata (title, description, summary, clip descriptions) when present — Particle's pre-extracted signal supplements the raw transcript.
4. The team context block (entities + storylines) — same as today's per-segment prompt.

### Persistence shape — committed at plan time, reconfirmed Stage 1

Each `EpisodeMoment` from the extraction call carries `particle_segment_id`. The existing UNIQUE constraint on `segments.particle_segment_id` + `onConflict` upsert path is unchanged. The extraction prompt is instructed to keep Particle segment boundaries (so re-runs are idempotent). If during Stage 1.5 the model consistently wants to merge or split segments to produce better content, that's a contingency to escalate — not auto-relax.

### What this means for the cost target

Per-day projection after U4 (with U2 reopened and caching active because per-episode prompts will carry full transcripts > 4,096 tokens):

| Line item | Pre-U4 | Post-U4 | Notes |
|---|---|---|---|
| Particle transcripts | ~$0.40 | ~$0.06 | 8 episode-level fetches vs ~50 clip-level |
| Anthropic per-segment | ~$0.18 | $0 | Replaced by per-episode extraction |
| Anthropic per-episode | new | ~$0.05 | 8 calls; bigger input but caching active |
| Particle mentions | ~$0.17 | unchanged | Fixed cost |
| Total | ~$0.90 | ~$0.39 | ~56% reduction; ~2× off CE1 target |

Remaining gap to $0.20/day target comes from U6 (cadence — off-season days at 1/2 or 1/3 frequency) and U7 (model swap evaluation — potentially Flash-Lite or DeepSeek for further cost reduction).

## Stage 1.5 — A/B comparison (2026-05-13)

**Constraint:** Particle credits depleted by the overnight force=1 runs. Couldn't fetch full episode transcripts. Workaround: assembled "partial episode transcripts" from the per-segment `raw_transcript` rows already cached in DB. This tests the **quality** question without the cost argument (cost was already established in Stage 1). The user has noted credit-top-up as a deferred future blocker.

**Setup:** `scripts/ab-episode-extraction.ts` reads the 4 cards in DB, assembles each episode's relevant segments as a labeled-block transcript, runs a v0 per-episode extraction prompt, and dumps current+new side-by-side. Full output saved at `docs/solutions/2026-05-13-ab-output.txt`.

### Results

| Card | Title | Current segments | New moments | Notes |
|---|---|---|---|---|
| [0] | The Athletic Football Show — best QBs by division | 1 (17s, Bosa name-drop) | 1 (matched timestamps) | Comparable. *Earlier dry run dropped the episode entirely → stochasticity to watch* |
| [1] | Locked On 49ers — Rookie Minicamp UPDATES | 5 | 5 (matched timestamps) | Near 1:1 mapping; comparable summaries, quotes, bullets |
| [2] | The Krueg Show — Rookie OTAs (Krueger & Chapman) | 7 | 6 | NEW dropped a borderline "box three corners drill" segment that was barely 49ers-relevant — defensible call |
| [3] | The Krueg Show — Rookie OTAs Winners & Losers | 11 | **failed (max_tokens cap)** | Output exhausted 2,048 token cap before tool_use completed |

**Cost this run:** $0.043 total Anthropic spend across 4 calls. Caching did NOT fire — v0 system prompt is ~3,000 tokens, below Haiku 4.5's 4,096 minimum (U2 stays dormant).

### Key observations

1. **Quality on small/medium episodes is comparable.** Cards [1] and [2] are 1:1 (or 1:1-minus-a-low-value-segment) on coverage. Pull quotes are different verbatim selections from the same source but both substantive. Summaries lead with the take, not framing.

2. **Card [3] is the failure mode.** Episodes with 10+ moments overflow the 2048-token output cap. Either:
   - Raise `max_tokens` to 4,096+ (Stage 2 should do this, the cost difference is negligible because output token pricing is the same)
   - Or accept truncation gracefully (model returns partial moments)
   - Or split the call: extract first half, then second half (cache hit on second call would help)
   - For Stage 2, raise `max_tokens` to 4,096 — cost impact is < $0.001/call.

3. **Card [0] stochasticity.** Same input, two runs of v0 produced different outputs (kept vs dropped). This is the model's relevance gate being borderline-strict on a borderline input. Two paths: tighten the prompt to be more decisive ("ALWAYS include if any roster name is discussed for >5 seconds"), or accept variance and downstream-deduplicate. The dropping behavior aligns with the "lean toward dropping" rule in the prompt, so this isn't necessarily a bug.

4. **Caching is still off.** v0 prompt prefix sits ~3,000 tokens. Stage 2's production prompt should target 4,500+ tokens to clear Haiku 4.5's minimum — either by expanding the rules section or by including team-specific context (entity descriptions, storyline detail) inline.

### Verdict

Per-episode extraction is **quality-equivalent on small/medium episodes** and the cost case is decisive (Stage 1). The card [3] failure is a known and fixable engineering issue (raise max_tokens). The card [0] stochasticity is the kind of edge case Stage 2 prompt iteration is meant to address.

**Proceed to Stage 2** — build the production `lib/anthropic/extract-episode-moments.ts` module with:
- `max_tokens: 4096` (handles 10+ moment episodes)
- System prompt expanded to ~4,500 tokens (activates U2 caching once running on real ingest)
- Quote fidelity validation + retry (same pattern as `summarize.ts`)
- `particle_segment_id` mapping per moment (committed persistence design)

## Stage 2 — production module build

(next session — start here)

### Future blockers worth tracking

- **Particle credits depleted** (2026-05-13). Need top-up before we can ship U4 to production. The user has noted this as a deferred concern to handle "when it's a blocker." A/B testing didn't need fresh fetches thanks to cached DB transcripts, but production rollout of U4 will require either credits restored OR a strategy that doesn't fetch fresh transcripts (not realistic for daily ingest).
