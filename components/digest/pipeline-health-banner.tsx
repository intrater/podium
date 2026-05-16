import type { LatestRunStatus } from "@/lib/digest/load-cards";

/**
 * Surfaces a recent pipeline failure to the user at the top of the
 * digest, so empty days aren't mistaken for "everything's fine, just
 * a quiet day." Only renders when the latest run is in a non-success
 * terminal state.
 */
export function PipelineHealthBanner({ latestRun }: { latestRun: LatestRunStatus }) {
  if (latestRun.status !== "failed" && latestRun.status !== "cost_aborted") {
    return null;
  }

  const when = latestRun.createdAt
    ? new Date(latestRun.createdAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "recently";

  const title =
    latestRun.status === "failed"
      ? "Today's update couldn't complete"
      : "Today's update paused on budget";

  const body =
    latestRun.notes ??
    (latestRun.status === "failed"
      ? "The ingestion run didn't finish. Older episodes below are still up to date."
      : "We held off so the daily budget isn't exhausted on one run. Older episodes below are still up to date.");

  return (
    <div
      role="status"
      className="border-destructive/30 bg-destructive/5 text-foreground mb-3 flex flex-col gap-1 rounded-lg border px-4 py-3"
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground text-xs">
        {body}
        <span className="ml-1 opacity-75">· last run {when}</span>
      </p>
    </div>
  );
}
