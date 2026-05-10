/**
 * Typed Particle API client.
 *
 * Wraps every endpoint the daily worker uses with narrow types from
 * `./types.ts`. Every call goes through `tracked-call.ts` so cost and
 * rate-limit metadata land in `api_calls` automatically.
 *
 * Tier mapping is hardcoded per endpoint (per
 * `docs/solutions/2026-05-09-particle-cost-estimate.md`): heavy endpoints
 * — search, mentions, clip detail, transcript, word-transcript — are
 * billed at premium rates. Catalog and listing endpoints are standard.
 *
 * Particle uses different param conventions across endpoints — search
 * uses `since/until`, list-episodes uses `published_after/published_before`,
 * mentions requires `entity_id` (NOT slug), list-episodes requires
 * `podcast_id` (NOT slug). The client method signatures normalize these
 * naming inconsistencies behind ergonomic TypeScript options.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { trackedCall, type Fetcher } from "./tracked-call.ts";
import type {
  PaginatedResponse,
  ParticleClip,
  ParticleEntity,
  ParticleEpisode,
  ParticleEpisodeTranscript,
  ParticleMentionResult,
  ParticlePodcast,
  ParticleSearchResult,
  ParticleTier,
  ParticleWordTranscript,
} from "./types.ts";

const BASE_URL = "https://api.particle.pro";

export interface ParticleClientOptions {
  supabase: SupabaseClient;
  /** Overrideable for tests — defaults to `globalThis.fetch`. */
  fetcher?: Fetcher;
  /** Overrideable for tests — defaults to `setTimeout`-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-attempt fetch timeout. Defaults to 30s. */
  timeoutMs?: number;
}

interface SearchByContentBase {
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Discriminated shape — one of `keyword` or `semantic` must be set.
 * Particle's `/v1/podcasts/search` returns 422 if neither is supplied;
 * making the constraint structural moves that error to compile time.
 */
export type SearchByContentOpts =
  | (SearchByContentBase & { keyword: string; semantic?: string })
  | (SearchByContentBase & { keyword?: string; semantic: string });

export interface SearchEntityMentionsOpts {
  /** Particle entity ID (NOT slug — use `listEntities` to resolve). */
  entityId: string;
  since?: string;
  until?: string;
  cursor?: string;
  limit?: number;
}

export interface ListEntitiesOpts {
  q: string;
  limit?: number;
}

export interface ListPodcastsOpts {
  q: string;
  limit?: number;
}

export interface ListEpisodesOpts {
  /** Particle podcast ID (NOT slug — use `listPodcasts` to resolve). */
  podcastId: string;
  publishedAfter?: string;
  publishedBefore?: string;
  cursor?: string;
  limit?: number;
}

export interface GetTranscriptOpts {
  episodeId: string;
  /** Episode-absolute seconds — Particle filter param drops the `_seconds` suffix. */
  start?: number;
  end?: number;
}

export interface ListClipsForEpisodeOpts {
  episodeId: string;
  cursor?: string;
  limit?: number;
}

export interface ParticleClient {
  searchByContent(opts: SearchByContentOpts): Promise<PaginatedResponse<ParticleSearchResult>>;
  searchEntityMentions(opts: SearchEntityMentionsOpts): Promise<PaginatedResponse<ParticleMentionResult>>;
  listEntities(opts: ListEntitiesOpts): Promise<PaginatedResponse<ParticleEntity>>;
  listPodcasts(opts: ListPodcastsOpts): Promise<PaginatedResponse<ParticlePodcast>>;
  listEpisodes(opts: ListEpisodesOpts): Promise<PaginatedResponse<ParticleEpisode>>;
  getClip(clipId: string): Promise<ParticleClip>;
  getClipTranscript(opts: GetTranscriptOpts): Promise<ParticleEpisodeTranscript>;
  getWordLevelTranscript(opts: GetTranscriptOpts): Promise<ParticleWordTranscript>;
  listClipsForEpisode(opts: ListClipsForEpisodeOpts): Promise<PaginatedResponse<ParticleClip>>;
}

/**
 * Hardcoded tier per endpoint — mirrors the cost-estimate solutions doc.
 * Every Particle endpoint we use is one of these; new endpoints must
 * be added before they're called.
 */
const ENDPOINT_TIER: Record<string, ParticleTier> = {
  "podcasts.search": "premium",
  "podcasts.mentions": "premium",
  "podcasts.clips.get": "premium",
  "podcasts.transcript.lines": "premium",
  "podcasts.transcript.words": "premium",
  "entities.list": "standard",
  "podcasts.list": "standard",
  "podcasts.episodes.list": "standard",
  "podcasts.episodes.clips.list": "standard",
};

export function createParticleClient(config: ParticleClientOptions): ParticleClient {
  const call = <T>(endpoint: string, path: string): Promise<T> =>
    trackedCall<T>({
      endpoint,
      url: `${BASE_URL}${path}`,
      tier: ENDPOINT_TIER[endpoint] ?? "standard",
      supabase: config.supabase,
      fetcher: config.fetcher,
      sleep: config.sleep,
      timeoutMs: config.timeoutMs,
    });

  const buildQuery = (params: Record<string, string | number | undefined>): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const qs = query.toString();
    return qs ? `?${qs}` : "";
  };

  // Path segments must be encoded — Particle IDs are short opaque strings
  // today, but defending against future characters is cheap insurance.
  const id = (segment: string) => encodeURIComponent(segment);

  return {
    async searchByContent(opts) {
      const qs = buildQuery({
        keyword_search: opts.keyword,
        semantic_search: opts.semantic,
        since: opts.since,
        until: opts.until,
        cursor: opts.cursor,
        limit: opts.limit,
      });
      return call("podcasts.search", `/v1/podcasts/search${qs}`);
    },

    async searchEntityMentions(opts) {
      const qs = buildQuery({
        entity_id: opts.entityId,
        since: opts.since,
        until: opts.until,
        cursor: opts.cursor,
        limit: opts.limit,
      });
      return call("podcasts.mentions", `/v1/podcasts/mentions${qs}`);
    },

    async listEntities(opts) {
      const qs = buildQuery({ q: opts.q, limit: opts.limit });
      return call("entities.list", `/v1/entities${qs}`);
    },

    async listPodcasts(opts) {
      const qs = buildQuery({ q: opts.q, limit: opts.limit });
      return call("podcasts.list", `/v1/podcasts${qs}`);
    },

    async listEpisodes(opts) {
      const qs = buildQuery({
        podcast_id: opts.podcastId,
        published_after: opts.publishedAfter,
        published_before: opts.publishedBefore,
        cursor: opts.cursor,
        limit: opts.limit,
      });
      return call("podcasts.episodes.list", `/v1/podcasts/episodes${qs}`);
    },

    async getClip(clipId) {
      return call("podcasts.clips.get", `/v1/podcasts/clips/${id(clipId)}`);
    },

    async getClipTranscript(opts) {
      const qs = buildQuery({ start: opts.start, end: opts.end });
      return call(
        "podcasts.transcript.lines",
        `/v1/podcasts/episodes/${id(opts.episodeId)}/transcript${qs}`,
      );
    },

    async getWordLevelTranscript(opts) {
      const qs = buildQuery({ start: opts.start, end: opts.end });
      return call(
        "podcasts.transcript.words",
        `/v1/podcasts/episodes/${id(opts.episodeId)}/transcript/words${qs}`,
      );
    },

    async listClipsForEpisode(opts) {
      const qs = buildQuery({ cursor: opts.cursor, limit: opts.limit });
      return call(
        "podcasts.episodes.clips.list",
        `/v1/podcasts/episodes/${id(opts.episodeId)}/clips${qs}`,
      );
    },
  };
}

/**
 * Walks a paginated endpoint until exhausted (or maxPages, whichever comes
 * first). The bound prevents an unexpectedly large result set from spending
 * the full per-call budget — callers should pick a maxPages value that
 * reflects their expected ceiling.
 */
export async function paginateAll<T>(
  fetchPage: (cursor?: string) => Promise<PaginatedResponse<T>>,
  options: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = options.maxPages ?? 10;
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor);
    out.push(...page.data);
    if (!page.has_more) break;
    cursor = page.cursor;
  }
  return out;
}
