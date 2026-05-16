/**
 * /api/ingest POST handler tests.
 *
 * Mocks the runDailyIngestion module and the admin Supabase client at
 * the module-import level so the route's auth + rate-limit branches can
 * be exercised without hitting the live DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runDailyIngestionMock = vi.fn();
const supabaseAdminMock = {
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  })),
};

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
  supabaseAdminMock.from.mockClear();
});

describe("POST /api/ingest — auth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { POST } = await import("@/app/api/ingest/route");
    const response = await POST(new Request("https://test.local/api/ingest", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token doesn't match CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/ingest/route");
    const response = await POST(
      new Request("https://test.local/api/ingest", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ingest — happy path", () => {
  it("calls runDailyIngestion and returns 200 with the result body when authorized", async () => {
    runDailyIngestionMock.mockResolvedValue({
      runId: "uuid_test",
      status: "completed",
      podcastsScanned: 31,
      pipeline: {
        episodesPersisted: 1,
        segmentsPersisted: 2,
        cardsPersisted: 1,
        segmentsRejectedOffTopic: 0,
        segmentsFailedSummary: 0,
        particleCallsAttempted: 5,
        anthropicCallsAttempted: 3,
        episodesSkippedByDeadline: 0,
      },
    });
    const { POST } = await import("@/app/api/ingest/route");
    const response = await POST(
      new Request("https://test.local/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runId).toBe("uuid_test");
    expect(body.status).toBe("completed");
    expect(runDailyIngestionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/ingest — force-reprocess flag (U8)", () => {
  it("threads forceReprocess=true into runDailyIngestion when ?force=1", async () => {
    runDailyIngestionMock.mockResolvedValue({
      runId: "uuid_force",
      status: "completed",
      podcastsScanned: 31,
    });
    const { POST } = await import("@/app/api/ingest/route");
    await POST(
      new Request("https://test.local/api/ingest?force=1", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(runDailyIngestionMock).toHaveBeenCalledWith(
      expect.objectContaining({ forceReprocess: true }),
    );
  });

  it("threads forceReprocess=false (default) when ?force is absent", async () => {
    runDailyIngestionMock.mockResolvedValue({
      runId: "uuid_default",
      status: "completed",
      podcastsScanned: 31,
    });
    const { POST } = await import("@/app/api/ingest/route");
    await POST(
      new Request("https://test.local/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(runDailyIngestionMock).toHaveBeenCalledWith(
      expect.objectContaining({ forceReprocess: false }),
    );
  });

  it("rate limit still applies under ?force=1 (force bypasses dedup, not rate-limit)", async () => {
    const recent = new Date(Date.now() - 10_000).toISOString();
    supabaseAdminMock.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: { created_at: recent },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { POST } = await import("@/app/api/ingest/route");
    const response = await POST(
      new Request("https://test.local/api/ingest?force=1", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(429);
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ingest — rate limit", () => {
  it("returns 429 with Retry-After when a manual_run row exists within 60 seconds", async () => {
    const recent = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    supabaseAdminMock.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { created_at: recent }, error: null }),
            }),
          }),
        }),
      }),
    }));
    const { POST } = await import("@/app/api/ingest/route");
    const response = await POST(
      new Request("https://test.local/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(runDailyIngestionMock).not.toHaveBeenCalled();
  });

  it("allows the call when the most-recent manual_run is older than 60 seconds", async () => {
    const old = new Date(Date.now() - 120_000).toISOString();
    supabaseAdminMock.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { created_at: old }, error: null }),
            }),
          }),
        }),
      }),
    }));
    runDailyIngestionMock.mockResolvedValue({
      runId: "uuid",
      status: "completed",
      podcastsScanned: 0,
    });
    const { POST } = await import("@/app/api/ingest/route");
    const response = await POST(
      new Request("https://test.local/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(runDailyIngestionMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/ingest — internal failure", () => {
  it("returns 500 when runDailyIngestion throws", async () => {
    runDailyIngestionMock.mockRejectedValue(new Error("unexpected"));
    const { POST } = await import("@/app/api/ingest/route");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(
      new Request("https://test.local/api/ingest", {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("ingestion_failed");
    // The route does not leak err.message to the response — it logs
    // server-side instead (verified via the console.error spy).
    expect(body.message).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
