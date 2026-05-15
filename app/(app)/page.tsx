import { retryDailyIngestion } from "@/app/(app)/actions";
import { EpisodeCard } from "@/components/digest/episode-card";
import { DigestEmptyFallback } from "@/components/digest/empty-fallback";
import { DigestLoadingState } from "@/components/digest/loading-state";
import { RefreshBanner } from "@/components/digest/refresh-banner";
import { DaySummary, ScanSummary } from "@/components/digest/scan-summary";
import {
  groupCardsByPublishDate,
  loadDigestCards,
  loadLatestRunStatus,
  type LatestRunStatus,
} from "@/lib/digest/load-cards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TEAM_ID = "49ers";

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
 * RSC reads via the user-scoped Supabase client so the AE3 feedback
 * filter inside `loadDigestCards` exercises RLS and stays user-bound.
 * Status (system_alerts) requires the admin client because operational
 * tables are service-role-only after migration 0010.
 *
 * Three top-level branches:
 *
 *   - Cards exist → grid + RefreshBanner (RSC content; client banner
 *     watches for fresher runs and prompts the user to reload).
 *   - Zero cards + status == completed → empty fallback (the run
 *     genuinely landed nothing — quiet day for the team).
 *   - Zero cards + any other status → DigestLoadingState (handles
 *     running, failed, cost_aborted, and auto-triggers retry on
 *     no_runs per Q8).
 *
 * A status-query failure does NOT block the page — Promise.allSettled
 * isolates the two reads so the cards still render even when
 * system_alerts is temporarily unavailable. The status surface degrades
 * to "unknown" / no refresh banner.
 */
export default async function DigestPage() {
  const userClient = await createSupabaseServerClient();
  const adminClient = getSupabaseAdmin();

  const [cardsResult, latestRunResult] = await Promise.allSettled([
    loadDigestCards(userClient, TEAM_ID),
    loadLatestRunStatus(adminClient),
  ]);

  if (cardsResult.status === "rejected") {
    // Cards query failed — let Next.js's error boundary handle it.
    // This path indicates RLS denial or a real DB outage, both of
    // which are worth surfacing rather than silently hiding.
    throw cardsResult.reason;
  }
  const cards = cardsResult.value;
  const latestRun: LatestRunStatus =
    latestRunResult.status === "fulfilled"
      ? latestRunResult.value
      : (console.error(
          "digest-page: loadLatestRunStatus failed, falling back to 'unknown'",
          latestRunResult.reason,
        ),
        STATUS_FALLBACK);

  if (cards.length === 0) {
    if (latestRun.status === "completed") {
      return <DigestEmptyFallback />;
    }
    return (
      <DigestLoadingState
        initialStatus={latestRun.status}
        initialNotes={latestRun.notes}
        initialCostUsd={latestRun.costUsd}
        onRetry={retryDailyIngestion}
      />
    );
  }

  const groups = groupCardsByPublishDate(cards);

  return (
    <>
      <RefreshBanner initialRunCreatedAt={latestRun.createdAt} />
      <ScanSummary cards={cards} />
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.dateKey} aria-label={group.label}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {group.label}
              </h2>
              <DaySummary cards={group.cards} />
            </div>
            <ul className="flex flex-col gap-3">
              {group.cards.map((card) => (
                <li key={card.id}>
                  <EpisodeCard card={card} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
