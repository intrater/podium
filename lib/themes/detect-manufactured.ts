/**
 * Manufactured-aggregation detector (KD5).
 *
 * "8 podcasts discussed the trade" is only a meaningful signal of
 * editorial weight when the 8 voices are *independently engaging*.
 * When they're all reacting to one upstream news drop, the cluster
 * is news-cycle echo — the same article filtered through 8 hosts'
 * mouths — and should be tagged so the card writer can frame it as
 * "reacting to news" rather than "consensus emerging."
 *
 * Three free-signal heuristics, each cheap to compute on data already
 * persisted on `segments`:
 *
 *   1. **Shared match.source**: when all members were surfaced by
 *      Particle via the same `match.source` (keyword/entity/semantic)
 *      on the same surfacing entity, that's a sign they all came up
 *      through the same Particle path → probably news-echo.
 *
 *   2. **Published_at proximity**: when all members' episodes were
 *      published within a tight window (default 4h), they're likely
 *      reacting to the same news cycle.
 *
 *   3. **Verbatim phrase overlap**: when two or more members share a
 *      verbatim phrase of N+ tokens, they're likely quoting the same
 *      source article (or each other).
 *
 * 2-of-3 signals triggers the tag. One signal alone is too noisy
 * (e.g., 4h publication window happens naturally on a weekday morning).
 */

import type { MomentForClustering } from "./types.ts";

const PROXIMITY_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
const SHARED_PHRASE_MIN_TOKENS = 6;
const MIN_SIGNALS_TO_TAG = 2;

export interface ClusterMomentLite {
  segment_id: string;
  match_source: string | null;
  episode_published_at: string;
  pull_quote: string | null;
  surfacing_entities: readonly string[];
}

/**
 * Decide whether a cluster of moments looks like news-cycle echo.
 * Singletons never qualify (need at least 2 members for "manufactured"
 * to mean anything).
 */
export function detectManufactured(
  members: readonly ClusterMomentLite[],
): boolean {
  if (members.length < 2) return false;

  let signals = 0;

  // Signal 1: all members share match.source AND a common entity.
  const sources = new Set(members.map((m) => m.match_source));
  const firstEntity = members[0].surfacing_entities[0]?.toLowerCase();
  const allShareEntity =
    firstEntity != null &&
    members.every((m) => m.surfacing_entities[0]?.toLowerCase() === firstEntity);
  if (sources.size === 1 && [...sources][0] != null && allShareEntity) {
    signals += 1;
  }

  // Signal 2: all members published within PROXIMITY_WINDOW_MS.
  const timestamps = members
    .map((m) => Date.parse(m.episode_published_at))
    .filter((t) => Number.isFinite(t));
  if (timestamps.length === members.length && timestamps.length >= 2) {
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    if (max - min <= PROXIMITY_WINDOW_MS) {
      signals += 1;
    }
  }

  // Signal 3: verbatim phrase overlap (≥SHARED_PHRASE_MIN_TOKENS tokens).
  if (hasSharedPhrase(members, SHARED_PHRASE_MIN_TOKENS)) {
    signals += 1;
  }

  return signals >= MIN_SIGNALS_TO_TAG;
}

/**
 * Look for any verbatim phrase of N+ tokens appearing in 2+ members'
 * pull_quotes. Conservative — only checks pull_quotes (not full
 * transcripts) so the check stays cheap.
 */
export function hasSharedPhrase(
  members: readonly ClusterMomentLite[],
  minTokens: number,
): boolean {
  const quotes = members
    .map((m) => normalize(m.pull_quote ?? ""))
    .filter((q) => q.length > 0);
  if (quotes.length < 2) return false;

  for (let i = 0; i < quotes.length; i += 1) {
    for (let j = i + 1; j < quotes.length; j += 1) {
      if (sharesPhrase(quotes[i], quotes[j], minTokens)) return true;
    }
  }
  return false;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sharesPhrase(a: string, b: string, minTokens: number): boolean {
  const aTokens = a.split(" ");
  const bTokens = b.split(" ");
  if (aTokens.length < minTokens || bTokens.length < minTokens) return false;
  // Build set of n-grams of size minTokens from a.
  const grams = new Set<string>();
  for (let i = 0; i + minTokens <= aTokens.length; i += 1) {
    grams.add(aTokens.slice(i, i + minTokens).join(" "));
  }
  for (let i = 0; i + minTokens <= bTokens.length; i += 1) {
    if (grams.has(bTokens.slice(i, i + minTokens).join(" "))) return true;
  }
  return false;
}

/**
 * Convert a MomentForClustering to the lite shape detectManufactured
 * needs. Convenience helper for callers working from the full type.
 */
export function liteFromMoment(m: MomentForClustering): ClusterMomentLite {
  return {
    segment_id: m.segment_id,
    match_source: m.match_source,
    episode_published_at: m.episode_published_at,
    pull_quote: m.pull_quote,
    surfacing_entities: m.surfacing_entities,
  };
}
