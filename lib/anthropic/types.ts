/**
 * Narrow types for the Claude Haiku summarization layer.
 *
 * Inputs come from U7's Particle types + U6's universe config; outputs land
 * in `segments.{summary, pull_quotes, bullets}`. Kept separate from
 * `lib/particle/types.ts` because the summarization layer is provider-
 * agnostic — only the model price table changes if we ever swap providers.
 */

export interface TeamContext {
  /** Display name (e.g. "San Francisco 49ers"). */
  name: string;
  /** Sport — used as disambiguation context in v2. */
  sport: string;
  /** Universe entity slugs the team should surface against. */
  entities: readonly string[];
  /** Universe storyline phrases — included in the prompt so the model knows what counts as relevant. */
  storylines: readonly string[];
}

export interface SegmentSummaryInput {
  team: TeamContext;
  podcast: { name: string; kind: "team-specific" | "national" };
  episode: { title: string; published_at?: string };
  segment: {
    title?: string;
    description?: string;
    transcript: string;
  };
}

export interface SegmentSummary {
  summary: string;
  pullQuotes: string[];
  bullets: string[];
  /** Concrete entity slugs the model attributed the surfacing to. */
  surfacingEntities: string[];
}

export interface EpisodeSummaryInput {
  team: TeamContext;
  podcast: { name: string };
  episode: { title: string };
  segmentSummaries: readonly { title?: string; summary: string }[];
}

export interface EpisodeSummary {
  summary: string;
}

// ─── Per-episode extraction (U4) ──────────────────────────────────────

/**
 * One line of an episode transcript. Mirrors `ParticleTranscriptLine`
 * but kept in this provider-agnostic module so the extraction call
 * doesn't import from `lib/particle`.
 */
export interface TranscriptLine {
  start_seconds: number;
  end_seconds: number;
  speaker?: string;
  text: string;
}

/**
 * A segment that Particle's search/mention endpoints flagged as relevant.
 * The extractor uses these as "anchors of interest" but is free to find
 * adjacent moments worth surfacing too. Carries `particle_segment_id` so
 * the output's moments can be mapped back to existing rows in `segments`.
 */
export interface MentionAnchor {
  particle_segment_id: string;
  start_seconds: number;
  end_seconds: number;
  title?: string;
  /** "entity" (from searchEntityMentions) or "keyword"/"semantic" (from searchByContent). */
  match_source: "entity" | "keyword" | "semantic";
  /** Entity slugs that surfaced this segment (for entity matches). */
  surfacing_entities?: readonly string[];
}

export interface EpisodeExtractionInput {
  team: TeamContext;
  podcast: { name: string; kind: "team-specific" | "national" };
  episode: { title: string; published_at?: string };
  /** Full episode transcript (line-level). */
  transcript: readonly TranscriptLine[];
  /** Particle-flagged segments to use as relevance anchors. */
  anchors: readonly MentionAnchor[];
}

export interface EpisodeMoment {
  /** Mapped to an originating Particle segment; required for idempotent persistence. */
  particle_segment_id: string;
  start_seconds: number;
  end_seconds: number;
  summary: string;
  pull_quotes: readonly string[];
  bullets: readonly string[];
  surfacing_entities: readonly string[];
}

export interface EpisodeExtractionOutput {
  moments: readonly EpisodeMoment[];
  episode_rollup: string;
}

// ─── Errors ────────────────────────────────────────────────────────────

export class AnthropicError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnthropicError";
  }
}

export class AnthropicSchemaError extends AnthropicError {
  override name = "AnthropicSchemaError";
}

export class AnthropicQuoteFidelityError extends AnthropicError {
  override name = "AnthropicQuoteFidelityError";
  constructor(
    operation: string,
    message: string,
    public readonly offendingQuotes: readonly string[],
  ) {
    super(operation, message);
  }
}

export class AnthropicTransientError extends AnthropicError {
  override name = "AnthropicTransientError";
  constructor(
    operation: string,
    message: string,
    cause?: unknown,
    public readonly status?: number,
  ) {
    super(operation, message, cause);
  }
}

// ─── Cost telemetry ────────────────────────────────────────────────────

export interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Per-token pricing in USD for `claude-haiku-4-5`. The values reflect the
 * published Anthropic API rates ($1/$5 per million input/output tokens,
 * with 1.25× cache-write and 0.1× cache-read multipliers). Update here if
 * pricing changes — every call site reads from this table.
 */
export const ANTHROPIC_HAIKU_PRICE_USD = {
  inputPerToken: 0.000_001,
  outputPerToken: 0.000_005,
  cacheWritePerToken: 0.000_001_25,
  cacheReadPerToken: 0.000_000_1,
} as const;

export const ANTHROPIC_MODEL = "claude-haiku-4-5" as const;

/**
 * Version tag for the per-episode extraction prompt (U5 of the
 * cost-optimization plan). Bumped manually when the prompt is
 * intentionally changed — the pipeline's cross-run dedupe filter
 * compares this against `segments.prompt_version` and re-processes
 * segments whose stored version doesn't match.
 *
 * Conventions: use simple monotonic strings like "v1", "v2". Don't
 * include the date or commit SHA — those drift with formatting
 * changes that don't actually need re-extraction.
 */
export const EPISODE_EXTRACTION_PROMPT_VERSION = "v1" as const;

export function computeCallCost(usage: AnthropicUsage): number {
  const baseInput = usage.inputTokens * ANTHROPIC_HAIKU_PRICE_USD.inputPerToken;
  const cacheWrite =
    (usage.cacheCreationInputTokens ?? 0) * ANTHROPIC_HAIKU_PRICE_USD.cacheWritePerToken;
  const cacheRead =
    (usage.cacheReadInputTokens ?? 0) * ANTHROPIC_HAIKU_PRICE_USD.cacheReadPerToken;
  const output = usage.outputTokens * ANTHROPIC_HAIKU_PRICE_USD.outputPerToken;
  return baseInput + cacheWrite + cacheRead + output;
}
