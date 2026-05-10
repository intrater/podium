/**
 * Ingest pipeline integration tests.
 *
 * Mocks Particle + Anthropic at the client interface level. Mocks Supabase
 * with an in-memory recorder so persistence assertions don't require a
 * live DB. The live-DB equivalent runs via U8's manual-trigger
 * verification once route handlers land.
 */

import { describe, expect, it } from "vitest";

import type { AnthropicClient } from "@/lib/anthropic/client";
import type { SegmentSummary } from "@/lib/anthropic/types";
import { runIngestPipeline } from "@/lib/ingest/pipeline";
import type { ParticleClient } from "@/lib/particle/client";
import type {
  ParticleMentionResult,
  ParticleSearchResult,
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
    transcripts?: Record<string, { text: string }>;
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
    getClipTranscript: async ({ episodeId, start, end }) => {
      const text = responses.transcripts?.[episodeId]?.text ?? "";
      return {
        episode_id: episodeId,
        lines: text
          ? [{ number: 1, start_seconds: start ?? 0, end_seconds: end ?? 0, text }]
          : [],
      };
    },
    listEntities: async () => ({ data: [], has_more: false }),
    listPodcasts: async () => ({ data: [], has_more: false }),
    listEpisodes: async () => ({ data: [], has_more: false }),
    getClip: async () => {
      throw new Error("not used");
    },
    getWordLevelTranscript: async () => {
      throw new Error("not used");
    },
    listClipsForEpisode: async () => ({ data: [], has_more: false }),
  };
}

function makeAnthropicStub(
  segmentSummaryById: Record<string, SegmentSummary | null>,
): AnthropicClient {
  // The pipeline calls summarizeSegment + summarizeEpisode through the
  // anthropic client. Both go through createMessage with tool-use payloads.
  // For this integration test we short-circuit at the createMessage level
  // by returning canned tool_use blocks.
  let segmentCallIdx = 0;
  // Map of which segments to return in order — keyed by call sequence.
  const segmentSummaries = Object.values(segmentSummaryById);

  return {
    createMessage: async (operation) => {
      if (operation === "summarize_segment") {
        const summary = segmentSummaries[segmentCallIdx++] ?? null;
        const input = summary
          ? {
              is_team_relevant: true,
              summary: summary.summary,
              pull_quotes: summary.pullQuotes,
              bullets: summary.bullets,
              surfacing_entities: summary.surfacingEntities,
            }
          : { is_team_relevant: false };
        return {
          id: `msg_${segmentCallIdx}`,
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          stop_reason: "tool_use",
          stop_sequence: null,
          content: [
            {
              type: "tool_use",
              id: `tu_${segmentCallIdx}`,
              name: "submit_segment_analysis",
              input,
            },
          ],
          usage: { input_tokens: 100, output_tokens: 50 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      if (operation === "summarize_episode") {
        return {
          id: "msg_ep",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          stop_reason: "tool_use",
          stop_sequence: null,
          content: [
            {
              type: "tool_use",
              id: "tu_ep",
              name: "submit_episode_summary",
              input: { summary: "Episode rollup." },
            },
          ],
          usage: { input_tokens: 50, output_tokens: 20 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      }
      throw new Error(`unexpected operation: ${operation}`);
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
      seg_1: {
        summary: "Purdy looks comfortable in the pocket per Mina Kimes.",
        pullQuotes: ["Brock Purdy looks comfortable in the pocket."],
        bullets: ["Comfortable pocket presence.", "Mina Kimes' read.", "First take of the segment."],
        surfacingEntities: ["brock-purdy"],
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

    const anthropic = makeAnthropicStub({ seg_2: null }); // off-topic

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

describe("runIngestPipeline — cross-run dedupe", () => {
  it("skips segments whose particle_segment_id already exists in the segments table", async () => {
    const { client } = makeSupabaseStub({
      team: teamFixture,
      universe: universeFixture,
      podcasts: podcastsFixture,
      segments: [{ id: "existing_seg", particle_segment_id: "seg_existing", episode_id: "ep_existing" }],
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
