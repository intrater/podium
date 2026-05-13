/**
 * Stage 1.5 A/B comparison for U4 (cost-optimization plan).
 *
 * For each of the existing cards in DB, this script:
 *   1. Reads the persisted per-segment output (CURRENT pipeline)
 *   2. Fetches the full episode transcript from Particle
 *   3. Runs a v0 per-episode extraction prompt (NEW pipeline candidate)
 *   4. Dumps both side-by-side so the user can blind-compare quality
 *
 * Not production code. v0 prompt is intentionally minimal — the goal is to
 * answer "is per-episode at least equivalent quality?" If yes, U4 proceeds
 * to Stage 2 (build the production module). If no, U4 downscopes.
 *
 * Run:
 *   node --env-file=.env.local --experimental-transform-types --no-warnings=ExperimentalWarning scripts/ab-episode-extraction.ts
 *
 * Cost: ~$0.05 (4 episode transcript fetches + 4 per-episode Claude calls).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Particle credits are exhausted as of 2026-05-13 — can't fetch full
 * episode transcripts. Workaround: assemble a "partial episode transcript"
 * from the per-segment transcripts already cached in `segments.raw_transcript`.
 *
 * This is enough to test the QUALITY question (does per-episode prompt
 * produce better summaries on the same source material?). The COST argument
 * was already established in Stage 1 (1 fetch vs 50 fetches).
 */

const MODEL = "claude-haiku-4-5";
const TOOL_NAME = "submit_episode_extraction";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const userId = process.env.PODIUM_USER_ID!;
const anthropicKey = process.env.ANTHROPIC_API_KEY!;

if (!url || !serviceKey || !userId || !anthropicKey) {
  console.error("Missing required env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PODIUM_USER_ID, ANTHROPIC_API_KEY)");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const sdk = new Anthropic({ apiKey: anthropicKey, timeout: 60_000 });

// ─── v0 per-episode extraction prompt ─────────────────────────────────

const TEAM_CONTEXT = `# Team — San Francisco 49ers (NFL)

Surface content that materially discusses the 49ers, their roster, coaches, or recent storylines. Entities to weight:
- brock-purdy, nick-bosa, christian-mccaffrey, deebo-samuel, george-kittle, trent-williams, kyle-shanahan, john-lynch, fred-warner, talanoa-hufanga
- san-francisco-49ers (the franchise itself)

Storylines that count as relevant even without a roster mention:
- 49ers offseason moves and free agency
- 49ers coaching staff changes
- 49ers cap and contract decisions`;

const EXTRACTION_RULES = `You are a sports content analyst working with a full podcast episode transcript. Your job is to extract the moments — possibly several, possibly zero — that genuinely discuss the team described below.

Submit your analysis through the \`submit_episode_extraction\` tool exactly once. The tool input is the source of truth for output formatting; this prompt explains the editorial rules.

# What counts as a moment

A "moment" is a coherent stretch of discussion (typically 20–120 seconds, occasionally longer) where the hosts substantively talk about the team. A name-drop with no follow-up is not a moment. A 5-minute riff that meanders through three topics is two or three moments, split where the subject changes.

Rules for identifying moments:
- The transcript carries inline speaker names and timestamps; use them to find natural breakpoints (speaker handoffs, topic shifts).
- Skip segments that mention the team only as analogy ("the Cowboys are basically the West Coast 49ers") UNLESS the analogy carries substantive analysis worth surfacing.
- Skip sponsor reads, ad rolls, music interstitials, and "this episode is brought to you by" framing.
- An episode can have zero relevant moments — return an empty moments array and that's a valid output. Don't manufacture moments to fill space.

# Per-moment fields

For each moment, populate:

## start_seconds / end_seconds
- Episode-absolute timestamps marking the moment's range. The transcript is presented as labeled segment blocks like \`[Segment 7:48–8:50]\` — those m:ss values are ABSOLUTE episode timestamps. Convert m:ss to total seconds (7:48 = 7*60+48 = 468). Your start_seconds/end_seconds MUST fall within the labeled range of the segment(s) the moment is drawn from.
- Both fields are integers (round start down, end up). Don't overlap moments — adjacent moments should have adjacent timestamps, not overlapping ones.

## summary
- 1–3 sentences, max ~60 words.
- Lead with the substantive take, not the framing ("The hosts argued..." is wrong; "Purdy looks more comfortable in the pocket than 2023 — the offensive line beyond Trent Williams gelled faster than expected" is right).
- Match the analytical register of the speaker. Confident, specific, no hedging.

## pull_quotes
- Up to 3 verbatim quotes from the transcript text for this moment.
- **Every pull quote MUST be an exact substring of the transcript** — including punctuation, capitalization, and any "uh"s or "you know"s. If you can't quote someone exactly, drop the quote. A wrong pull quote is worse than no pull quote.
- Pick quotes that capture an actual claim or vivid description. "Yeah" or "Right" or "Mhm" are wasted space.

## bullets
- 3 to 5 short, standalone facts or claims from the moment. Read as scannable highlights.
- Lead with the subject ("Purdy's pocket presence has..."), not the speaker discourse ("The hosts pointed out that...").
- One claim per bullet. Don't pile up takes with semicolons.

## surfacing_entities
- Slugs from the team entity list that the moment substantively discusses. A name said once in passing is a mention, not a surfacing entity. Only include slugs whose subject matter materially appears.

# Per-episode field

## episode_rollup
- 2–3 sentences, max 80 words. A headline-level synthesis of the relevant content across all moments. If a fan only reads this rollup, they should know what the episode said about the team.
- Lead with the most substantive take across moments. If moments disagree, surface the disagreement.
- If moments array is empty, set episode_rollup to empty string.

# Voice and anti-slop rules

These rules are absolute, in priority order:

1. **Don't invent facts.** If the transcript doesn't say it, you don't say it. You have no separate knowledge of the team beyond what this prompt and the transcript provide.
2. **Don't editorialize.** Report what the moment said. The reader has their own opinions about whether the take is good.
3. **No preamble.** Start each field with content, not framing ("This moment discusses..." / "In this clip the hosts..."). The summary appears under a card titled with the episode and podcast — don't reintroduce that context.
4. **No hedging boilerplate.** Drop "interestingly," "notably," "it's worth pointing out that," "what's clear is." Just say the thing.
5. **No bullet-style prose in the summary.** The summary is sentences; the bullets are bullets.
6. **Match the source's specificity.** If the speaker said "27 of 33 for 290 yards," your bullet says that — not "the QB had a strong day."
7. **Quote fidelity is non-negotiable.** Better to omit a pull quote than fabricate one.

# Slop patterns to suppress

- "It's worth noting that..." / "What's interesting is..." — drop the framing.
- Summary that paraphrases the transcript line-by-line. The summary is a take, not a transcript condensation.
- Pull quotes that are throwaway lines ("Yeah", "Right"). Every pull quote must carry meaning standalone.
- Bullets that restate the same claim three times in slightly different words.
- Bullets phrased as "The hosts discussed..." or "It was mentioned that..." — lead with the subject.
- Soft hedging on quantitative claims. "27 of 33" not "around 27 completions."
- Inventing connective tissue between unrelated moments. Two unrelated moments = two cards' worth of bullets, not a fake synthesized throughline.

# When in doubt

- On relevance: lean toward dropping the moment. A user is better served by no card than a card that promises team content and delivers a passing name-drop.
- On a pull quote's verbatim accuracy: drop it. Two strong pull quotes beat three including a fabricated one.
- On phrasing a bullet: pick the version with more concrete nouns and fewer adjectives.

# Your tool call

Call \`submit_episode_extraction\` exactly once. Do not narrate. Do not output any text outside the tool call.`;

function buildSystemPrompt(): string {
  return `${EXTRACTION_RULES}

${TEAM_CONTEXT}`;
}

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit the relevant moments extracted from this podcast episode, plus an episode-level rollup.",
  input_schema: {
    type: "object" as const,
    required: ["moments", "episode_rollup"],
    properties: {
      moments: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["start_seconds", "end_seconds", "summary", "pull_quotes", "bullets", "surfacing_entities"],
          properties: {
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

// ─── DB read ──────────────────────────────────────────────────────────

interface CardRow {
  id: string;
  surfaced_at: string;
  total_relevant_seconds: number;
  episode_summary: string | null;
  episodes: {
    id: string;
    title: string;
    published_at: string | null;
    audio_url: string | null;
    particle_episode_id: string;
    podcasts: { name: string } | null;
    segments: Array<{
      id: string;
      start_seconds: number;
      end_seconds: number;
      summary: string | null;
      pull_quotes: string[] | null;
      bullets: string[] | null;
      surfacing_entities: string[] | null;
      match_source: string | null;
      raw_transcript: string | null;
    }>;
  } | null;
}

async function loadCards(): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from("cards")
    .select(
      `id, surfaced_at, total_relevant_seconds, episode_summary,
       episodes (
         id, title, published_at, audio_url, particle_episode_id,
         podcasts ( name ),
         segments ( id, start_seconds, end_seconds, summary, pull_quotes, bullets, surfacing_entities, match_source, raw_transcript )
       )`,
    )
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("surfaced_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as CardRow[];
}

// ─── New per-episode extraction call ──────────────────────────────────

interface AssembledSegment {
  start_seconds: number;
  end_seconds: number;
  transcript: string;
}

function buildEpisodeUserMessage(
  podcast: string,
  episode: string,
  segments: AssembledSegment[],
): string {
  // Each segment is presented as a labeled block with its time range. This
  // is a partial-episode view (only the segments that matched ingestion
  // filters), not the full episode transcript — sufficient for the
  // quality A/B comparison.
  const blocks = segments
    .sort((a, b) => a.start_seconds - b.start_seconds)
    .map((s) => {
      const start = `${Math.floor(s.start_seconds / 60)}:${(Math.floor(s.start_seconds) % 60).toString().padStart(2, "0")}`;
      const end = `${Math.floor(s.end_seconds / 60)}:${(Math.floor(s.end_seconds) % 60).toString().padStart(2, "0")}`;
      return `[Segment ${start}–${end}]\n${s.transcript}`;
    })
    .join("\n\n");

  return `Podcast: ${podcast}
Episode: ${episode}

The episode's 49ers-relevant segments (each labeled with its [start–end] timestamp). Gaps between segments represent transcript content irrelevant to the team that's been pre-filtered out.

${blocks}`;
}

interface ExtractionMoment {
  start_seconds: number;
  end_seconds: number;
  summary: string;
  pull_quotes: string[];
  bullets: string[];
  surfacing_entities: string[];
}

interface ExtractionOutput {
  moments: ExtractionMoment[];
  episode_rollup: string;
}

interface ExtractionResult {
  output: ExtractionOutput | null;
  usage: {
    input: number;
    output: number;
    cache_creation: number;
    cache_read: number;
  };
}

async function runExtraction(
  podcast: string,
  episode: string,
  segments: AssembledSegment[],
): Promise<ExtractionResult> {
  const params: MessageCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildEpisodeUserMessage(podcast, episode, segments) }],
  };

  const r: Message = await sdk.messages.create(params);
  const toolUse = r.content.find((b): b is { type: "tool_use"; id: string; name: string; input: unknown } => b.type === "tool_use");
  const output = toolUse ? (toolUse.input as ExtractionOutput) : null;
  return {
    output,
    usage: {
      input: r.usage.input_tokens,
      output: r.usage.output_tokens,
      cache_creation: r.usage.cache_creation_input_tokens ?? 0,
      cache_read: r.usage.cache_read_input_tokens ?? 0,
    },
  };
}

// ─── Side-by-side dump ────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function dumpCard(card: CardRow, idx: number): void {
  const ep = card.episodes;
  if (!ep) return;
  const podcast = ep.podcasts?.name ?? "(unknown podcast)";

  console.log(`\n\n${"═".repeat(82)}`);
  console.log(`CARD [${idx}]  ·  ${podcast}`);
  console.log(`Episode: ${ep.title}`);
  console.log(`${"═".repeat(82)}\n`);
  console.log("── CURRENT (per-segment pipeline, what's in DB today) ──────────────────────────");
  console.log(`Episode rollup:`);
  console.log(`  ${(card.episode_summary ?? "(none)").slice(0, 240)}`);
  console.log("");
  const segs = [...ep.segments].sort((a, b) => a.start_seconds - b.start_seconds);
  segs.forEach((s, i) => {
    console.log(`  Segment ${i + 1} · ${fmtTime(s.start_seconds)}–${fmtTime(s.end_seconds)} · match=${s.match_source}`);
    console.log(`    summary : ${(s.summary ?? "(none)").slice(0, 180)}`);
    const quotes = s.pull_quotes ?? [];
    quotes.forEach((q) => console.log(`    quote   : "${q.slice(0, 160)}"`));
    const bullets = s.bullets ?? [];
    bullets.forEach((b) => console.log(`    bullet  : · ${b.slice(0, 160)}`));
    if (s.surfacing_entities?.length) {
      console.log(`    entities: ${s.surfacing_entities.join(", ")}`);
    }
    console.log("");
  });
}

function dumpExtraction(result: ExtractionResult): void {
  console.log("── NEW (per-episode pipeline, v0 prompt) ────────────────────────────────────────");
  if (!result.output) {
    console.log("  (no extraction output — Claude returned no tool call)");
    return;
  }
  console.log(`Episode rollup:`);
  const rollup = typeof result.output.episode_rollup === "string"
    ? result.output.episode_rollup
    : "(model returned non-string or missing rollup)";
  console.log(`  ${rollup.slice(0, 240)}`);
  console.log("");
  if (!Array.isArray(result.output.moments) || result.output.moments.length === 0) {
    console.log("  (zero relevant moments — episode dropped per relevance gate)");
  } else {
    result.output.moments.forEach((m, i) => {
      console.log(`  Moment ${i + 1} · ${fmtTime(m.start_seconds)}–${fmtTime(m.end_seconds)}`);
      console.log(`    summary : ${m.summary.slice(0, 180)}`);
      m.pull_quotes.forEach((q) => console.log(`    quote   : "${q.slice(0, 160)}"`));
      m.bullets.forEach((b) => console.log(`    bullet  : · ${b.slice(0, 160)}`));
      if (m.surfacing_entities?.length) {
        console.log(`    entities: ${m.surfacing_entities.join(", ")}`);
      }
      console.log("");
    });
  }
  const cost =
    result.usage.input * 1e-6 +
    result.usage.cache_creation * 1.25e-6 +
    result.usage.cache_read * 1e-7 +
    result.usage.output * 5e-6;
  console.log(`  [usage] input=${result.usage.input}  output=${result.usage.output}  cache_creation=${result.usage.cache_creation}  cache_read=${result.usage.cache_read}  ≈$${cost.toFixed(5)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const cards = await loadCards();
  if (cards.length === 0) {
    console.log("No cards in DB. Run an ingest first.");
    return;
  }
  console.log(`Loaded ${cards.length} cards. Running per-episode extraction on each...\n`);

  let totalCost = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const ep = card.episodes;
    if (!ep || !ep.particle_episode_id) {
      console.log(`Card [${i}]: no episode data, skipping`);
      continue;
    }

    const assembled: AssembledSegment[] = ep.segments
      .filter((s) => s.raw_transcript != null && s.raw_transcript.length > 0)
      .map((s) => ({
        start_seconds: s.start_seconds,
        end_seconds: s.end_seconds,
        transcript: s.raw_transcript!,
      }));
    if (assembled.length === 0) {
      console.log(`Card [${i}]: no segment transcripts in DB, skipping`);
      continue;
    }

    const podcastName = ep.podcasts?.name ?? "(unknown)";
    const result = await runExtraction(podcastName, ep.title, assembled);
    const callCost =
      result.usage.input * 1e-6 +
      result.usage.cache_creation * 1.25e-6 +
      result.usage.cache_read * 1e-7 +
      result.usage.output * 5e-6;
    totalCost += callCost;

    dumpCard(card, i);
    dumpExtraction(result);
  }

  console.log(`\n\n${"═".repeat(82)}`);
  console.log(`A/B complete. Total spend this run: ≈$${totalCost.toFixed(4)}`);
  console.log(`${"═".repeat(82)}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
