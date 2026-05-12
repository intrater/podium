"use client";

import { toast } from "sonner";

/**
 * Optimistic "Not relevant" flow.
 *
 *   1. Hide the card immediately (caller's `setHidden(true)`).
 *   2. POST /api/feedback in the background.
 *   3. On POST success: surface an Undo toast for 5s. The Undo action
 *      restores the card AND DELETEs the feedback row.
 *   4. On POST failure: restore the card and surface an error toast.
 *
 * A short race exists if the user clicks Undo while the POST is in
 * flight (the feedbackId isn't known yet). We dismiss the toast +
 * mark the operation as cancelled so the eventual POST result is
 * cleaned up on either branch (success → DELETE the new row;
 * failure → no-op).
 */

export interface NotRelevantContext {
  cardId: string;
  /** Caller-supplied hide control. Called immediately + on rollback. */
  setHidden: (hidden: boolean) => void;
  /** Optional fetcher override for tests. Defaults to global `fetch`. */
  fetcher?: typeof fetch;
}

export async function submitNotRelevant({
  cardId,
  setHidden,
  fetcher = fetch,
}: NotRelevantContext): Promise<void> {
  setHidden(true);

  let cancelled = false;
  let toastId: string | number | undefined;

  try {
    const res = await fetcher("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, verdict: "not_relevant" }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { id: string };
    if (cancelled) {
      // User undid before the POST landed — clean up the row we just created.
      void fetcher("/api/feedback", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId: data.id }),
      });
      return;
    }
    toastId = toast("Card hidden", {
      duration: 5_000,
      action: {
        label: "Undo",
        onClick: () => {
          cancelled = true;
          setHidden(false);
          void fetcher("/api/feedback", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedbackId: data.id }),
          });
        },
      },
    });
  } catch {
    if (cancelled) return;
    setHidden(false);
    if (toastId !== undefined) toast.dismiss(toastId);
    toast.error("Couldn't save feedback — try again.");
  }
}

/**
 * Lightweight POST for the non-hiding verdicts (love / not substantive).
 * Resolves to true on success, false on failure. No optimistic UI — the
 * button just animates fill on click.
 */
export async function submitFeedback(
  cardId: string,
  verdict: "not_substantive" | "love",
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetcher("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, verdict }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
