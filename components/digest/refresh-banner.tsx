"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

interface StatusPayload {
  status: string;
  lastRun: { createdAt: string | null } | null;
}

/** Same cadence as the first-run loader. */
const POLL_MS = 30_000;

/**
 * Shown when a fresh ingestion completes while the user has the page open.
 * Detects "completed" runs newer than the run that produced the rendered
 * cards. Clicking the banner reloads the page so the user can opt into
 * the refreshed content instead of having the grid mutate underneath them.
 *
 * Polls at a slower cadence than the first-run loader — this is a
 * background convenience, not the gating UI for a blank page.
 */
export function RefreshBanner({
  initialRunCreatedAt,
}: {
  initialRunCreatedAt: string | null;
}) {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch("/api/ingest/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as StatusPayload;
        if (cancelled) return;
        const created = json.lastRun?.createdAt;
        if (
          json.status === "completed" &&
          created &&
          (initialRunCreatedAt === null ||
            new Date(created).getTime() >
              new Date(initialRunCreatedAt).getTime())
        ) {
          setShowBanner(true);
          return; // Stop polling once the banner is up.
        }
      } catch {
        // Ignore network blips — the user can manually refresh.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialRunCreatedAt]);

  if (!showBanner) return null;

  return (
    <div
      role="status"
      className="bg-popover border-team-accent/40 sticky top-3 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border px-4 py-1.5 shadow-lg"
    >
      <span className="text-foreground text-sm">New digest ready</span>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => window.location.reload()}
      >
        Refresh
      </Button>
    </div>
  );
}
