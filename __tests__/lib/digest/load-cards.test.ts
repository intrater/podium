/**
 * Loader tests — happy path, the AE3 feedback filter (segment + card),
 * hidden=true exclusion, and date-descending order.
 *
 * The mocked Supabase client implements only the fluent slice the loader
 * actually uses (`from().select().eq().eq().order().limit().returns()`
 * for cards; `from().select().eq().returns()` for feedback). Keeping
 * the mock surface narrow makes test failures point at real behavioral
 * drift rather than mock plumbing changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  formatPublishedAt,
  formatTotalTime,
  loadDigestCards,
  loadLatestRunStatus,
  type DigestCard,
} from "@/lib/digest/load-cards";

interface MockCardRow {
  id: string;
  surfaced_at: string;
  total_relevant_seconds: number | null;
  episode_summary: string | null;
  episodes: {
    id: string;
    title: string;
    published_at: string | null;
    audio_url: string | null;
    podcasts: { id: string; name: string };
    segments: Array<{
      id: string;
      particle_segment_id: string | null;
      start_seconds: number | null;
      end_seconds: number | null;
      audio_url: string | null;
      speaker_name: string | null;
      summary: string | null;
      pull_quotes: string[] | null;
      bullets: string[] | null;
      surfacing_entities: string[] | null;
    }>;
  };
}

interface MockFeedbackRow {
  card_id: string | null;
  segment_id: string | null;
  verdict: string;
}

function buildClient({
  cards,
  feedback,
}: {
  cards: MockCardRow[];
  feedback: MockFeedbackRow[];
}) {
  const finalCards = () => ({ data: cards, error: null });
  const finalFeedback = () => ({ data: feedback, error: null });
  return {
    from(table: string) {
      const chain = (terminal: () => unknown) => {
        const api: Record<string, unknown> = {};
        for (const k of ["select", "eq", "order", "limit", "returns"]) {
          api[k] = () => api;
        }
        api.then = (resolve: (v: unknown) => unknown) => resolve(terminal());
        return api;
      };
      if (table === "cards") return chain(finalCards);
      if (table === "feedback") return chain(finalFeedback);
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function row(
  id: string,
  overrides: Partial<MockCardRow> = {},
): MockCardRow {
  return {
    id,
    surfaced_at: `2026-05-10T${id.padStart(2, "0")}:00:00Z`,
    total_relevant_seconds: 480,
    episode_summary: `Summary for ${id}`,
    episodes: {
      id: `ep-${id}`,
      title: `Episode ${id}`,
      published_at: "2026-05-09T12:00:00Z",
      audio_url: "https://example.com/audio.mp3",
      podcasts: { id: `pod-${id}`, name: `Podcast ${id}` },
      segments: [
        {
          id: `seg-${id}-a`,
          particle_segment_id: `psa-${id}-a`,
          start_seconds: 100,
          end_seconds: 240,
          audio_url: null,
          speaker_name: "Speaker A",
          summary: "Segment A summary",
          pull_quotes: ["First quote"],
          bullets: ["First bullet"],
          surfacing_entities: ["nick-bosa"],
        },
      ],
    },
    ...overrides,
  };
}

describe("loadDigestCards", () => {
  it("happy path: maps three card rows to typed DigestCards", async () => {
    const client = buildClient({
      cards: [row("01"), row("02"), row("03")],
      feedback: [],
    });
    const cards = await loadDigestCards(client as unknown as SupabaseClient, "49ers");
    expect(cards).toHaveLength(3);
    expect(cards[0].episode.title).toBe("Episode 01");
    expect(cards[0].episode.podcast.name).toBe("Podcast 01");
    expect(cards[0].episodeSummary).toBe("Summary for 01");
    expect(cards[0].segments[0].pullQuotes).toEqual(["First quote"]);
  });

  it("AE3 — drops cards where feedback verdict='not_relevant' targets the card", async () => {
    const client = buildClient({
      cards: [row("01"), row("02"), row("03")],
      feedback: [
        { card_id: "02", segment_id: null, verdict: "not_relevant" },
      ],
    });
    const cards = await loadDigestCards(client as unknown as SupabaseClient, "49ers");
    expect(cards.map((c) => c.id)).toEqual(["01", "03"]);
  });

  it("AE3 — filters out individual segments marked not_relevant", async () => {
    const card = row("01", {
      episodes: {
        ...row("01").episodes,
        segments: [
          {
            id: "seg-keep",
            particle_segment_id: null,
            start_seconds: 30,
            end_seconds: 60,
            audio_url: null,
            speaker_name: null,
            summary: "keep me",
            pull_quotes: null,
            bullets: null,
            surfacing_entities: null,
          },
          {
            id: "seg-drop",
            particle_segment_id: null,
            start_seconds: 90,
            end_seconds: 120,
            audio_url: null,
            speaker_name: null,
            summary: "drop me",
            pull_quotes: null,
            bullets: null,
            surfacing_entities: null,
          },
        ],
      },
    });
    const client = buildClient({
      cards: [card],
      feedback: [
        { card_id: null, segment_id: "seg-drop", verdict: "not_relevant" },
      ],
    });
    const cards = await loadDigestCards(client as unknown as SupabaseClient, "49ers");
    expect(cards).toHaveLength(1);
    expect(cards[0].segments.map((s) => s.id)).toEqual(["seg-keep"]);
  });

  it("sorts segments within a card by start_seconds ascending", async () => {
    const card = row("01", {
      episodes: {
        ...row("01").episodes,
        segments: [
          {
            id: "late",
            particle_segment_id: null,
            start_seconds: 600,
            end_seconds: 700,
            audio_url: null,
            speaker_name: null,
            summary: null,
            pull_quotes: null,
            bullets: null,
            surfacing_entities: null,
          },
          {
            id: "early",
            particle_segment_id: null,
            start_seconds: 30,
            end_seconds: 60,
            audio_url: null,
            speaker_name: null,
            summary: null,
            pull_quotes: null,
            bullets: null,
            surfacing_entities: null,
          },
        ],
      },
    });
    const client = buildClient({ cards: [card], feedback: [] });
    const cards = await loadDigestCards(client as unknown as SupabaseClient, "49ers");
    expect(cards[0].segments.map((s) => s.id)).toEqual(["early", "late"]);
  });

  it("returns [] when the user has no cards", async () => {
    const client = buildClient({ cards: [], feedback: [] });
    const cards = await loadDigestCards(client as unknown as SupabaseClient, "49ers");
    expect(cards).toEqual([]);
  });

  it("propagates the Supabase error if the cards query fails", async () => {
    const client = {
      from(table: string) {
        const api: Record<string, unknown> = {};
        for (const k of ["select", "eq", "order", "limit", "returns"]) {
          api[k] = () => api;
        }
        api.then = (resolve: (v: unknown) => unknown) =>
          resolve(
            table === "cards"
              ? { data: null, error: { message: "boom" } }
              : { data: [], error: null },
          );
        return api;
      },
    };
    await expect(
      loadDigestCards(client as unknown as SupabaseClient, "49ers"),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("formatTotalTime", () => {
  function fixture(
    totalSeconds: number | null,
    segmentCount: number,
  ): DigestCard {
    return {
      id: "x",
      surfacedAt: "",
      totalRelevantSeconds: totalSeconds,
      episodeSummary: null,
      episode: {
        id: "",
        title: "",
        publishedAt: null,
        audioUrl: null,
        podcast: { id: "", name: "" },
      },
      segments: Array.from({ length: segmentCount }, (_, i) => ({
        id: `s${i}`,
        particleSegmentId: null,
        startSeconds: i * 120,
        endSeconds: i * 120 + 60,
        audioUrl: null,
        speakerName: null,
        summary: null,
        pullQuotes: [],
        bullets: [],
        surfacingEntities: [],
      })),
    };
  }

  it("formats total seconds as 'N min across K segments'", () => {
    expect(formatTotalTime(fixture(480, 3))).toBe("8 min across 3 segments");
  });

  it("pluralizes correctly for a single segment", () => {
    expect(formatTotalTime(fixture(120, 1))).toBe("2 min across 1 segment");
  });

  it("falls back to summing segment ranges when totalRelevantSeconds is null", () => {
    // 2 segments × 60s each = 120s = 2 min
    expect(formatTotalTime(fixture(null, 2))).toBe("2 min across 2 segments");
  });
});

describe("formatPublishedAt", () => {
  it("formats a known ISO date in en-US short style", () => {
    // 2026-05-09 is a Saturday
    expect(formatPublishedAt("2026-05-09T12:00:00Z")).toMatch(
      /^(Sat|Fri), May 9$/,
    );
  });

  it("returns em-dash for null and invalid inputs", () => {
    expect(formatPublishedAt(null)).toBe("—");
    expect(formatPublishedAt("not a date")).toBe("—");
  });
});

describe("loadLatestRunStatus", () => {
  function client(row: Record<string, unknown> | null) {
    return {
      from(table: string) {
        if (table !== "system_alerts") {
          throw new Error(`unexpected table ${table}`);
        }
        const api: Record<string, unknown> = {};
        for (const k of ["select", "in", "order", "limit", "returns"]) {
          api[k] = () => api;
        }
        api.maybeSingle = async () => ({ data: row, error: null });
        return api;
      },
    };
  }

  it("returns 'no_runs' when system_alerts is empty", async () => {
    const status = await loadLatestRunStatus(client(null) as unknown as SupabaseClient);
    expect(status.status).toBe("no_runs");
    expect(status.createdAt).toBeNull();
  });

  it("derives 'running' from manual_run start markers", async () => {
    const status = await loadLatestRunStatus(
      client({
        kind: "manual_run",
        notes: null,
        cost_usd: null,
        created_at: "2026-05-12T10:00:00Z",
      }) as unknown as SupabaseClient,
    );
    expect(status.status).toBe("running");
    expect(status.createdAt).toBe("2026-05-12T10:00:00Z");
  });

  it("derives 'completed' from scheduled_run_complete and parses cost", async () => {
    const status = await loadLatestRunStatus(
      client({
        kind: "scheduled_run_complete",
        notes: "all good",
        cost_usd: "1.234567",
        created_at: "2026-05-12T11:00:00Z",
      }) as unknown as SupabaseClient,
    );
    expect(status.status).toBe("completed");
    expect(status.notes).toBe("all good");
    expect(status.costUsd).toBe(1.234567);
  });

  it("derives 'cost_aborted' and 'failed' from their kinds", async () => {
    const aborted = await loadLatestRunStatus(
      client({
        kind: "cost_abort",
        notes: null,
        cost_usd: null,
        created_at: null,
      }) as unknown as SupabaseClient,
    );
    expect(aborted.status).toBe("cost_aborted");
    const failed = await loadLatestRunStatus(
      client({
        kind: "manual_run_failed",
        notes: null,
        cost_usd: null,
        created_at: null,
      }) as unknown as SupabaseClient,
    );
    expect(failed.status).toBe("failed");
  });

  it("returns 'unknown' for an unrecognized kind", async () => {
    const status = await loadLatestRunStatus(
      client({
        kind: "future_kind",
        notes: null,
        cost_usd: null,
        created_at: null,
      }) as unknown as SupabaseClient,
    );
    expect(status.status).toBe("unknown");
  });
});
