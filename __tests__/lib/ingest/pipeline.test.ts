/**
 * Ingest pipeline integration tests.
 *
 * Mocks Particle + Anthropic at the client interface level. Mocks Supabase
 * with an in-memory recorder so persistence assertions don't require a
 * live DB. The live-DB equivalent runs via U8's manual-trigger
 * verification once route handlers land.
 */

import { describe, expect, it, vi } from "vitest";

import type { AnthropicClient } from "@/lib/anthropic/client";
import { EPISODE_EXTRACTION_PROMPT_VERSION, type EpisodeMoment } from "@/lib/anthropic/types";
import { runIngestPipeline } from "@/lib/ingest/pipeline";
import type { ParticleClient } from "@/lib/particle/client";
import type {
  ParticleEpisodeAd,
  ParticleMentionResult,
  ParticleSearchResult,
  ParticleTranscriptLine,
} from "@/lib/particle/types";

const TEAM_ID = "test-team";
const USER_ID = "00000000-0000-0000-0000-000000000001";

interface RecordedQuery {
  table: string;
  op: string;
  args: unknown;
}

function makeSupabaseStub(
  initialState: Partial<{
    team: Record<string, unknown>;
    universe: Record<string, unknown>;
    podcasts: Record<string, unknown>[];
    segments: Record<string, unknown>[];
  }> = {},
): {
  client: Parameters<typeof runIngestPipeline>[0]["supabase"];
  recorded: RecordedQuery[];
  store: {
    teams: Record<string, unknown>[];
    universes: Record<string, unknown>[];
    podcasts: Record<string, unknown>[];
    episodes: Record<string, unknown>[];
    segments: Record<string, unknown>[];
    cards: Record<string, unknown>[];
    voices: Record<string, unknown>[];
    voice_positions: Record<string, unknown>[];
  };
} {
  const recorded: RecordedQuery[] = [];
  const store = {
    teams: initialState.team ? [initialState.team] : [],
    universes: initialState.universe ? [initialState.universe] : [],
    podcasts: initialState.podcasts ?? [],
    episodes: [] as Record<string, unknown>[],
    segments: initialState.segments ?? [],
    cards: [] as Record<string, unknown>[],
    voices: [] as Record<string, unknown>[],
    voice_positions: [] as Record<string, unknown>[],
  };

  const tableOf = (table: string): Record<string, unknown>[] => {
    switch (table) {
      case "teams":
        return store.teams;
      case "universes":
        return store.universes;
      case "podcasts":
        return store.podcasts;
      case "episodes":
        return store.episodes;
      case "segments":
        return store.segments;
      case "cards":
        return store.cards;
      case "voices":
        return store.voices;
      case "voice_positions":
        return store.voice_positions;
      default:
        throw new Error(`unknown table: ${table}`);
    }
  };

  const builder = (table: string) => {
    const filters: Array<{ col: string; op: string; value: unknown }> = [];
    let mode: "select" | "upsert" | "insert" | "update" = "select";
    let payload: unknown = undefined;
    let selectColumns: string | undefined;
    let counted = false;

    const exec = async () => {
      const rows = tableOf(table);
      const matchRow = (row: Record<string, unknown>): boolean =>
        filters.every((f) => {
          if (f.op === "eq") return row[f.col] === f.value;
          if (f.op === "in") return (f.value as unknown[]).includes(row[f.col]);
          return true;
        });

      if (mode === "select") {
        const data = rows.filter(matchRow);
        recorded.push({ table, op: "select", args: { filters, columns: selectColumns } });
        return { data, error: null, count: counted ? data.length : null };
      }
      if (mode === "upsert") {
        const incoming = Array.isArray(payload) ? payload : [payload];
        let inserted = 0;
        for (const item of incoming as Record<string, unknown>[]) {
          // Find existing by any unique-ish column the test data set uses.
          const idx = rows.findIndex((row) => {
            // Unique conflict columns we care about per table.
            const uniques: Record<string, string[]> = {
              episodes: ["particle_episode_id"],
              segments: ["particle_segment_id"],
              cards: ["user_id+team_id+episode_id"],
              podcasts: ["particle_slug"],
            };
            const keys = uniques[table] ?? ["id"];
            return keys.every((k) => {
              if (k === "user_id+team_id+episode_id") {
                return (
                  row.user_id === item.user_id &&
                  row.team_id === item.team_id &&
                  row.episode_id === item.episode_id
                );
              }
              return row[k] === item[k];
            });
          });
          if (idx === -1) {
            const rowWithId = { id: `gen_${rows.length}_${Math.random().toString(36).slice(2, 7)}`, ...item };
            rows.push(rowWithId);
            inserted += 1;
          } else {
            rows[idx] = { ...rows[idx], ...item };
          }
        }
        recorded.push({ table, op: "upsert", args: payload });
        // Always return array form so .single() / .maybeSingle() work uniformly.
        const data = rows.slice(-incoming.length);
        return { data, error: null, count: counted ? inserted : null };
      }
      if (mode === "update") {
        const matches = rows.filter(matchRow);
        for (const m of matches) Object.assign(m, payload);
        recorded.push({ table, op: "update", args: { filters, payload } });
        return { data: matches, error: null, count: null };
      }
      throw new Error(`mode ${mode} not implemented`);
    };

    const queryShape = {
      select(columns?: string, options?: { count?: string }) {
        selectColumns = columns;
        if (options?.count === "exact") counted = true;
        return queryShape;
      },
      eq(col: string, value: unknown) {
        filters.push({ col, op: "eq", value });
        return queryShape;
      },
      in(col: string, value: unknown[]) {
        filters.push({ col, op: "in", value });
        return queryShape;
      },
      maybeSingle() {
        return exec().then((r) => ({ ...r, data: (r.data as unknown[])[0] ?? null }));
      },
      single() {
        return exec().then((r) => ({ ...r, data: (r.data as unknown[])[0] ?? null }));
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return exec().then(onFulfilled, onRejected);
      },
    };

    return {
      select(columns?: string, options?: { count?: string }) {
        mode = "select";
        return queryShape.select(columns, options);
      },
      upsert(p: unknown, options?: { onConflict?: string; count?: string }) {
        mode = "upsert";
        payload = p;
        if (options?.count === "exact") counted = true;
        return queryShape;
      },
      insert(p: unknown) {
        mode = "insert";
        payload = p;
        return queryShape;
      },
      update(p: unknown) {
        mode = "update";
        payload = p;
        return queryShape;
      },
    };
  };

  // The pipeline's only Supabase touch points are typed access to specific
  // tables; the rest of the SupabaseClient surface is unused.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from: builder } as any;
  return { client, recorded, store };
}

function makeParticleStub(
  responses: {
    mentions?: Record<string, ParticleMentionResult[]>;
    search?: Record<string, ParticleSearchResult[]>;
    /**
     * Per-entity-id list-episodes responses, used by the U4 list-episodes
     * discovery mode. The pipeline calls `listEpisodes({ entityId })` once
     * per universe entity and dedupes overlapping results.
     */
    episodes?: Record<string, import("@/lib/particle/types").ParticleEpisode[]>;
    transcripts?: Record<string, { text: string } | { lines: ParticleTranscriptLine[] }>;
    /**
     * Per-episode ad windows. Default: no ads.
     * Use the literal string "throw" to simulate a transient error from
     * listEpisodeAds, which the pipeline must tolerate by falling back to
     * an unstripped transcript.
     */
    ads?: Record<string, ParticleEpisodeAd[] | "throw">;
  } = {},
): ParticleClient {
  return {
    searchEntityMentions: async ({ entityId }) => {
      const data = responses.mentions?.[entityId] ?? [];
      return { data, has_more: false };
    },
    searchByContent: async ({ semantic }) => {
      const data = (semantic && responses.search?.[semantic]) ?? [];
      return { data, has_more: false };
    },
    getClipTranscript: async ({ episodeId }) => {
      const fixture = responses.transcripts?.[episodeId];
      if (!fixture) {
        return { episode_id: episodeId, lines: [] };
      }
      if ("lines" in fixture) {
        return { episode_id: episodeId, lines: fixture.lines };
      }
      return {
        episode_id: episodeId,
        // Single synthetic line covering the full transcript. The pipeline
        // uses transcript lines for moment-time mapping; tests don't care
        // about line-level granularity beyond "non-empty".
        lines: fixture.text
          ? [{ number: 1, start_seconds: 0, end_seconds: 3600, text: fixture.text }]
          : [],
      };
    },
    listEpisodeAds: async (episodeId) => {
      const fixture = responses.ads?.[episodeId];
      if (fixture === "throw") {
        throw new Error(`listEpisodeAds returned HTTP 404: not found for ${episodeId}`);
      }
      return { data: fixture ?? [], has_more: false };
    },
    getPodcastBySlug: async () => {
      throw new Error("not used");
    },
    getEntityBySlug: async () => {
      throw new Error("not used");
    },
    getEpisodeById: async () => {
      throw new Error("not used");
    },
    listEntities: async () => ({ data: [], has_more: false }),
    listPodcasts: async () => ({ data: [], has_more: false }),
    listEpisodes: async ({ entityId }) => {
      const data = (entityId && responses.episodes?.[entityId]) ?? [];
      return { data, has_more: false };
    },
    getClip: async () => {
      throw new Error("not used");
    },
    getWordLevelTranscript: async () => {
      throw new Error("not used");
    },
    listClipsForEpisode: async () => ({ data: [], has_more: false }),
  };
}

interface ExtractionFixture {
  moments: EpisodeMoment[];
  episode_rollup: string;
}

function makeAnthropicStub(
  extractionByEpisode: Record<string, ExtractionFixture>,
): AnthropicClient {
  // U4: the pipeline now makes one Claude call per episode via the
  // `extract_episode_moments` operation. Tests provide a canned extraction
  // result per episode (by particle_episode_id).
  let callIdx = 0;
  const fixtures = Object.entries(extractionByEpisode);

  return {
    createMessage: async (operation) => {
      if (operation !== "extract_episode_moments") {
        throw new Error(`unexpected operation: ${operation}`);
      }
      const fixture = fixtures[callIdx]?.[1] ?? { moments: [], episode_rollup: "" };
      callIdx += 1;
      return {
        id: `msg_${callIdx}`,
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5",
        stop_reason: "tool_use",
        stop_sequence: null,
        content: [
          {
            type: "tool_use",
            id: `tu_${callIdx}`,
            name: "submit_episode_extraction",
            input: {
              moments: fixture.moments,
              episode_rollup: fixture.episode_rollup,
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    },
  };
}

const universeFixture = {
  id: "uni_1",
  team_id: TEAM_ID,
  entities: ["brock-purdy", "fred-warner"],
  storylines: ["49ers offseason"],
  entity_id_map: { "brock-purdy": "ent_purdy", "fred-warner": "ent_warner" },
};

const teamFixture = {
  id: TEAM_ID,
  name: "Test 49ers",
  sport: "nfl",
  universe_id: "uni_1",
};

const podcastsFixture = [
  { id: "pod_local", particle_id: "pod_particle_1", particle_slug: "test-pod" },
];

// ─── Happy path ────────────────────────────────────────────────────

// ─── Voice memory writes (U4) ──────────────────────────────────────

describe("runIngestPipeline — voice memory writes (U4)", () => {
  it("writes a voice_position per moment when the episode's podcast has a Tier-A voice", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    // Configure a Tier-A voice for the fixture podcast. Pipeline's
    // loadVoiceLookup will discover this and route the moment's
    // position through to voice_positions.
    store.voices.push({
      id: "voice_test_pod",
      kind: "show",
      tier: "A",
      display_name: "Test Pod Voice",
      podcast_id: "pod_local",
    });

    const particle = makeParticleStub({
      mentions: {
        ent_purdy: [
          {
            episode: {
              id: "ep_voice_1",
              title: "Voice Memory Test Episode",
              published_at: "2026-05-09T12:00:00Z",
              podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
              audio_url: "https://example.test/episode.mp3",
            },
            mention_count: 1,
            mention_variants: ["Brock Purdy"],
            windows: [
              {
                segment: { id: "seg_voice_1", type: "TOPIC_DISCUSSION", title: "On Purdy contract" },
                start_seconds: 60,
                end_seconds: 120,
              },
            ],
          },
        ],
      },
      transcripts: {
        ep_voice_1: { text: "Purdy is worth every penny of the extension." },
      },
    });

    const anthropic = makeAnthropicStub({
      ep_voice_1: {
        moments: [
          {
            particle_segment_id: "seg_voice_1",
            start_seconds: 60,
            end_seconds: 120,
            summary: "Purdy's extension is justified at $53M AAV.",
            pull_quotes: ["Purdy is worth every penny of the extension."],
            bullets: ["Peer-comp argument.", "Justifies AAV.", "Generation-defining contract."],
            surfacing_entities: ["Purdy contract"],
          },
        ],
        episode_rollup: "Test rollup.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    expect(out.voicePositionsWritten).toBe(1);
    expect(store.voice_positions).toHaveLength(1);
    const position = store.voice_positions[0] as {
      voice_id: string;
      team_id: string;
      topic_key: string;
      position_summary: string;
      evidence_quote: string;
    };
    expect(position.voice_id).toBe("voice_test_pod");
    expect(position.team_id).toBe(TEAM_ID);
    expect(position.topic_key).toBe("purdy-contract");
    expect(position.position_summary).toBe("Purdy's extension is justified at $53M AAV.");
    expect(position.evidence_quote).toBe("Purdy is worth every penny of the extension.");
  });

  it("does NOT write voice_positions when the episode's podcast has no Tier-A voice", async () => {
    // No voice seeded → Tier B/C path → no voice_position writes
    // even though the moment lands in segments and cards as usual.
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    // store.voices is empty by default — Tier-B/C behaviour.

    const particle = makeParticleStub({
      mentions: {
        ent_purdy: [
          {
            episode: {
              id: "ep_no_voice_1",
              title: "Tier-C Show Episode",
              published_at: "2026-05-09T12:00:00Z",
              podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
              audio_url: "https://example.test/episode.mp3",
            },
            mention_count: 1,
            mention_variants: ["Brock Purdy"],
            windows: [
              {
                segment: { id: "seg_no_voice_1", type: "TOPIC_DISCUSSION", title: "On Purdy" },
                start_seconds: 60,
                end_seconds: 120,
              },
            ],
          },
        ],
      },
      transcripts: {
        ep_no_voice_1: { text: "Purdy stuff." },
      },
    });

    const anthropic = makeAnthropicStub({
      ep_no_voice_1: {
        moments: [
          {
            particle_segment_id: "seg_no_voice_1",
            start_seconds: 60,
            end_seconds: 120,
            summary: "A Tier-C take.",
            pull_quotes: ["Purdy stuff."],
            bullets: ["A.", "B.", "C."],
            surfacing_entities: ["Purdy contract"],
          },
        ],
        episode_rollup: "Test rollup.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    // Segments and cards still land as normal — only voice memory skipped.
    expect(out.segmentsPersisted).toBe(1);
    expect(out.cardsPersisted).toBe(1);
    expect(out.voicePositionsWritten).toBe(0);
    expect(store.voice_positions).toHaveLength(0);
  });
});

describe("runIngestPipeline — happy path", () => {
  it("persists episodes, segments, and cards from a single mention", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });

    const particle = makeParticleStub({
      mentions: {
        ent_purdy: [
          {
            episode: {
              id: "ep_1",
              title: "Test Episode",
              published_at: "2026-05-09T12:00:00Z",
              podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
              audio_url: "https://example.test/episode.mp3",
            },
            mention_count: 1,
            mention_variants: ["Brock Purdy"],
            windows: [
              {
                segment: { id: "seg_1", type: "TOPIC_DISCUSSION", title: "On Purdy" },
                start_seconds: 60,
                end_seconds: 120,
              },
            ],
          },
        ],
      },
      transcripts: {
        ep_1: { text: "Mina Kimes: Brock Purdy looks comfortable in the pocket." },
      },
    });

    const anthropic = makeAnthropicStub({
      ep_1: {
        moments: [
          {
            particle_segment_id: "seg_1",
            start_seconds: 60,
            end_seconds: 120,
            summary: "Purdy looks comfortable in the pocket per Mina Kimes.",
            pull_quotes: ["Brock Purdy looks comfortable in the pocket."],
            bullets: ["Comfortable pocket presence.", "Mina Kimes' read.", "First take of the segment."],
            surfacing_entities: ["brock-purdy"],
          },
        ],
        episode_rollup: "Purdy's pocket presence is the underrated story.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    expect(out.episodesPersisted).toBe(1);
    expect(out.segmentsPersisted).toBe(1);
    expect(out.cardsPersisted).toBe(1);
    expect(out.segmentsRejectedOffTopic).toBe(0);
    expect(store.episodes).toHaveLength(1);
    expect(store.segments).toHaveLength(1);
    expect(store.cards).toHaveLength(1);
    expect((store.cards[0] as { user_id: string }).user_id).toBe(USER_ID);
  });
});

// ─── Off-topic ─────────────────────────────────────────────────────

describe("runIngestPipeline — off-topic segment", () => {
  it("counts off-topic segments and skips card persistence for them", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });

    const particle = makeParticleStub({
      mentions: {
        ent_purdy: [
          {
            episode: {
              id: "ep_2",
              title: "Mostly NFC East",
              podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
              published_at: "2026-05-09T12:00:00Z",
            },
            mention_count: 1,
            windows: [
              {
                segment: { id: "seg_2", title: "Tangent" },
                start_seconds: 10,
                end_seconds: 30,
              },
            ],
          },
        ],
      },
      transcripts: { ep_2: { text: "Some content." } },
    });

    // U4: off-topic = extractor returns empty moments array for the episode.
    const anthropic = makeAnthropicStub({
      ep_2: { moments: [], episode_rollup: "" },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    expect(out.segmentsRejectedOffTopic).toBe(1);
    expect(out.cardsPersisted).toBe(0);
  });
});

// ─── Empty Particle result ─────────────────────────────────────────

describe("runIngestPipeline — empty Particle results", () => {
  it("completes with zero counts and writes no rows", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const particle = makeParticleStub();
    const anthropic = makeAnthropicStub({});

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    expect(out.episodesPersisted).toBe(0);
    expect(out.segmentsPersisted).toBe(0);
    expect(out.cardsPersisted).toBe(0);
    expect(store.episodes).toHaveLength(0);
  });
});

// ─── Cross-run dedupe ──────────────────────────────────────────────

describe("runIngestPipeline — prompt versioning (U5)", () => {
  // Shared fixture for the three version-aware dedup scenarios.
  function mentionFixtureForExistingSegment(): ParticleMentionResult {
    return {
      episode: {
        id: "ep_existing",
        title: "Already-seen",
        podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
        published_at: "2026-05-08T00:00:00Z",
      },
      mention_count: 1,
      windows: [
        {
          segment: { id: "seg_existing", title: "Same segment" },
          start_seconds: 5,
          end_seconds: 30,
        },
      ],
    };
  }

  it("re-processes a segment when its stored prompt_version is mismatched (e.g. 'legacy' backfill)", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
      segments: [
        {
          id: "existing_seg",
          particle_segment_id: "seg_existing",
          episode_id: "ep_existing",
          prompt_version: "legacy",
        },
      ],
    });
    const particle = makeParticleStub({
      mentions: { ent_purdy: [mentionFixtureForExistingSegment()] },
      transcripts: { ep_existing: { text: "Should be re-processed under v1." } },
    });
    const anthropic = makeAnthropicStub({
      ep_existing: {
        moments: [
          {
            particle_segment_id: "seg_existing",
            start_seconds: 5,
            end_seconds: 30,
            summary: "Fresh under v1.",
            pull_quotes: [],
            bullets: ["a", "b", "c"],
            surfacing_entities: ["brock-purdy"],
          },
        ],
        episode_rollup: "Rollup.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );
    // Re-extraction fired — anthropic call, segments upsert, card written.
    expect(out.anthropicCallsAttempted).toBe(1);
    // Segment row was upserted (existing row updated, not duplicated).
    const segmentRows = store.segments;
    expect(segmentRows).toHaveLength(1);
    expect((segmentRows[0] as { prompt_version: string }).prompt_version).toBe(
      EPISODE_EXTRACTION_PROMPT_VERSION,
    );
  });

  it("writes the current prompt_version on every new segment row", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const particle = makeParticleStub({
      mentions: {
        ent_purdy: [
          {
            episode: {
              id: "ep_new",
              title: "New",
              podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
              published_at: "2026-05-09T12:00:00Z",
            },
            mention_count: 1,
            windows: [
              {
                segment: { id: "seg_new", title: "New seg" },
                start_seconds: 10,
                end_seconds: 60,
              },
            ],
          },
        ],
      },
      transcripts: { ep_new: { text: "Fresh content." } },
    });
    const anthropic = makeAnthropicStub({
      ep_new: {
        moments: [
          {
            particle_segment_id: "seg_new",
            start_seconds: 10,
            end_seconds: 60,
            summary: "Summary.",
            pull_quotes: [],
            bullets: ["a", "b", "c"],
            surfacing_entities: ["brock-purdy"],
          },
        ],
        episode_rollup: "Rollup.",
      },
    });

    await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );
    expect(store.segments).toHaveLength(1);
    expect((store.segments[0] as { prompt_version: string }).prompt_version).toBe(
      EPISODE_EXTRACTION_PROMPT_VERSION,
    );
  });
});

describe("runIngestPipeline — cross-run dedupe", () => {
  it("skips segments whose particle_segment_id already exists at the current prompt_version", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
      // The fixture row matches the current EPISODE_EXTRACTION_PROMPT_VERSION
      // so it counts as fully processed — pipeline must skip it.
      segments: [
        {
          id: "existing_seg",
          particle_segment_id: "seg_existing",
          episode_id: "ep_existing",
          prompt_version: EPISODE_EXTRACTION_PROMPT_VERSION,
        },
      ],
    });
    const particle = makeParticleStub({
      mentions: {
        ent_purdy: [
          {
            episode: {
              id: "ep_existing",
              title: "Already-seen",
              podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
              published_at: "2026-05-08T00:00:00Z",
            },
            mention_count: 1,
            windows: [
              {
                segment: { id: "seg_existing", title: "Same segment" },
                start_seconds: 5,
                end_seconds: 30,
              },
            ],
          },
        ],
      },
      transcripts: { ep_existing: { text: "Should not be re-summarised." } },
    });
    const anthropic = makeAnthropicStub({});

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    // Already persisted → no transcript fetch, no Anthropic call, no new rows.
    expect(out.anthropicCallsAttempted).toBe(0);
    expect(out.segmentsPersisted).toBe(0);
    expect(out.cardsPersisted).toBe(0);
  });
});

// ─── Ad-stripping (U3) ─────────────────────────────────────────────

describe("runIngestPipeline — ad-stripping", () => {
  // Capturing variant of makeAnthropicStub: records the user message
  // sent to Claude per call so tests can assert on what reached the
  // extractor.
  function makeCapturingAnthropicStub(
    extractionByEpisode: Record<string, ExtractionFixture>,
    captured: { userMessages: string[] },
  ): AnthropicClient {
    let callIdx = 0;
    const fixtures = Object.entries(extractionByEpisode);
    return {
      createMessage: async (operation, params) => {
        const first = params.messages[0];
        const content = typeof first.content === "string" ? first.content : "";
        captured.userMessages.push(content);
        const fixture = fixtures[callIdx]?.[1] ?? { moments: [], episode_rollup: "" };
        callIdx += 1;
        return {
          id: `msg_${callIdx}`,
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          stop_reason: "tool_use",
          stop_sequence: null,
          content: [
            {
              type: "tool_use",
              id: `tu_${callIdx}`,
              name: "submit_episode_extraction",
              input: { moments: fixture.moments, episode_rollup: fixture.episode_rollup },
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      },
    };
  }

  function mentionFixture(episodeId: string, segmentId: string, start: number, end: number) {
    return {
      episode: {
        id: episodeId,
        title: `Ep ${episodeId}`,
        podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
        published_at: "2026-05-09T12:00:00Z",
      },
      mention_count: 1,
      windows: [
        {
          segment: { id: segmentId, title: "Window" },
          start_seconds: start,
          end_seconds: end,
        },
      ],
    } satisfies ParticleMentionResult;
  }

  it("strips ad-window transcript lines before passing to Claude and persists ad-free raw_transcript", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });

    // Transcript with three lines: a pre-roll ad, the 49ers moment, a mid-roll ad.
    const lines: ParticleTranscriptLine[] = [
      { number: 1, start_seconds: 0, end_seconds: 60, text: "Today's episode is sponsored by ACME." },
      { number: 2, start_seconds: 90, end_seconds: 150, text: "Brock Purdy looks comfortable in the pocket." },
      { number: 3, start_seconds: 600, end_seconds: 700, text: "Sign up at example.com slash deal." },
    ];
    const ads: ParticleEpisodeAd[] = [
      { start_seconds: 0, end_seconds: 60, placement_type: "PRE_ROLL", read_type: "HOST_READ" },
      { start_seconds: 600, end_seconds: 700, placement_type: "MID_ROLL", read_type: "HOST_READ" },
    ];

    const particle = makeParticleStub({
      mentions: { ent_purdy: [mentionFixture("ep_ads", "seg_ads", 90, 150)] },
      transcripts: { ep_ads: { lines } },
      ads: { ep_ads: ads },
    });
    const captured = { userMessages: [] as string[] };
    const anthropic = makeCapturingAnthropicStub(
      {
        ep_ads: {
          moments: [
            {
              particle_segment_id: "seg_ads",
              start_seconds: 90,
              end_seconds: 150,
              summary: "Purdy looks comfortable.",
              pull_quotes: ["Brock Purdy looks comfortable in the pocket."],
              bullets: ["Comfortable pocket.", "First take.", "Confident read."],
              surfacing_entities: ["brock-purdy"],
            },
          ],
          episode_rollup: "Purdy is the story.",
        },
      },
      captured,
    );

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    expect(out.cardsPersisted).toBe(1);
    expect(captured.userMessages).toHaveLength(1);
    const userMessage = captured.userMessages[0];
    // Ad copy is absent from what Claude sees.
    expect(userMessage).not.toContain("sponsored by ACME");
    expect(userMessage).not.toContain("example.com slash deal");
    // Non-ad content is present.
    expect(userMessage).toContain("Brock Purdy looks comfortable");

    // Persisted raw_transcript on the segment row is also ad-free
    // (both code paths read the same stripped lines).
    const rawTranscript = (store.segments[0] as { raw_transcript: string }).raw_transcript;
    expect(rawTranscript).toContain("Brock Purdy looks comfortable");
    expect(rawTranscript).not.toContain("ACME");
    expect(rawTranscript).not.toContain("example.com");
  });

  it("strips a line that partially overlaps an ad window (overlap rule)", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const lines: ParticleTranscriptLine[] = [
      { number: 1, start_seconds: 25, end_seconds: 35, text: "Spans the ad boundary." },
      { number: 2, start_seconds: 100, end_seconds: 160, text: "Brock Purdy plays great." },
    ];
    const ads: ParticleEpisodeAd[] = [
      { start_seconds: 30, end_seconds: 90, placement_type: "PRE_ROLL", read_type: "HOST_READ" },
    ];

    const particle = makeParticleStub({
      mentions: { ent_purdy: [mentionFixture("ep_overlap", "seg_overlap", 100, 160)] },
      transcripts: { ep_overlap: { lines } },
      ads: { ep_overlap: ads },
    });
    const captured = { userMessages: [] as string[] };
    const anthropic = makeCapturingAnthropicStub(
      {
        ep_overlap: {
          moments: [
            {
              particle_segment_id: "seg_overlap",
              start_seconds: 100,
              end_seconds: 160,
              summary: "Purdy summary.",
              pull_quotes: [],
              bullets: ["a", "b", "c"],
              surfacing_entities: ["brock-purdy"],
            },
          ],
          episode_rollup: "Rollup.",
        },
      },
      captured,
    );

    await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    const userMessage = captured.userMessages[0];
    expect(userMessage).not.toContain("Spans the ad boundary");
    expect(userMessage).toContain("Brock Purdy plays great");
  });

  it("passes the unstripped transcript through when listEpisodeAds throws", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const lines: ParticleTranscriptLine[] = [
      { number: 1, start_seconds: 0, end_seconds: 60, text: "Brock Purdy is comfortable in the pocket." },
    ];
    const particle = makeParticleStub({
      mentions: { ent_purdy: [mentionFixture("ep_404", "seg_404", 0, 60)] },
      transcripts: { ep_404: { lines } },
      ads: { ep_404: "throw" },
    });
    const captured = { userMessages: [] as string[] };
    const anthropic = makeCapturingAnthropicStub(
      {
        ep_404: {
          moments: [
            {
              particle_segment_id: "seg_404",
              start_seconds: 0,
              end_seconds: 60,
              summary: "Purdy summary.",
              pull_quotes: ["Brock Purdy is comfortable in the pocket."],
              bullets: ["a", "b", "c"],
              surfacing_entities: ["brock-purdy"],
            },
          ],
          episode_rollup: "Rollup.",
        },
      },
      captured,
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    expect(out.cardsPersisted).toBe(1);
    expect(captured.userMessages[0]).toContain("Brock Purdy is comfortable");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("counts a particle call for listEpisodeAds (one per processed episode)", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const particle = makeParticleStub({
      mentions: { ent_purdy: [mentionFixture("ep_count", "seg_count", 0, 60)] },
      transcripts: { ep_count: { text: "Brock Purdy plays well." } },
      ads: { ep_count: [] },
    });
    const anthropic = makeAnthropicStub({
      ep_count: {
        moments: [
          {
            particle_segment_id: "seg_count",
            start_seconds: 0,
            end_seconds: 60,
            summary: "Sum.",
            pull_quotes: [],
            bullets: ["a", "b", "c"],
            surfacing_entities: ["brock-purdy"],
          },
        ],
        episode_rollup: "Rollup.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
      },
    );

    // 2 entity-mention calls (one per universe entity) + 1 storyline search +
    // 1 transcript + 1 ads = 5 attempted particle calls.
    expect(out.particleCallsAttempted).toBe(5);
  });
});

// ─── List-episodes discovery (U4) ───────────────────────────────────

describe("runIngestPipeline — list-episodes discovery mode", () => {
  it("discovers episodes via listEpisodes(entityId), skips mentions/search, persists synthetic segment IDs", async () => {
    const { client, store } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });

    const episode = {
      id: "ep_le_1",
      title: "List-Episodes",
      podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
      published_at: "2026-05-09T12:00:00Z",
      duration_seconds: 3600,
    };
    const particle = makeParticleStub({
      // Mentions/search are populated to prove they're skipped.
      mentions: {
        ent_purdy: [
          {
            episode: { id: "ep_should_not_appear", title: "Skip me", podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" } },
            mention_count: 1,
            windows: [{ segment: { id: "seg_skip" }, start_seconds: 0, end_seconds: 30 }],
          },
        ],
      },
      episodes: { ent_purdy: [episode], ent_warner: [episode] },
      transcripts: { ep_le_1: { text: "Brock Purdy is comfortable in the pocket." } },
    });

    const anthropic = makeAnthropicStub({
      ep_le_1: {
        moments: [
          {
            // Claude returns any unique string per moment; pipeline overrides.
            particle_segment_id: "auto-100-200",
            start_seconds: 100,
            end_seconds: 200,
            summary: "Purdy summary.",
            pull_quotes: [],
            bullets: ["a", "b", "c"],
            surfacing_entities: ["brock-purdy"],
          },
        ],
        episode_rollup: "Rollup.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
        discoveryMode: "list-episodes",
      },
    );

    expect(out.cardsPersisted).toBe(1);
    expect(store.episodes).toHaveLength(1);
    expect((store.episodes[0] as { particle_episode_id: string }).particle_episode_id).toBe("ep_le_1");
    expect(store.segments).toHaveLength(1);
    const persisted = store.segments[0] as { particle_segment_id: string; match_source: string };
    // Refined coords override Claude's free-form ID.
    expect(persisted.particle_segment_id).toBe("ep_le_1:100-200");
    expect(persisted.match_source).toBe("entity");
  });

  it("dedupes episodes returned for multiple entities into one Claude call per episode", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const episode = {
      id: "ep_dupe",
      title: "Shared",
      podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
      published_at: "2026-05-09T12:00:00Z",
      duration_seconds: 1800,
    };
    const particle = makeParticleStub({
      episodes: { ent_purdy: [episode], ent_warner: [episode] },
      transcripts: { ep_dupe: { text: "Shared episode content." } },
    });
    const anthropic = makeAnthropicStub({
      ep_dupe: {
        moments: [
          {
            particle_segment_id: "x",
            start_seconds: 0,
            end_seconds: 60,
            summary: "Summary.",
            pull_quotes: [],
            bullets: ["a", "b", "c"],
            surfacing_entities: ["brock-purdy"],
          },
        ],
        episode_rollup: "Rollup.",
      },
    });

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
        discoveryMode: "list-episodes",
      },
    );

    // Two entities returned the same episode — dedupe collapses to one
    // anthropic call (and one transcript fetch).
    expect(out.anthropicCallsAttempted).toBe(1);
  });

  it("skips entities whose listEpisodes returns zero results without crashing", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    });
    const particle = makeParticleStub({ episodes: {} });
    const anthropic = makeAnthropicStub({});

    const out = await runIngestPipeline(
      { supabase: client, particle, anthropic, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
        discoveryMode: "list-episodes",
      },
    );

    expect(out.episodesPersisted).toBe(0);
    expect(out.anthropicCallsAttempted).toBe(0);
    // 2 listEpisodes calls (one per entity), zero downstream.
    expect(out.particleCallsAttempted).toBe(2);
  });

  it("idempotency: re-running produces the same row count via synthetic segment ID collisions", async () => {
    const initialState = {
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
    };
    const episode = {
      id: "ep_idem",
      title: "Idempotent",
      podcast: { id: "pod_particle_1", title: "Test Pod", slug: "test-pod" },
      published_at: "2026-05-09T12:00:00Z",
      duration_seconds: 3600,
    };
    const fixture: ExtractionFixture = {
      moments: [
        {
          particle_segment_id: "auto-50-110",
          start_seconds: 50,
          end_seconds: 110,
          summary: "Summary.",
          pull_quotes: [],
          bullets: ["a", "b", "c"],
          surfacing_entities: ["brock-purdy"],
        },
      ],
      episode_rollup: "Rollup.",
    };

    // First run.
    const first = makeSupabaseStub(initialState);
    const particle1 = makeParticleStub({
      episodes: { ent_purdy: [episode], ent_warner: [episode] },
      transcripts: { ep_idem: { text: "Brock Purdy details." } },
    });
    const anthropic1 = makeAnthropicStub({ ep_idem: fixture });
    await runIngestPipeline(
      { supabase: first.client, particle: particle1, anthropic: anthropic1, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
        discoveryMode: "list-episodes",
        forceReprocess: true,
      },
    );
    expect(first.store.segments).toHaveLength(1);
    const firstId = (first.store.segments[0] as { particle_segment_id: string }).particle_segment_id;

    // Second run with the prior segment seeded — synthetic ID collides
    // and the cross-run dedupe filter skips the entity entirely.
    const second = makeSupabaseStub({
      ...initialState,
      segments: [
        {
          id: "seg_seed",
          particle_segment_id: firstId,
          episode_id: "ep_idem",
          prompt_version: EPISODE_EXTRACTION_PROMPT_VERSION,
        },
      ],
    });
    // The list-episodes path normalises into ${id}:0-${duration}; the
    // segment seeded above carries the post-extraction refined ID. Re-run
    // therefore re-invokes Claude (no dedupe match on the synthetic
    // full-episode id) and the refined moment ID upserts into the
    // existing row — net segment count stays 1.
    const particle2 = makeParticleStub({
      episodes: { ent_purdy: [episode], ent_warner: [episode] },
      transcripts: { ep_idem: { text: "Brock Purdy details." } },
    });
    const anthropic2 = makeAnthropicStub({ ep_idem: fixture });
    await runIngestPipeline(
      { supabase: second.client, particle: particle2, anthropic: anthropic2, userId: USER_ID },
      {
        teamId: TEAM_ID,
        podcastIds: ["pod_particle_1"],
        sinceTimestamp: "2026-05-08T00:00:00Z",
        discoveryMode: "list-episodes",
      },
    );
    expect(second.store.segments).toHaveLength(1);
    expect((second.store.segments[0] as { particle_segment_id: string }).particle_segment_id).toBe(firstId);
  });
});
