/**
 * /api/feedback POST + DELETE tests.
 *
 * Mocks `createSupabaseServerClient` so the route's body parsing, zod
 * validation, error mapping, and happy-path response shape can be
 * exercised without hitting the live DB. Cross-user RLS enforcement
 * is covered by the U5 RLS smoke suite, which exercises the same anon-
 * key + stub-JWT client this route uses.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const insertResultRef: { value: { data: unknown; error: unknown } } = {
  value: { data: { id: "feedback-uuid-1" }, error: null },
};
const deleteResultRef: { value: { error: unknown } } = {
  value: { error: null },
};

const insertSpy = vi.fn();
const supabaseMock = {
  from: vi.fn(() => ({
    insert: (row: Record<string, unknown>) => {
      insertSpy(row);
      return {
        select: () => ({
          single: async () => insertResultRef.value,
        }),
      };
    },
    delete: () => ({
      eq: async () => deleteResultRef.value,
    }),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => supabaseMock,
}));

import { DELETE, POST } from "@/app/api/feedback/route";

const CARD_ID = "1c3a8a86-8e5b-4e0b-a9d7-1f6c0e0c9a01";
const FEEDBACK_ID = "1c3a8a86-8e5b-4e0b-a9d7-1f6c0e0c9a02";

function makeRequest(method: "POST" | "DELETE", body: unknown): Request {
  return new Request("http://test.local/api/feedback", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  supabaseMock.from.mockClear();
  insertSpy.mockClear();
  insertResultRef.value = { data: { id: "feedback-uuid-1" }, error: null };
  deleteResultRef.value = { error: null };
});

describe("POST /api/feedback", () => {
  it("happy path: inserts and returns { id }", async () => {
    const res = await POST(
      makeRequest("POST", { cardId: CARD_ID, verdict: "not_relevant" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "feedback-uuid-1" });
    expect(supabaseMock.from).toHaveBeenCalledWith("feedback");
  });

  it("regression: INSERT includes user_id (feedback.user_id is NOT NULL with no auto-fill)", async () => {
    await POST(
      makeRequest("POST", { cardId: CARD_ID, verdict: "love" }),
    );
    // env.PODIUM_USER_ID is loaded from .env.local via setup.ts.
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: expect.any(String),
        card_id: CARD_ID,
        verdict: "love",
      }),
    );
    const insertedUserId = insertSpy.mock.calls[0][0].user_id;
    expect(typeof insertedUserId).toBe("string");
    expect(insertedUserId.length).toBeGreaterThan(0);
  });

  it.each(["not_relevant", "not_substantive", "love"] as const)(
    "accepts verdict=%s",
    async (verdict) => {
      const res = await POST(makeRequest("POST", { cardId: CARD_ID, verdict }));
      expect(res.status).toBe(200);
    },
  );

  it("rejects an unrecognized verdict with 400", async () => {
    const res = await POST(
      makeRequest("POST", { cardId: CARD_ID, verdict: "spam" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_body" });
  });

  it("rejects a missing cardId with 400", async () => {
    const res = await POST(makeRequest("POST", { verdict: "love" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-uuid cardId with 400", async () => {
    const res = await POST(
      makeRequest("POST", { cardId: "not-a-uuid", verdict: "love" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON with 400", async () => {
    const req = new Request("http://test.local/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_json" });
  });

  it("maps RLS denial (code 42501) to 403 forbidden", async () => {
    insertResultRef.value = {
      data: null,
      error: { code: "42501", message: "policy" },
    };
    const res = await POST(
      makeRequest("POST", { cardId: CARD_ID, verdict: "love" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });

  it("maps generic DB errors to 500 insert_failed", async () => {
    insertResultRef.value = {
      data: null,
      error: { code: "08006", message: "connection lost" },
    };
    const res = await POST(
      makeRequest("POST", { cardId: CARD_ID, verdict: "love" }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "insert_failed" });
  });
});

describe("DELETE /api/feedback", () => {
  it("happy path: deletes and returns 204", async () => {
    const res = await DELETE(
      makeRequest("DELETE", { feedbackId: FEEDBACK_ID }),
    );
    expect(res.status).toBe(204);
  });

  it("rejects missing feedbackId with 400", async () => {
    const res = await DELETE(makeRequest("DELETE", {}));
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB error", async () => {
    deleteResultRef.value = { error: { message: "boom" } };
    const res = await DELETE(
      makeRequest("DELETE", { feedbackId: FEEDBACK_ID }),
    );
    expect(res.status).toBe(500);
  });
});
