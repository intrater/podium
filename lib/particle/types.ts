/**
 * Narrow TypeScript types for the Particle API.
 *
 * Every type covers only the fields the daily worker reads. New fields land
 * here lazily as ingestion needs them. The shape is verified against
 * `docs/solutions/2026-05-09-particle-api-shape.md` (Round 2) plus the U7
 * live-API probes captured in `__contracts__/`.
 *
 * Particle responses use `*_seconds` suffix for time fields (`start_seconds`,
 * `end_seconds`, `duration_seconds`). Filter query parameters drop the
 * suffix (`?start=`, `?end=`).
 */

// ─── Shared sub-objects ────────────────────────────────────────────────

export interface ParticlePodcastRef {
  id: string;
  title: string;
  slug?: string;
  image_url?: string;
}

export interface ParticleSpeaker {
  name?: string;
  role?: string;
  speaking_duration_seconds?: number;
}

// ─── Core entities ─────────────────────────────────────────────────────

export interface ParticleEpisode {
  id: string;
  slug?: string;
  title: string;
  published_at?: string;
  podcast: ParticlePodcastRef;
  description?: string;
  audio_url?: string;
  duration_seconds?: number;
  episode_number?: number;
  language?: string;
  speakers?: ParticleSpeaker[];
}

export interface ParticleSegment {
  id: string;
  number?: number;
  type?: string;
  title?: string;
  description?: string;
  summary?: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds?: number;
  audio_url?: string;
  episode?: ParticleEpisode;
}

export interface ParticleClip {
  id: string;
  episode: ParticleEpisode;
  segment?: { id: string; type?: string; title?: string };
  type?: string;
  title?: string;
  description?: string;
  intro_statement?: string;
  engagement_score?: number;
  speaker?: ParticleSpeaker;
  start_seconds: number;
  end_seconds: number;
  duration_seconds?: number;
  audio_url?: string;
}

export interface ParticleEntity {
  id: string;
  slug: string;
  name: string;
  description?: string;
  wikipedia_url?: string;
  image_url?: string;
}

/**
 * Per-episode ad read returned by `/v1/podcasts/episodes/{id}/ads`. Only the
 * fields the ingest pipeline reads are typed — we use `start_seconds` and
 * `end_seconds` to strip ad-window transcript lines before Claude extraction.
 */
export interface ParticleEpisodeAd {
  id?: string;
  sponsor_name?: string;
  product?: string;
  offer_description?: string;
  read_type?: "HOST_READ" | "PRE_RECORDED" | string;
  placement_type?: "PRE_ROLL" | "MID_ROLL" | "POST_ROLL" | string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds?: number;
}

export interface ParticlePodcast {
  id: string;
  title: string;
  slug?: string;
  image_url?: string;
  description?: string;
}

// ─── Transcript ────────────────────────────────────────────────────────

export interface ParticleTranscriptLine {
  number: number;
  speaker?: string;
  role?: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
  is_match?: boolean;
  is_mention?: boolean;
}

export interface ParticleEpisodeTranscript {
  episode_id: string;
  language?: string;
  duration_seconds?: number;
  lines: ParticleTranscriptLine[];
}

export type ParticleWordType = "word" | "spacing" | "audio_event";

export interface ParticleWord {
  text: string;
  /**
   * Particle has been observed to return only the three documented values,
   * but the API surface isn't formally enum-locked. Callers that branch on
   * this should default-case to "word" rather than assuming exhaustiveness.
   */
  type?: ParticleWordType;
  start_seconds: number;
  end_seconds: number;
  speaker?: string;
}

export interface ParticleWordTranscript {
  episode_id: string;
  language?: string;
  words: ParticleWord[];
}

// ─── Search results ────────────────────────────────────────────────────

export interface ParticleSearchMatch {
  source: "keyword" | "semantic" | "entity" | string;
  relevance_score?: number;
}

export interface ParticleWindow {
  start_seconds: number;
  end_seconds: number;
  segment?: { id: string; type?: string; title?: string };
  lines?: ParticleTranscriptLine[];
}

export interface ParticleSearchResult {
  episode: ParticleEpisode;
  segment: ParticleSegment;
  clips?: ParticleClip[];
  windows?: ParticleWindow[];
  match?: ParticleSearchMatch;
}

export interface ParticleMentionResult {
  episode: ParticleEpisode;
  mention_count: number;
  mention_variants?: string[];
  windows?: ParticleWindow[];
}

// ─── Pagination envelope ───────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  has_more: boolean;
  /** Opaque continuation token. Absent (or empty) on the final page. */
  cursor?: string;
}

// ─── Errors ────────────────────────────────────────────────────────────

export class ParticleError extends Error {
  constructor(
    public readonly endpoint: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ParticleError";
  }
}

export class ParticleAuthError extends ParticleError {
  override name = "ParticleAuthError";
}

export class ParticleRateLimitError extends ParticleError {
  override name = "ParticleRateLimitError";
  constructor(
    endpoint: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(endpoint, message);
  }
}

export class ParticleTransientError extends ParticleError {
  override name = "ParticleTransientError";
  constructor(
    endpoint: string,
    message: string,
    public readonly status: number,
  ) {
    super(endpoint, message);
  }
}

export class ParticleSchemaError extends ParticleError {
  override name = "ParticleSchemaError";
}

// ─── Cost telemetry ────────────────────────────────────────────────────

export type ParticleTier = "standard" | "premium";

/**
 * Per-call price table. Conservative defaults at the Starter list price
 * ($0.004/req). The dashboard credit-weight inspection (user task) lets us
 * refine these to actual per-tier weights — until then these err on the
 * side of overestimating spend.
 */
export const PARTICLE_PRICE_USD: Record<ParticleTier, number> = {
  standard: 0.004,
  premium: 0.008,
};
