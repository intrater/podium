"use client";

import { useEffect, useRef, useState } from "react";

import { DigestLoadingSkeleton } from "@/components/digest/loading-skeleton";
import { Button } from "@/components/ui/button";
import type { DigestRunStatus } from "@/lib/digest/load-cards";

interface StatusResponse {
  status: DigestRunStatus;
  lastRun: {
    notes: string | null;
    costUsd: number | null;
    createdAt: string | null;
  } | null;
}

/** Poll interval (ms). Matches the plan's Q8 first-run UX cadence. */
const POLL_MS = 2_000;
/** Hard timeout after which we show a "taking longer than expected" surface. */
const TIMEOUT_MS = 5 * 60 * 1_000;
/** Stop polling after this many consecutive fetch failures so a broken
 *  /api/ingest/status doesn't spin indefinitely. */
const MAX_CONSECUTIVE_ERRORS = 5;

interface Props {
  /** Initial status as read by the page's RSC. Lets the surface render the
   *  correct branch (running skeleton vs. failed vs. cost-aborted) without
   *  waiting for the first poll to land. */
  initialStatus: DigestRunStatus;
  /** Initial `notes`/`costUsd` payload that goes with `initialStatus`.
   *  Mirrors the system_alerts row that produced the status. */
  initialNotes?: string | null;
  initialCostUsd?: number | null;
  /**
   * Server action triggered by the Retry button — and auto-called on
   * mount when `initialStatus === "no_runs"` (Q8: auto-seed first run).
   * The server resolves the user from the existing stub-JWT context.
   */
  onRetry: () => Promise<void>;
}

/**
 * First-run loading surface. Polls `/api/ingest/status` every 2s and
 * renders one of: skeleton (running), timeout, failed-with-retry,
 * cost-aborted message. Hands control back to the page (via
 * `window.location.reload()`) the moment the latest run completes.
 *
 * On the "no_runs" branch — first ever page load before any cron has
 * fired — auto-invokes `onRetry` so the user sees content without
 * pressing a button (Q8).
 */
export function DigestLoadingState({
  initialStatus,
  initialNotes = null,
  initialCostUsd = null,
  onRetry,
}: Props) {
  const [status, setStatus] = useState<DigestRunStatus>(
    initialStatus === "no_runs" ? "running" : initialStatus,
  );
  const [notes, setNotes] = useState<string | null>(initialNotes);
  const [costUsd, setCostUsd] = useState<number | null>(initialCostUsd);
  const [timedOut, setTimedOut] = useState(false);
  const [keepWaiting, setKeepWaiting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Mount-time wall-clock for the 5-minute timeout. Initialized in the
  // mount effect so render stays pure (react-hooks/purity flags Date.now()
  // called during render).
  const startedAt = useRef<number | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (startedAt.current === null) startedAt.current = Date.now();
    if (initialStatus === "no_runs" && !autoStarted.current) {
      autoStarted.current = true;
      void onRetry();
    }
  }, [initialStatus, onRetry]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    let consecutiveErrors = 0;
    async function tick() {
      try {
        const res = await fetch("/api/ingest/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;
        consecutiveErrors = 0;
        setStatus(json.status);
        setNotes(json.lastRun?.notes ?? null);
        setCostUsd(json.lastRun?.costUsd ?? null);
        if (json.status === "completed") {
          // Page-level RSC reload picks up the new cards.
          window.location.reload();
          return;
        }
        if (
          json.status === "running" &&
          !keepWaiting &&
          startedAt.current !== null &&
          Date.now() - startedAt.current > TIMEOUT_MS
        ) {
          setTimedOut(true);
          return;
        }
      } catch {
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          // Status endpoint is persistently unhealthy — surface a
          // recoverable failure rather than spinning forever.
          if (!cancelled) setStatus("failed");
          return;
        }
      }
      if (!cancelled) {
        timer = setTimeout(tick, POLL_MS);
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [keepWaiting]);

  async function handleRetry() {
    setRetrying(true);
    setTimedOut(false);
    setStatus("running");
    startedAt.current = Date.now();
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  if (status === "failed") {
    return (
      <Recovery
        title="Something went wrong with your first run."
        body={notes ?? "The ingestion pipeline failed mid-run. Try again."}
        primary={{
          label: retrying ? "Retrying…" : "Retry",
          onClick: handleRetry,
          disabled: retrying,
        }}
      />
    );
  }

  if (status === "cost_aborted") {
    const costLine = costUsd
      ? `Estimated next run: $${costUsd.toFixed(2)}.`
      : null;
    return (
      <Recovery
        title="Daily budget threshold reached."
        body={[
          "We paused before spending more on the Particle Starter credit.",
          costLine,
          notes,
        ]
          .filter(Boolean)
          .join(" ")}
      />
    );
  }

  if (timedOut) {
    return (
      <Recovery
        title="This is taking longer than expected."
        body="The first-run ingestion has been running for over 5 minutes. You can try again or keep waiting."
        primary={{
          label: retrying ? "Trying again…" : "Try again",
          onClick: handleRetry,
          disabled: retrying,
        }}
        secondary={{
          label: "Continue waiting",
          onClick: () => {
            setTimedOut(false);
            setKeepWaiting(true);
            startedAt.current = Date.now();
          },
        }}
      />
    );
  }

  return (
    <section aria-busy aria-live="polite" className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Preparing your first digest…
      </p>
      <DigestLoadingSkeleton />
    </section>
  );
}

interface RecoveryProps {
  title: string;
  body: string;
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void };
}

function Recovery({ title, body, primary, secondary }: RecoveryProps) {
  return (
    <section
      role="alert"
      className="bg-card flex flex-col items-start gap-3 rounded-xl p-6"
    >
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      {(primary || secondary) && (
        <div className="mt-2 flex gap-2">
          {primary ? (
            <Button onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </Button>
          ) : null}
          {secondary ? (
            <Button variant="outline" onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
