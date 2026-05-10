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

beforeEach(() => {
  runDailyIngestionMock.mockReset();
  supabaseAdminMock.from.mockReset();
});

describe("GET /api/cron/daily-digest", () => {
  it("returns 401 when Authorization is missing", async () => {
    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const response = await GET(new Request("https://test.local/api/cron/daily-digest"));
    expect(response.status).toBe(401);
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
  });

  it("calls runDailyIngestion with runKind='scheduled_run' on a valid bearer token", async () => {
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
  });

  it("returns 500 when runDailyIngestion throws", async () => {
    runDailyIngestionMock.mockRejectedValue(new Error("upstream failure"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/cron/daily-digest/route");
    const response = await GET(
      new Request("https://test.local/api/cron/daily-digest", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("ingestion_failed");
    errorSpy.mockRestore();
  });
});
