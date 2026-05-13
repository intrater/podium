// @vitest-environment jsdom

/**
 * Optimistic feedback flow tests.
 *
 * Mocks `sonner` so we can assert toast invocations and stand in for
 * the Undo action callback. Uses an injected fetcher to control the
 * POST/DELETE response shape and verify the right requests fire.
 *
 *   - submitNotRelevant on success: hides card, POSTs, surfaces toast
 *     with an Undo action that DELETEs.
 *   - submitNotRelevant on failure: hides then rolls back, errors toast.
 *   - submitNotRelevant Undo before POST resolves: cancellation cleans
 *     up the persisted row when the POST eventually lands.
 *   - submitFeedback for love / not_substantive returns true on 2xx,
 *     false on error.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastFn, toastError, toastDismiss } = vi.hoisted(() => ({
  toastFn: vi.fn(),
  toastError: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastFn, {
    error: toastError,
    dismiss: toastDismiss,
  }),
}));

import {
  submitFeedback,
  submitNotRelevant,
} from "@/lib/feedback/optimistic";

beforeEach(() => {
  toastFn.mockReset();
  toastError.mockReset();
  toastDismiss.mockReset();
});

const CARD_ID = "1c3a8a86-8e5b-4e0b-a9d7-1f6c0e0c9a01";
const FEEDBACK_ID = "1c3a8a86-8e5b-4e0b-a9d7-1f6c0e0c9a02";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("submitNotRelevant", () => {
  it("hides the card, POSTs feedback, and surfaces the Undo toast", async () => {
    const onHide = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: FEEDBACK_ID }));
    toastFn.mockReturnValue("toast-1");

    await submitNotRelevant({ cardId: CARD_ID, onHide, fetcher });

    expect(onHide).toHaveBeenNthCalledWith(1, true);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({ method: "POST" }),
    );
    expect(toastFn).toHaveBeenCalledTimes(1);
    const callOpts = toastFn.mock.calls[0][1] as {
      duration: number;
      action: { label: string; onClick: () => void };
    };
    expect(callOpts.duration).toBe(5_000);
    expect(callOpts.action.label).toBe("Undo");

    // Invoke the Undo action — should restore + DELETE.
    callOpts.action.onClick();
    expect(onHide).toHaveBeenLastCalledWith(false);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rolls back the optimistic hide and shows an error toast on POST failure", async () => {
    const onHide = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));

    await submitNotRelevant({ cardId: CARD_ID, onHide, fetcher });

    expect(onHide).toHaveBeenNthCalledWith(1, true);
    expect(onHide).toHaveBeenLastCalledWith(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastFn).not.toHaveBeenCalled();
  });

  // Note on the cancellation branch: `cancelled` is only flipped by the
  // toast's Undo action. The toast itself is created AFTER the POST
  // resolves successfully. So the "POST returned but user already
  // cancelled" path is unreachable from the public API today — the
  // `if (cancelled)` guard inside the success block is defensive code
  // for a future flow that fires the toast pre-POST (e.g. true optimistic
  // surfacing). No automated test exercises that branch; verifying it
  // would require a redesign that lets Undo cancel an in-flight POST.
});

describe("submitFeedback (non-hiding verdicts)", () => {
  it("returns true on a 2xx response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: FEEDBACK_ID }));
    const ok = await submitFeedback(CARD_ID, "love", fetcher);
    expect(ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(`"verdict":"love"`),
      }),
    );
  });

  it("returns false on a non-2xx response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    const ok = await submitFeedback(CARD_ID, "not_substantive", fetcher);
    expect(ok).toBe(false);
  });

  it("returns false on a network error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const ok = await submitFeedback(CARD_ID, "love", fetcher);
    expect(ok).toBe(false);
  });
});
