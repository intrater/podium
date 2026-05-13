/**
 * runDailyIngestion wrapper tests.
 *
 * Covers the policy layer above the pipeline core: catalog read, dev-mode
 * filter, auto-seed window, pre-flight cost gate, system_alerts markers.
 * Mocks Supabase + Particle + Anthropic; the pipeline itself is tested
 * separately in pipeline.test.ts.
 */

import { describe, expect, it, vi } from "vitest";

import type { AnthropicClient } from "@/lib/anthropic/client";
import { runDailyIngestion } from "@/lib/ingest/run";
import type { ParticleClient } from "@/lib/particle/client";

interface RecordedAlert {
  kind: string;
  payload: Record<string, unknown>;
  cost_usd: number | null;
  notes: string | null;
}

const TEAM_ID = "test-team";
const USER_ID = "00000000-0000-0000-0000-000000000099";
const NOW = new Date("2026-05-10T12:00:00Z");

interface StoreShape {
  podcasts: Array<{ id: string; particle_id: string | null }>;
  team: { id: string; universe_id: string; name: string; sport: string } | null;
  universe: {
    id: string;
    entities: string[];
    storylines: string[];
    entity_id_map: Record<string, string>;
  } | null;
  cards: Array<{ user_id: string; team_id: string; surfaced_at: string }>;
  apiCallsThisMonth: Array<{ cost_usd: number; provider: string; ts: string }>;
  alerts: RecordedAlert[];
  /** Existing system_alerts rows the test wants the cadence query to find. */
  existingAlerts: Array<{ kind: string; started_at: string | null; finished_at: string | null }>;
}

function makeSupabaseStub(initial: Partial<StoreShape> = {}) {
  const store: StoreShape = {
    podcasts: initial.podcasts ?? [],
    team: initial.team ?? null,
    universe: initial.universe ?? null,
    cards: initial.cards ?? [],
    apiCallsThisMonth: initial.apiCallsThisMonth ?? [],
    alerts: initial.alerts ?? [],
    existingAlerts: initial.existingAlerts ?? [],
  };

  const builder = (table: string) => {
    const filters: Array<{ col: string; op: string; value: unknown }> = [];
    let mode: "select" | "insert" | "upsert" | "update" = "select";
    let payload: unknown = undefined;
    let counted = false;
    let orderCol: string | undefined;
    let orderDesc = false;
    let limited: number | undefined;

    const matches = (row: Record<string, unknown>): boolean =>
      filters.every((f) => {
        if (f.op === "eq") return row[f.col] === f.value;
        if (f.op === "in") return (f.value as unknown[]).includes(row[f.col]);
        if (f.op === "gte") return String(row[f.col]) >= String(f.value);
        if (f.op === "not_is_null") return row[f.col] != null;
        return true;
      });

    const exec = async () => {
      if (mode === "insert") {
        const items = Array.isArray(payload) ? payload : [payload];
        if (table === "system_alerts") {
          for (const i of items as RecordedAlert[]) store.alerts.push(i);
        }
        return { data: null, error: null, count: null };
      }

      let rows: Record<string, unknown>[] = [];
      if (table === "podcasts") rows = store.podcasts as Record<string, unknown>[];
      else if (table === "teams") rows = store.team ? [store.team as unknown as Record<string, unknown>] : [];
      else if (table === "universes") rows = store.universe ? [store.universe as unknown as Record<string, unknown>] : [];
      else if (table === "cards") rows = store.cards as unknown as Record<string, unknown>[];
      else if (table === "api_calls") rows = store.apiCallsThisMonth as Record<string, unknown>[];
      else if (table === "system_alerts") rows = store.existingAlerts as unknown as Record<string, unknown>[];
      else rows = [];

      let result = rows.filter(matches);
      if (orderCol) {
        result = [...result].sort((a, b) => {
          const av = String(a[orderCol!]);
          const bv = String(b[orderCol!]);
          if (av === bv) return 0;
          return (av < bv ? -1 : 1) * (orderDesc ? -1 : 1);
        });
      }
      if (limited !== undefined) result = result.slice(0, limited);
      return { data: result, error: null, count: counted ? result.length : null };
    };

    const queryShape = {
      select(_columns?: string, options?: { count?: string }) {
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
      gte(col: string, value: unknown) {
        filters.push({ col, op: "gte", value });
        return queryShape;
      },
      not(col: string, op: string) {
        if (op === "is") filters.push({ col, op: "not_is_null", value: null });
        return queryShape;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderDesc = opts?.ascending === false;
        return queryShape;
      },
      limit(n: number) {
        limited = n;
        return queryShape;
      },
      single() {
        return exec().then((r) => ({ ...r, data: (r.data as unknown[])[0] ?? null }));
      },
      maybeSingle() {
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
      insert(p: unknown) {
        mode = "insert";
        payload = p;
        return queryShape;
      },
      upsert(p: unknown) {
        mode = "upsert";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = { from: builder } as any;
  return { client, store };
}

function makeParticleStub(): ParticleClient {
  return {
    searchEntityMentions: async () => ({ data: [], has_more: false }),
    searchByContent: async () => ({ data: [], has_more: false }),
    listEntities: async () => ({ data: [], has_more: false }),
    listPodcasts: async () => ({ data: [], has_more: false }),
    listEpisodes: async () => ({ data: [], has_more: false }),
    getClip: async () => {
      throw new Error("not used");
    },
    getClipTranscript: async () => {
      throw new Error("not used");
    },
    getWordLevelTranscript: async () => {
      throw new Error("not used");
    },
    listClipsForEpisode: async () => ({ data: [], has_more: false }),
  };
}

function makeAnthropicStub(): AnthropicClient {
  return {
    createMessage: async () => {
      throw new Error("not used in these tests");
    },
  };
}

const baseUniverse = {
  id: "uni_1",
  team_id: TEAM_ID,
  entities: ["brock-purdy", "fred-warner"],
  storylines: ["49ers offseason"],
  entity_id_map: { "brock-purdy": "ent_purdy", "fred-warner": "ent_warner" },
};

const baseTeam = { id: TEAM_ID, name: "Test 49ers", sport: "nfl", universe_id: "uni_1" };

const fullCatalog = Array.from({ length: 31 }, (_, i) => ({
  id: `pod_${i}`,
  particle_id: `p_${i}`,
}));

// ─── Cost gate ───────────────────────────────────────────────────────

describe("runDailyIngestion — cost gate", () => {
  it("aborts when prior api_calls have exhausted the starter credit", async () => {
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog,
      team: baseTeam,
      universe: baseUniverse,
      apiCallsThisMonth: [
        { cost_usd: 9.95, provider: "particle", ts: "2026-05-05T00:00:00Z" },
      ],
    });

    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: false,
      now: () => NOW,
    });

    expect(result.status).toBe("cost_aborted");
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0].kind).toBe("cost_abort");
    expect(store.alerts[0].notes).toContain("exceeds 60%");
  });

  it("proceeds when remaining credit comfortably covers the estimate", async () => {
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: baseTeam,
      universe: baseUniverse,
      apiCallsThisMonth: [],
    });

    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: true, // tightens scope to 2 podcasts × 1 day
      now: () => NOW,
    });

    expect(result.status).toBe("completed");
    expect(result.podcastsScanned).toBe(2);
    // start + complete markers.
    const kinds = store.alerts.map((a) => a.kind);
    expect(kinds).toContain("manual_run");
    expect(kinds).toContain("manual_run_complete");
  });
});

// ─── No podcasts (catalog unresolved) ───────────────────────────────

describe("runDailyIngestion — empty catalog", () => {
  it("returns no_podcasts when every podcast has a null particle_id", async () => {
    const { client, store } = makeSupabaseStub({
      podcasts: [{ id: "pod_unresolved", particle_id: null }],
      team: baseTeam,
      universe: baseUniverse,
    });

    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: false,
      now: () => NOW,
    });

    expect(result.status).toBe("no_podcasts");
    expect(result.podcastsScanned).toBe(0);
    expect(store.alerts).toHaveLength(0);
  });
});

// ─── Dev mode filter ────────────────────────────────────────────────

describe("runDailyIngestion — dev mode", () => {
  it("limits to 2 podcasts and a 1-day window when devMode is true", async () => {
    const { client } = makeSupabaseStub({
      podcasts: fullCatalog,
      team: baseTeam,
      universe: baseUniverse,
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: true,
      now: () => NOW,
    });
    expect(result.podcastsScanned).toBe(2);
  });
});

// ─── Auto-seed window ───────────────────────────────────────────────

describe("runDailyIngestion — auto-seed first-run window", () => {
  it("uses a 3-day lookback when the user has zero cards", async () => {
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: baseTeam,
      universe: baseUniverse,
      cards: [],
    });
    await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: false,
      now: () => NOW,
    });
    const startAlert = store.alerts.find((a) => a.kind === "manual_run");
    expect(startAlert).toBeDefined();
    const since = (startAlert!.payload as { sinceTimestamp: string }).sinceTimestamp;
    const sinceDate = new Date(since);
    const expected = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(Math.abs(sinceDate.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it("uses incremental window from the last surfaced card minus a 6-hour safety margin", async () => {
    const lastCardTimestamp = "2026-05-09T10:00:00Z";
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: baseTeam,
      universe: baseUniverse,
      cards: [{ user_id: USER_ID, team_id: TEAM_ID, surfaced_at: lastCardTimestamp }],
    });
    await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: false,
      now: () => NOW,
    });
    const startAlert = store.alerts.find((a) => a.kind === "manual_run");
    const since = (startAlert!.payload as { sinceTimestamp: string }).sinceTimestamp;
    const expected = new Date(new Date(lastCardTimestamp).getTime() - 6 * 60 * 60 * 1000);
    expect(Math.abs(new Date(since).getTime() - expected.getTime())).toBeLessThan(1000);
  });
});

// ─── runId is a fresh UUID per call ─────────────────────────────────

describe("runDailyIngestion — runId uniqueness", () => {
  it("generates a fresh runId per invocation, threaded into both system_alerts rows", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid_static_for_test" });
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: baseTeam,
      universe: baseUniverse,
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: TEAM_ID,
      userId: USER_ID,
      devMode: true,
      now: () => NOW,
    });
    expect(result.runId).toBe("uuid_static_for_test");
    for (const alert of store.alerts) {
      expect((alert.payload as { run_id: string }).run_id).toBe("uuid_static_for_test");
    }
    vi.unstubAllGlobals();
  });
});

// ─── Cadence gate (U6) ──────────────────────────────────────────────
//
// teamId "49ers" is the only team in config/teams.ts. NFL in-season
// months = [1, 2, 9, 10, 11, 12]; off-season cadence = 3 days.

const team49ers = { id: "49ers", name: "Niners", sport: "nfl", universe_id: "uni_1" };
const NOW_OFF_SEASON = new Date("2026-05-10T12:00:00Z"); // May = off-season (cadence 3 days)
const NOW_IN_SEASON = new Date("2026-10-15T12:00:00Z"); // October = in-season (cadence 1 day)

describe("runDailyIngestion — cadence gate", () => {
  it("short-circuits a scheduled_run in off-season when last completion was <3 days ago", async () => {
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: team49ers,
      universe: baseUniverse,
      existingAlerts: [
        {
          kind: "scheduled_run_complete",
          started_at: null,
          finished_at: "2026-05-09T12:00:00Z", // 24 hours before NOW_OFF_SEASON
        },
      ],
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: "49ers",
      userId: USER_ID,
      devMode: false,
      runKind: "scheduled_run",
      now: () => NOW_OFF_SEASON,
    });
    expect(result.status).toBe("skipped_cadence");
    expect(result.reason).toContain("cadence not elapsed");
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0].kind).toBe("skipped_cadence");
  });

  it("proceeds when off-season cadence has elapsed (last completion >3 days ago)", async () => {
    const { client } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: team49ers,
      universe: baseUniverse,
      existingAlerts: [
        {
          kind: "scheduled_run_complete",
          started_at: null,
          finished_at: "2026-05-06T11:00:00Z", // ~97 hours before NOW_OFF_SEASON (>72h cadence)
        },
      ],
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: "49ers",
      userId: USER_ID,
      devMode: true,
      runKind: "scheduled_run",
      now: () => NOW_OFF_SEASON,
    });
    expect(result.status).toBe("completed");
  });

  it("short-circuits in-season when last completion was <1 day ago", async () => {
    const { client, store } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: team49ers,
      universe: baseUniverse,
      existingAlerts: [
        {
          kind: "scheduled_run_complete",
          started_at: null,
          finished_at: "2026-10-15T03:00:00Z", // 9 hours before NOW_IN_SEASON
        },
      ],
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: "49ers",
      userId: USER_ID,
      devMode: false,
      runKind: "scheduled_run",
      now: () => NOW_IN_SEASON,
    });
    expect(result.status).toBe("skipped_cadence");
    expect(store.alerts[0].kind).toBe("skipped_cadence");
  });

  it("manual_run ignores cadence entirely — even minutes after a prior completion", async () => {
    const { client } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: team49ers,
      universe: baseUniverse,
      existingAlerts: [
        {
          kind: "manual_run_complete",
          started_at: null,
          finished_at: "2026-05-10T11:55:00Z", // 5 minutes before NOW_OFF_SEASON
        },
      ],
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: "49ers",
      userId: USER_ID,
      devMode: true,
      runKind: "manual_run", // explicit; default value of runKind
      now: () => NOW_OFF_SEASON,
    });
    expect(result.status).toBe("completed");
  });

  it("first run (no prior completion in system_alerts) proceeds regardless of cadence", async () => {
    const { client } = makeSupabaseStub({
      podcasts: fullCatalog.slice(0, 2),
      team: team49ers,
      universe: baseUniverse,
      existingAlerts: [],
    });
    const result = await runDailyIngestion({
      supabase: client,
      particle: makeParticleStub(),
      anthropic: makeAnthropicStub(),
      teamId: "49ers",
      userId: USER_ID,
      devMode: true,
      runKind: "scheduled_run",
      now: () => NOW_OFF_SEASON,
    });
    expect(result.status).toBe("completed");
  });
});
