/**
 * Cost dry-run helper.
 *
 * Used by U8's pre-flight gate before any real Particle calls go out:
 * given the universe shape and the date window, estimate worst-case spend
 * against the per-tier price table. Pure function — no network, no DB
 * writes.
 *
 * Assumptions:
 *   - One mentions-search page per universe entity (entities rarely produce
 *     >25 mentions in a 1–3 day window — page 2+ is rare).
 *   - One semantic-search page per universe storyline.
 *   - Two list-episodes pages per podcast per 3 days of window
 *     (most podcasts publish 1–3 episodes in that span).
 *   - 200 segments per day worst case requiring transcript fetch (per
 *     U1 round 2 estimate; the real number trends much lower at v1
 *     volume, but the gate must err on the side of overestimating).
 *
 * If real-world numbers diverge during U8 development, tune the
 * assumption constants here — the API surface stays stable.
 */

import { PARTICLE_PRICE_USD, type ParticleTier } from "./types.ts";

export interface UniverseShape {
  entities: readonly string[];
  storylines: readonly string[];
}

export interface CostEstimateInput {
  universe: UniverseShape;
  /** Number of curated podcasts the daily worker will scan. */
  podcastCount: number;
  /** Number of days the run covers (1 for steady-state daily; 3 for first-run seed). */
  windowDays: number;
  /** Tier to price against. Defaults to standard. */
  tier?: ParticleTier;
}

export interface CostBreakdownEntry {
  calls: number;
  costUsd: number;
}

export interface CostEstimateResult {
  totalUsd: number;
  totalCalls: number;
  breakdown: {
    entityMentions: CostBreakdownEntry;
    semanticSearch: CostBreakdownEntry;
    listEpisodes: CostBreakdownEntry;
    transcript: CostBreakdownEntry;
  };
}

const ENTITY_MENTION_PAGES_PER_ENTITY = 1;
const SEMANTIC_PAGES_PER_STORYLINE = 1;
const LIST_EPISODE_PAGES_PER_PODCAST_PER_3_DAYS = 2;
const SEGMENTS_PER_DAY_WORST_CASE = 200;

export function estimateCost(input: CostEstimateInput): CostEstimateResult {
  const tier = input.tier ?? "standard";
  const pricePerCall = PARTICLE_PRICE_USD[tier];

  const entityCalls = input.universe.entities.length * ENTITY_MENTION_PAGES_PER_ENTITY;
  const semanticCalls = input.universe.storylines.length * SEMANTIC_PAGES_PER_STORYLINE;
  const listPagesPerPodcast =
    LIST_EPISODE_PAGES_PER_PODCAST_PER_3_DAYS * Math.max(1, Math.ceil(input.windowDays / 3));
  const listCalls = input.podcastCount * listPagesPerPodcast;
  const transcriptCalls = SEGMENTS_PER_DAY_WORST_CASE * input.windowDays;

  const entityCost = entityCalls * pricePerCall;
  const semanticCost = semanticCalls * pricePerCall;
  const listCost = listCalls * pricePerCall;
  const transcriptCost = transcriptCalls * pricePerCall;

  return {
    totalUsd: entityCost + semanticCost + listCost + transcriptCost,
    totalCalls: entityCalls + semanticCalls + listCalls + transcriptCalls,
    breakdown: {
      entityMentions: { calls: entityCalls, costUsd: entityCost },
      semanticSearch: { calls: semanticCalls, costUsd: semanticCost },
      listEpisodes: { calls: listCalls, costUsd: listCost },
      transcript: { calls: transcriptCalls, costUsd: transcriptCost },
    },
  };
}
