/**
 * /api/cron/daily-digest GET handler tests.
 *
 * Vercel Cron Jobs invoke this endpoint with `Authorization: Bearer
 * ${CRON_SECRET}` automatically when that env var is configured.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runDailyIngestionMock = vi.fn();
const supabaseAdminMock = { from: vi.fn() };

vi.mock("@/lib/ingest/run", () => ({
  runDailyIngestion: runDailyIngestionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => supabaseAdminMock,
}));

vi.mock("@/lib/particle/client", () => ({
  createParticleClient: () => ({}),
}));

vi.mock("@/lib/anthropic/client", () => ({
  createAnthropicClient: () => ({}),
}));

const CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";

function teamsTableStub(teamIds: string[]) {
  return {
    from: (table: string) => {
      if (table !== "teams") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: async () => ({
          data: teamIds.map((id) => ({ id })),
          error: null,
        }),
      };
    },
  };
}

beforeEach(() => {
  runDailyIngestionMock.mockReset();
  supabaseAdminMock.from.mockReset();
});

describe("GET /api/cron/daily-digest", () => {
  it("returns 401 when Authorization is missing — no DB touches", async () => {
    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const response = await GET(new Request("https://test.local/api/cron/daily-digest"));
    expect(response.status).toBe(401);
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
    // CRITICAL: no DB read happens before auth check.
    expect(supabaseAdminMock.from).not.toHaveBeenCalled();
  });

  it("iterates teams from the DB and calls runDailyIngestion with runKind='scheduled_run'", async () => {
    const stub = teamsTableStub(["49ers"]);
    supabaseAdminMock.from.mockImplementation(stub.from);

    runDailyIngestionMock.mockResolvedValue({
      runId: "uuid_cron",
      status: "completed",
      podcastsScanned: 31,
    });
    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const response = await GET(
      new Request("https://test.local/api/cron/daily-digest", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(runDailyIngestionMock).toHaveBeenCalledTimes(1);
    expect(runDailyIngestionMock.mock.calls[0][0].runKind).toBe("scheduled_run");
    expect(runDailyIngestionMock.mock.calls[0][0].teamId).toBe("49ers");
  });

  it("captures per-team failures in the results array without failing the route", async () => {
    const stub = teamsTableStub(["49ers"]);
    supabaseAdminMock.from.mockImplementation(stub.from);
    runDailyIngestionMock.mockRejectedValue(new Error("upstream failure"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const response = await GET(
      new Request("https://test.local/api/cron/daily-digest", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    // Per-team failures don't fail the whole cron — caught and reported
    // in the results payload so multi-team operation tolerates one team
    // erroring while others succeed.
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].teamId).toBe("49ers");
    expect(body.results[0].result.reason).toContain("upstream failure");
    errorSpy.mockRestore();
  });

  it("returns no_teams status when the teams table is empty", async () => {
    const stub = teamsTableStub([]);
    supabaseAdminMock.from.mockImplementation(stub.from);
    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const response = await GET(
      new Request("https://test.local/api/cron/daily-digest", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("no_teams");
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
  });
});
