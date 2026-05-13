/**
 * Particle client unit tests.
 *
 * Mocks `fetch` and Supabase to keep the suite fast and offline-safe. The
 * cost-tracking write is mocked at the SupabaseClient interface level —
 * the live api_calls write is exercised in U8's integration test.
 */

import { describe, expect, it, vi } from "vitest";

import {
  createParticleClient,
  paginateAll,
  type ParticleClient,
} from "@/lib/particle/client";
import { estimateCost } from "@/lib/particle/cost-estimate";
import { trackedCall, type Fetcher } from "@/lib/particle/tracked-call";
import {
  ParticleAuthError,
  ParticleRateLimitError,
  ParticleSchemaError,
  ParticleTransientError,
  type PaginatedResponse,
} from "@/lib/particle/types";

// ─── Test doubles ────────────────────────────────────────────────────

interface RecordedCall {
  endpoint: string;
  cost_usd: number;
  tier: string;
  team_id?: string | null;
  metadata: Record<string, unknown>;
}

interface SupabaseStub {
  from(table: string): { insert(row: unknown): Promise<{ error: null }> };
}

function makeSupabaseStub(recorded: RecordedCall[]): SupabaseStub {
  return {
    from: () => ({
      insert: async (row: unknown) => {
        recorded.push(row as RecordedCall);
        return { error: null };
      },
    }),
  };
}

function makeRejectingSupabaseStub(): SupabaseStub {
  return {
    from: () => ({
      insert: async () => {
        throw new Error("supabase network down");
      },
    }),
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeClient(
  fetcher: Fetcher,
  recorded: RecordedCall[],
): { particle: ParticleClient; stub: SupabaseStub } {
  const stub = makeSupabaseStub(recorded);
  const particle = createParticleClient({
    supabase: stub as unknown as Parameters<typeof createParticleClient>[0]["supabase"],
    fetcher,
    sleep: async () => {
      /* fast tests */
    },
    timeoutMs: 1_000,
  });
  return { particle, stub };
}

// ─── Happy path ──────────────────────────────────────────────────────

describe("Particle client — happy path", () => {
  it("searchEntityMentions returns typed results and writes one api_calls row at premium tier", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            episode: { id: "ep1", title: "Test", podcast: { id: "p1", title: "Pod" } },
            mention_count: 3,
            mention_variants: ["Brock Purdy"],
          },
        ],
        has_more: false,
      }),
    );
    const { particle } = makeClient(fetcher, recorded);

    const result = await particle.searchEntityMentions({ entityId: "ent_x" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].mention_count).toBe(3);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].endpoint).toBe("podcasts.mentions");
    expect(recorded[0].tier).toBe("premium");
    expect(recorded[0].cost_usd).toBeCloseTo(0.008, 6);
  });

  it("listEntities is billed at standard tier", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);

    await particle.listEntities({ q: "test" });
    expect(recorded[0].tier).toBe("standard");
    expect(recorded[0].cost_usd).toBeCloseTo(0.004, 6);
  });
});

// ─── Zero results still cost ─────────────────────────────────────────

describe("Particle client — zero results still cost", () => {
  it("an empty data array still writes a tracked call with non-zero cost", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);

    const result = await particle.searchByContent({ keyword: "nothing matches this" });

    expect(result.data).toHaveLength(0);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].cost_usd).toBeGreaterThan(0);
  });
});

// ─── 429 retry with backoff ──────────────────────────────────────────

describe("Particle client — 429 retry", () => {
  it("retries 429 → 429 → 200 and logs three rows (two retries cost zero, success costs one call)", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error_code: "rate_limit_exceeded" }, { "Retry-After": "0" }))
      .mockResolvedValueOnce(jsonResponse(429, { error_code: "rate_limit_exceeded" }, { "Retry-After": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);

    const result = await particle.listEntities({ q: "test" });

    expect(result.data).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(recorded).toHaveLength(3);
    expect(recorded[0].cost_usd).toBe(0);
    expect(recorded[1].cost_usd).toBe(0);
    expect(recorded[2].cost_usd).toBeGreaterThan(0);
  });
});

// ─── 5xx retry → success ─────────────────────────────────────────────

describe("Particle client — 5xx then success", () => {
  it("retries 503 → 503 → 200 and logs three rows", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "upstream" }))
      .mockResolvedValueOnce(jsonResponse(503, { error: "upstream" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);

    await particle.listEntities({ q: "test" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(recorded).toHaveLength(3);
    expect(recorded[0].cost_usd).toBe(0);
    expect(recorded[1].cost_usd).toBe(0);
    expect(recorded[2].cost_usd).toBeGreaterThan(0);
  });
});

// ─── 408 retry ───────────────────────────────────────────────────────

describe("Particle client — 408 retried", () => {
  it("treats 408 like 5xx and retries up to MAX_ATTEMPTS", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(408, { error: "request timeout" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);

    await particle.listEntities({ q: "test" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(recorded[0].cost_usd).toBe(0);
    expect(recorded[1].cost_usd).toBeGreaterThan(0);
  });
});

// ─── 401 terminal ────────────────────────────────────────────────────

describe("Particle client — 401 terminal", () => {
  it("throws ParticleAuthError immediately and writes one row with cost_usd = 0", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error_code: "api_key_required" }));
    const { particle } = makeClient(fetcher, recorded);

    await expect(particle.listEntities({ q: "x" })).rejects.toThrow(ParticleAuthError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].cost_usd).toBe(0);
  });
});

// ─── 422 terminal validation ─────────────────────────────────────────

describe("Particle client — 422 terminal validation", () => {
  it("throws ParticleSchemaError without retry; cost is charged because the request hit the server", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        error_code: "validation_error",
        detail: "entity_id required",
      }),
    );
    const { particle } = makeClient(fetcher, recorded);

    await expect(
      particle.searchEntityMentions({ entityId: "" }),
    ).rejects.toThrow(ParticleSchemaError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].cost_usd).toBeGreaterThan(0);
  });
});

// ─── 5xx exhausted ───────────────────────────────────────────────────

describe("Particle client — 5xx exhausted", () => {
  it("retries up to MAX_ATTEMPTS then throws ParticleTransientError", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi.fn().mockResolvedValue(jsonResponse(503, { error: "upstream" }));
    const { particle } = makeClient(fetcher, recorded);

    await expect(particle.listEntities({ q: "x" })).rejects.toThrow(ParticleTransientError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

// ─── 429 exhausted ────────────────────────────────────────────────────

describe("Particle client — 429 exhausted", () => {
  it("throws ParticleRateLimitError when 429s never let up; retryAfterSeconds preserved", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi.fn().mockResolvedValue(
      jsonResponse(429, { error_code: "rate_limit_exceeded" }, { "Retry-After": "5" }),
    );
    const { particle } = makeClient(fetcher, recorded);

    let caught: unknown;
    try {
      await particle.listEntities({ q: "x" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ParticleRateLimitError);
    expect((caught as ParticleRateLimitError).retryAfterSeconds).toBe(5);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("clamps absurd Retry-After values to 60 seconds in the surfaced error", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi.fn().mockResolvedValue(
      jsonResponse(429, { error_code: "rate_limit_exceeded" }, { "Retry-After": "86400" }),
    );
    const { particle } = makeClient(fetcher, recorded);

    let caught: unknown;
    try {
      await particle.listEntities({ q: "x" });
    } catch (err) {
      caught = err;
    }
    expect((caught as ParticleRateLimitError).retryAfterSeconds).toBe(60);
  });
});

// ─── Schema error on non-JSON body ───────────────────────────────────

describe("Particle client — schema error", () => {
  it("surfaces a non-JSON body as ParticleSchemaError", async () => {
    const recorded: RecordedCall[] = [];
    const malformed = new Response("<html>oops</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    const fetcher: Fetcher = vi.fn().mockResolvedValue(malformed);
    const { particle } = makeClient(fetcher, recorded);

    await expect(particle.listEntities({ q: "x" })).rejects.toThrow(ParticleSchemaError);
  });
});

// ─── AbortSignal terminal ────────────────────────────────────────────

describe("Particle client — caller-initiated abort", () => {
  it("does not retry when the caller's signal aborts mid-flight", async () => {
    const recorded: RecordedCall[] = [];
    const controller = new AbortController();
    controller.abort();
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetcher: Fetcher = vi.fn().mockRejectedValue(abortError);

    await expect(
      trackedCall({
        endpoint: "podcasts.mentions",
        url: "https://api.particle.pro/v1/podcasts/mentions",
        supabase: makeSupabaseStub(recorded) as unknown as Parameters<typeof trackedCall>[0]["supabase"],
        fetcher,
        sleep: async () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ─── logCall best-effort: telemetry write failure does not cascade ──

describe("Particle client — logCall is best-effort", () => {
  it("a Supabase write failure does not replace the actual Particle outcome", async () => {
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));
    const stub = makeRejectingSupabaseStub();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await trackedCall<{ data: unknown[]; has_more: boolean }>({
      endpoint: "entities.list",
      url: "https://api.particle.pro/v1/entities?q=x",
      supabase: stub as unknown as Parameters<typeof trackedCall>[0]["supabase"],
      fetcher,
      sleep: async () => {},
    });
    expect(result.data).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ─── Network failure path ────────────────────────────────────────────

describe("Particle client — network failure", () => {
  it("retries network failures up to MAX_ATTEMPTS, then throws ParticleTransientError", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const { particle } = makeClient(fetcher, recorded);

    await expect(particle.listEntities({ q: "x" })).rejects.toThrow(ParticleTransientError);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(recorded).toHaveLength(3);
    expect(recorded.every((r) => r.cost_usd === 0)).toBe(true);
  });

  it("recovers when a network failure is followed by a successful retry", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);

    await particle.listEntities({ q: "x" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(recorded).toHaveLength(2);
    expect(recorded[0].cost_usd).toBe(0);
    expect(recorded[1].cost_usd).toBeGreaterThan(0);
  });
});

// ─── searchByContent type narrowing ──────────────────────────────────

describe("Particle client — searchByContent discriminated union", () => {
  it("accepts keyword-only", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);
    await particle.searchByContent({ keyword: "49ers" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts semantic-only", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);
    await particle.searchByContent({ semantic: "49ers offseason" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // The compile-time guarantee is the value here; this runtime test just
  // confirms the call shape works as expected.
  it("propagates both params when supplied", async () => {
    const recorded: RecordedCall[] = [];
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));
    const { particle } = makeClient(fetcher, recorded);
    await particle.searchByContent({ keyword: "49ers", semantic: "offseason" });
    const url = (fetcher as unknown as { mock: { calls: [string][] } }).mock.calls[0][0];
    expect(url).toContain("keyword_search=49ers");
    expect(url).toContain("semantic_search=");
  });
});

// ─── Cost dry-run ────────────────────────────────────────────────────

describe("estimateCost — dry-run helper", () => {
  it("returns a non-zero cost that scales with input size", () => {
    const small = estimateCost({
      universe: { entities: ["a"], storylines: ["x"] },
      podcastCount: 1,
      windowDays: 1,
    });
    const big = estimateCost({
      universe: {
        entities: Array.from({ length: 30 }, (_, i) => `e${i}`),
        storylines: Array.from({ length: 8 }, (_, i) => `s${i}`),
      },
      podcastCount: 31,
      windowDays: 3,
    });

    expect(small.totalUsd).toBeGreaterThan(0);
    expect(big.totalUsd).toBeGreaterThan(small.totalUsd);
    const sumSmall =
      small.breakdown.entityMentions.costUsd +
      small.breakdown.semanticSearch.costUsd +
      small.breakdown.listEpisodes.costUsd +
      small.breakdown.transcript.costUsd;
    expect(sumSmall).toBeCloseTo(small.totalUsd, 6);
  });

  it("scales linearly with windowDays for transcript cost", () => {
    const oneDay = estimateCost({
      universe: { entities: ["a"], storylines: ["x"] },
      podcastCount: 1,
      windowDays: 1,
    });
    const threeDays = estimateCost({
      universe: { entities: ["a"], storylines: ["x"] },
      podcastCount: 1,
      windowDays: 3,
    });
    expect(threeDays.breakdown.transcript.calls).toBe(oneDay.breakdown.transcript.calls * 3);
  });
});

// ─── paginateAll ─────────────────────────────────────────────────────

describe("paginateAll", () => {
  it("walks pages until has_more=false and unions the results", async () => {
    const pages: PaginatedResponse<{ id: number }>[] = [
      { data: [{ id: 1 }, { id: 2 }], has_more: true, cursor: "p2" },
      { data: [{ id: 3 }], has_more: false },
    ];
    let i = 0;
    const all = await paginateAll(async () => pages[i++]);
    expect(all).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("respects maxPages bound", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      data: [{ id: 1 }],
      has_more: true,
      cursor: "x",
    });
    const all = await paginateAll(
      fetchPage as unknown as () => Promise<PaginatedResponse<{ id: number }>>,
      { maxPages: 3 },
    );
    expect(all).toHaveLength(3);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

// ─── Contract snapshots ──────────────────────────────────────────────

import searchSnapshot from "@/lib/particle/__contracts__/search.json";
import mentionsSnapshot from "@/lib/particle/__contracts__/mentions.json";
import entitiesSnapshot from "@/lib/particle/__contracts__/entities.json";
import podcastsSnapshot from "@/lib/particle/__contracts__/podcasts.json";
import episodesSnapshot from "@/lib/particle/__contracts__/episodes.json";
import clipSnapshot from "@/lib/particle/__contracts__/clip.json";
import transcriptLinesSnapshot from "@/lib/particle/__contracts__/transcript-lines.json";
import transcriptWordsSnapshot from "@/lib/particle/__contracts__/transcript-words.json";
import episodeClipsSnapshot from "@/lib/particle/__contracts__/episode-clips.json";

describe("Particle contract snapshots — required fields present", () => {
  it("search response carries the fields the client reads", () => {
    expect(searchSnapshot.data[0].episode.id).toBeTypeOf("string");
    expect(searchSnapshot.data[0].episode.podcast.id).toBeTypeOf("string");
    expect(searchSnapshot.data[0].segment.id).toBeTypeOf("string");
    expect(searchSnapshot.data[0].segment.start_seconds).toBeTypeOf("number");
    expect(searchSnapshot.data[0].segment.end_seconds).toBeTypeOf("number");
    expect(searchSnapshot.has_more).toBeTypeOf("boolean");
  });

  it("mentions response includes mention_count and windows", () => {
    expect(mentionsSnapshot.data[0].mention_count).toBeTypeOf("number");
    expect(Array.isArray(mentionsSnapshot.data[0].windows)).toBe(true);
  });

  it("entities list returns canonical id + slug + name", () => {
    expect(entitiesSnapshot.data[0].id).toBeTypeOf("string");
    expect(entitiesSnapshot.data[0].slug).toBeTypeOf("string");
    expect(entitiesSnapshot.data[0].name).toBeTypeOf("string");
  });

  it("podcast catalog list returns id/title", () => {
    expect(podcastsSnapshot.data[0].id).toBeTypeOf("string");
    expect(podcastsSnapshot.data[0].title).toBeTypeOf("string");
  });

  it("episodes list response has audio_url, podcast nested ref, published_at", () => {
    expect(episodesSnapshot.data[0].id).toBeTypeOf("string");
    expect(episodesSnapshot.data[0].audio_url).toBeTypeOf("string");
    expect(episodesSnapshot.data[0].podcast.id).toBeTypeOf("string");
    expect(episodesSnapshot.data[0].published_at).toBeTypeOf("string");
  });

  it("clip detail has audio_url, engagement_score, speaker", () => {
    expect(clipSnapshot.id).toBeTypeOf("string");
    expect(clipSnapshot.audio_url).toBeTypeOf("string");
    expect(clipSnapshot.start_seconds).toBeTypeOf("number");
    expect(clipSnapshot.engagement_score).toBeTypeOf("number");
  });

  it("transcript-lines has episode_id and lines array with start/end seconds", () => {
    expect(transcriptLinesSnapshot.episode_id).toBeTypeOf("string");
    expect(Array.isArray(transcriptLinesSnapshot.lines)).toBe(true);
    expect(transcriptLinesSnapshot.lines[0].text).toBeTypeOf("string");
    expect(transcriptLinesSnapshot.lines[0].start_seconds).toBeTypeOf("number");
  });

  it("transcript-words has words array with text/type/start/end", () => {
    expect(Array.isArray(transcriptWordsSnapshot.words)).toBe(true);
    expect(transcriptWordsSnapshot.words[0].text).toBeTypeOf("string");
    expect(transcriptWordsSnapshot.words[0].start_seconds).toBeTypeOf("number");
  });

  it("episode-clips list returns clips with audio_url + engagement_score", () => {
    expect(episodeClipsSnapshot.data[0].id).toBeTypeOf("string");
    expect(episodeClipsSnapshot.data[0].audio_url).toBeTypeOf("string");
    expect(episodeClipsSnapshot.data[0].engagement_score).toBeTypeOf("number");
  });
});

// ─── Per-team cost attribution (U1) ─────────────────────────────────

describe("Particle client — per-team cost attribution", () => {
  it("writes team_id on api_calls rows when factory is constructed with teamId", async () => {
    const recorded: RecordedCall[] = [];
    const stub = makeSupabaseStub(recorded);
    const fetcher: Fetcher = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [] }),
    );
    const particle = createParticleClient({
      supabase: stub as unknown as Parameters<typeof createParticleClient>[0]["supabase"],
      teamId: "49ers",
      fetcher,
      sleep: async () => {},
      timeoutMs: 1_000,
    });
    await particle.searchEntityMentions({ entityId: "ent-test" });
    expect(recorded[0].team_id).toBe("49ers");
  });

  it("writes null team_id when factory is constructed without teamId (legacy callers)", async () => {
    const recorded: RecordedCall[] = [];
    const stub = makeSupabaseStub(recorded);
    const fetcher: Fetcher = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [] }),
    );
    const particle = createParticleClient({
      supabase: stub as unknown as Parameters<typeof createParticleClient>[0]["supabase"],
      fetcher,
      sleep: async () => {},
      timeoutMs: 1_000,
    });
    await particle.searchEntityMentions({ entityId: "ent-test" });
    expect(recorded[0].team_id).toBeNull();
  });

  it("throws at factory construction when teamId is not a known team", () => {
    const recorded: RecordedCall[] = [];
    const stub = makeSupabaseStub(recorded);
    expect(() =>
      createParticleClient({
        supabase: stub as unknown as Parameters<typeof createParticleClient>[0]["supabase"],
        teamId: "fake-team",
      }),
    ).toThrow(/unknown team_id/);
  });
});
