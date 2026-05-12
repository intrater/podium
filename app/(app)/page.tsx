import { retryDailyIngestion } from "@/app/(app)/actions";
import { EpisodeCard } from "@/components/digest/episode-card";
import { DigestEmptyFallback } from "@/components/digest/empty-fallback";
import { DigestLoadingState } from "@/components/digest/loading-state";
import { RefreshBanner } from "@/components/digest/refresh-banner";
import {
  loadDigestCards,
  loadLatestRunStatus,
} from "@/lib/digest/load-cards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TEAM_ID = "49ers";

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
 */
export default async function DigestPage() {
  const userClient = await createSupabaseServerClient();
  const adminClient = getSupabaseAdmin();

  const [cards, latestRun] = await Promise.all([
    loadDigestCards(userClient, TEAM_ID),
    loadLatestRunStatus(adminClient),
  ]);

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

  return (
    <>
      <RefreshBanner initialRunCreatedAt={latestRun.createdAt} />
      <ul className="flex flex-col gap-3">
        {cards.map((card) => (
          <li key={card.id}>
            <EpisodeCard card={card} />
          </li>
        ))}
      </ul>
    </>
  );
}
