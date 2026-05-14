/**
 * Minimal Particle client for one-off slug→id resolution at seed time.
 *
 * The full client at `lib/particle/client.ts` is gated by `import
 * "server-only"` so it can't be loaded outside Next.js / vitest
 * contexts — that includes the standalone Node seed runner. The seed
 * doesn't need cost telemetry (it's a one-time op, not the daily worker
 * path that has to track every cent), so this file makes raw fetches
 * directly and skips the cost-tracked wrapper entirely.
 *
 * Same API key, same endpoints. The two clients share types via
 * `lib/particle/types.ts`.
 */

import type {
  PaginatedResponse,
  ParticleEntity,
  ParticlePodcast,
} from "../particle/types.ts";

const BASE_URL = "https://api.particle.pro";

export interface SeedParticleResolver {
  listPodcasts(opts: { q: string; limit?: number }): Promise<PaginatedResponse<ParticlePodcast>>;
  listEntities(opts: { q: string; limit?: number }): Promise<PaginatedResponse<ParticleEntity>>;
  getPodcastBySlug(slugOrId: string): Promise<ParticlePodcast>;
  getEntityBySlug(slugOrId: string): Promise<ParticleEntity>;
}

export function createSeedParticleResolver(apiKey: string): SeedParticleResolver {
  if (!apiKey) {
    throw new Error("createSeedParticleResolver: apiKey is required");
  }

  const get = async <T>(path: string, query: Record<string, string | number | undefined>): Promise<T> => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
    const response = await fetch(url, {
      headers: { "X-API-Key": apiKey },
    });
    if (!response.ok) {
      throw new Error(
        `seed-resolver ${path} returned HTTP ${response.status}: ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  };

  return {
    async listPodcasts({ q, limit }) {
      return get<PaginatedResponse<ParticlePodcast>>("/v1/podcasts", { q, limit });
    },
    async listEntities({ q, limit }) {
      return get<PaginatedResponse<ParticleEntity>>("/v1/entities", { q, limit });
    },
    async getPodcastBySlug(slugOrId) {
      return get<ParticlePodcast>(`/v1/podcasts/${encodeURIComponent(slugOrId)}`, {});
    },
    async getEntityBySlug(slugOrId) {
      return get<ParticleEntity>(`/v1/entities/${encodeURIComponent(slugOrId)}`, {});
    },
  };
}
