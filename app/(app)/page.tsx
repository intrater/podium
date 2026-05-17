import { retryDailyIngestion } from "@/app/(app)/actions";
import { CardRenderer } from "@/components/digest/card-renderer";
import { DigestLoadingState } from "@/components/digest/loading-state";
import { PipelineHealthBanner } from "@/components/digest/pipeline-health-banner";
import { RefreshBanner } from "@/components/digest/refresh-banner";
import { DaySummary, ScanSummary } from "@/components/digest/scan-summary";
import {
  groupFeedByDayWindow,
  loadLatestRunStatus,
  type LatestRunStatus,
} from "@/lib/digest/load-cards";
import { loadDigestFeed } from "@/lib/digest/merge-feed";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TEAM_ID = "49ers";
// Number of recent days to always render as sections, so the user can
// see at-a-glance which days had content and which didn't.
const DAY_WINDOW = 7;

/** Sentinel returned when the system_alerts lookup throws — the page
 *  still renders cards rather than 500ing on a status read failure. */
const STATUS_FALLBACK: LatestRunStatus = {
  status: "unknown",
  createdAt: null,
  notes: null,
  costUsd: null,
};

/**
 * Mobile-first digest grid (the home screen).
 *
 * v2 reads via `loadDigestFeed` (lib/digest/merge-feed.ts) which
 * returns a discriminated union of episode, theme, and notable-take
 * cards. The feature flag NEXT_PUBLIC_PODIUM_V2_FEED controls whether
 * the theme/notable_take loaders run at all — off-by-default
 * preserves the v1 home-feed shape until v2 is dogfooded clean.
 *
 * RSC reads via the user-scoped Supabase client so the AE3 feedback
 * filter inside the loaders exercises RLS and stays user-bound.
 * Status (system_alerts) requires the admin client because operational
 * tables are service-role-only after migration 0010.
 */
export default async function DigestPage() {
  const userClient = await createSupabaseServerClient();
  const adminClient = getSupabaseAdmin();

  const [feedResult, latestRunResult] = await Promise.allSettled([
    loadDigestFeed(userClient, TEAM_ID),
    loadLatestRunStatus(adminClient),
  ]);

  if (feedResult.status === "rejected") {
    // Feed query failed — let Next.js's error boundary handle it.
    // This path indicates RLS denial or a real DB outage, both of
    // which are worth surfacing rather than silently hiding.
    throw feedResult.reason;
  }
  const feed = feedResult.value;
  const latestRun: LatestRunStatus =
    latestRunResult.status === "fulfilled"
      ? latestRunResult.value
      : (console.error(
          "digest-page: loadLatestRunStatus failed, falling back to 'unknown'",
          latestRunResult.reason,
        ),
        STATUS_FALLBACK);

  // No cards at all + the pipeline has never completed → first-run UX
  // (loading / retry / cost-abort recovery). Once at least one run has
  // completed, even with zero cards, we render the day-window grid so
  // the user sees explicit "no new content" sections rather than a
  // blank screen.
  if (feed.length === 0 && latestRun.status !== "completed") {
    return (
      <DigestLoadingState
        initialStatus={latestRun.status}
        initialNotes={latestRun.notes}
        initialCostUsd={latestRun.costUsd}
        onRetry={retryDailyIngestion}
      />
    );
  }

  const groups = groupFeedByDayWindow(feed, DAY_WINDOW);

  // ScanSummary + DaySummary today consume DigestCard[]. They only
  // read `episode.durationSeconds` and `segments` from each card to
  // produce the time-saved math. Filter to episode cards so the math
  // continues to work in v1-mode; in v2-mode this under-reports
  // because theme/notable_take cards don't have per-card duration —
  // the summary feature is v1-shaped and can be reworked later.
  const episodeCardsForSummaries = feed
    .filter((item): item is import("@/lib/digest/types").DigestEpisodeCard => item.card_type === "episode");

  return (
    <>
      <RefreshBanner initialRunCreatedAt={latestRun.createdAt} />
      <PipelineHealthBanner latestRun={latestRun} />
      <ScanSummary cards={episodeCardsForSummaries} />
      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const episodeItemsForDay = group.items.filter(
            (i): i is import("@/lib/digest/types").DigestEpisodeCard => i.card_type === "episode",
          );
          return (
            <section key={group.dateKey} aria-label={group.label}>
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {group.label}
                </h2>
                <DaySummary cards={episodeItemsForDay} />
              </div>
              {group.items.length === 0 ? (
                <p className="text-muted-foreground px-1 text-xs italic">
                  No 49ers content this day.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <CardRenderer item={item} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
