/**
 * /api/ingest/status GET handler tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdminMock = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => supabaseAdminMock,
}));

function mockLatestAlert(row: Record<string, unknown> | null, error: { message: string } | null = null) {
  supabaseAdminMock.from.mockImplementation(() => ({
    select: () => ({
      in: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }),
    }),
  }));
}

beforeEach(() => {
  supabaseAdminMock.from.mockReset();
});

describe("GET /api/ingest/status", () => {
  it("returns no_runs when no system_alerts exist", async () => {
    mockLatestAlert(null);
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("no_runs");
    expect(body.lastRun).toBeNull();
  });

  it("derives status='running' when the latest row is a *_run starter", async () => {
    mockLatestAlert({
      kind: "manual_run",
      payload: { run_id: "uuid" },
      created_at: "2026-05-10T12:00:00Z",
    });
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("running");
    expect(body.lastRun.kind).toBe("manual_run");
  });

  it("derives status='completed' when the latest row is *_run_complete", async () => {
    mockLatestAlert({
      kind: "manual_run_complete",
      payload: { run_id: "uuid" },
      episodes_count: 3,
    });
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("completed");
    // Response uses camelCase even though the DB column is snake_case.
    expect(body.lastRun.episodesCount).toBe(3);
    expect(body.lastRun.kind).toBe("manual_run_complete");
  });

  it("derives status='failed' when the latest row is *_run_failed", async () => {
    mockLatestAlert({
      kind: "manual_run_failed",
      payload: { run_id: "uuid" },
      notes: "pipeline threw: oops",
    });
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("failed");
    expect(body.lastRun.notes).toContain("oops");
  });

  it("derives status='unknown' for an unrecognised kind", async () => {
    mockLatestAlert({
      kind: "future_kind_added_later",
      payload: {},
    });
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("unknown");
  });

  it("derives status='cost_aborted' when the latest row is cost_abort", async () => {
    mockLatestAlert({
      kind: "cost_abort",
      notes: "estimate exceeds 60%",
      payload: { run_id: "uuid" },
    });
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("cost_aborted");
  });

  it("returns 500 when the system_alerts read fails", async () => {
    mockLatestAlert(null, { message: "db down" });
    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    expect(response.status).toBe(500);
  });
});
