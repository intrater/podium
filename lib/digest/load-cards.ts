/**
 * Digest loader — server-side card fetch with feedback filtering.
 *
 * Returns the cards that should appear in the digest grid for the given
 * user, with the AE3 "Not relevant" filter applied at both the card and
 * segment level. The RSC at `app/(app)/page.tsx` consumes this; tests
 * exercise it directly.
 *
 * Why two queries instead of one embedded join: PostgREST's embedded
 * filtering on a sibling table (feedback rows that DON'T match the row's
 * id) is awkward to express. Two scoped queries plus an in-memory anti-
 * join is simpler, leans on RLS for both, and the cardinality is small
 * (one user's recent cards + their feedback rows).
 *
 * Order: `cards.surfaced_at desc`. The plan's mobile-density target is
 * 5–8 cards above the fold; this returns up to 50 cards so a scroller
 * has something to chew on without paginating in v1.
 *
 * **Server-only.** The function takes a SupabaseClient so tests can pass
 * a mocked client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DigestSegment {
  id: string;
  particleSegmentId: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  audioUrl: string | null;
  speakerName: string | null;
  summary: string | null;
  pullQuotes: string[];
  bullets: string[];
  surfacingEntities: string[];
}

export interface DigestCard {
  id: string;
  surfacedAt: string;
  totalRelevantSeconds: number | null;
  episodeSummary: string | null;
  episode: {
    id: string;
    title: string;
    publishedAt: string | null;
    audioUrl: string | null;
    podcast: { id: string; name: string };
  };
  segments: DigestSegment[];
}

interface CardRow {
  id: string;
  surfaced_at: string;
  total_relevant_seconds: number | null;
  episode_summary: string | null;
  episodes: {
    id: string;
    title: string;
    published_at: string | null;
    audio_url: string | null;
    podcasts: { id: string; name: string } | null;
    segments: Array<{
      id: string;
      particle_segment_id: string | null;
      start_seconds: number | null;
      end_seconds: number | null;
      audio_url: string | null;
      speaker_name: string | null;
      summary: string | null;
      pull_quotes: string[] | null;
      bullets: string[] | null;
      surfacing_entities: string[] | null;
    }>;
  } | null;
}

interface FeedbackRow {
  card_id: string | null;
  segment_id: string | null;
  verdict: string;
}

const CARDS_LIMIT = 50;

/**
 * Load the digest cards for the current user (resolved server-side via
 * the client's `auth.uid()`), filtering out cards and segments marked
 * "Not relevant" via feedback. The team filter is applied here too —
 * v1 ships one team, but the column is set so v2 doesn't need a rewrite.
 */
export async function loadDigestCards(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DigestCard[]> {
  const [cardsResult, feedbackResult] = await Promise.all([
    supabase
      .from("cards")
      .select(
        `
          id, surfaced_at, total_relevant_seconds, episode_summary,
          episodes (
            id, title, published_at, audio_url,
            podcasts ( id, name ),
            segments (
              id, particle_segment_id, start_seconds, end_seconds,
              audio_url, speaker_name, summary, pull_quotes, bullets,
              surfacing_entities
            )
          )
        `,
      )
      .eq("team_id", teamId)
      .eq("hidden", false)
      .order("surfaced_at", { ascending: false })
      .limit(CARDS_LIMIT)
      .returns<CardRow[]>(),
    supabase
      .from("feedback")
      .select("card_id, segment_id, verdict")
      .eq("verdict", "not_relevant")
      // Bounded to keep page-load cost flat as hide history grows. Higher
      // than the card cap because feedback accumulates across many cards.
      .limit(500)
      .returns<FeedbackRow[]>(),
  ]);

  if (cardsResult.error) throw cardsResult.error;
  if (feedbackResult.error) throw feedbackResult.error;

  const hiddenCardIds = new Set<string>();
  const hiddenSegmentIds = new Set<string>();
  for (const row of feedbackResult.data ?? []) {
    if (row.card_id) hiddenCardIds.add(row.card_id);
    if (row.segment_id) hiddenSegmentIds.add(row.segment_id);
  }

  const cards: DigestCard[] = [];
  for (const row of cardsResult.data ?? []) {
    if (hiddenCardIds.has(row.id)) continue;
    if (!row.episodes) continue;
    const episode = row.episodes;
    const podcast = episode.podcasts ?? { id: "", name: "Unknown podcast" };

    const segments = (episode.segments ?? [])
      .filter((s) => !hiddenSegmentIds.has(s.id))
      .sort((a, b) => (a.start_seconds ?? 0) - (b.start_seconds ?? 0))
      .map<DigestSegment>((s) => ({
        id: s.id,
        particleSegmentId: s.particle_segment_id,
        startSeconds: s.start_seconds,
        endSeconds: s.end_seconds,
        audioUrl: s.audio_url,
        speakerName: s.speaker_name,
        summary: s.summary,
        pullQuotes: s.pull_quotes ?? [],
        bullets: s.bullets ?? [],
        surfacingEntities: s.surfacing_entities ?? [],
      }));

    cards.push({
      id: row.id,
      surfacedAt: row.surfaced_at,
      totalRelevantSeconds: row.total_relevant_seconds,
      episodeSummary: row.episode_summary,
      episode: {
        id: episode.id,
        title: episode.title,
        publishedAt: episode.published_at,
        audioUrl: episode.audio_url,
        podcast: { id: podcast.id, name: podcast.name },
      },
      segments,
    });
  }
  return cards;
}

/** Total-relevant-seconds → "8 min across 3 segments" formatting. */
export function formatTotalTime(card: DigestCard): string {
  const seconds = card.totalRelevantSeconds ?? card.segments.reduce(
    (acc, s) =>
      acc +
      Math.max(0, (s.endSeconds ?? 0) - (s.startSeconds ?? 0)),
    0,
  );
  const minutes = Math.max(1, Math.round(seconds / 60));
  const segmentCount = card.segments.length;
  const minLabel = `${minutes} min`;
  if (segmentCount === 0) return minLabel;
  const segLabel = segmentCount === 1 ? "1 segment" : `${segmentCount} segments`;
  return `${minLabel} across ${segLabel}`;
}

/** "Mon, May 12" — short date for the card subline. Falls back to "—". */
export function formatPublishedAt(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Derived status — single source of truth shared between the
 *  `/api/ingest/status` route handler and the digest page. */
export type DigestRunStatus =
  | "no_runs"
  | "running"
  | "completed"
  | "cost_aborted"
  | "failed"
  | "unknown";

/** system_alerts.kind → DigestRunStatus. Exported so the route handler
 *  can derive the same status the digest page uses, without divergence. */
export const KIND_TO_STATUS: Record<string, DigestRunStatus> = {
  manual_run: "running",
  scheduled_run: "running",
  manual_run_complete: "completed",
  scheduled_run_complete: "completed",
  manual_run_failed: "failed",
  scheduled_run_failed: "failed",
  cost_abort: "cost_aborted",
  // U6: cadence gate skipped a scheduled run. Treated as "completed"
  // for UX purposes — the run cycle finished cleanly, just without
  // doing work. The notes field carries the "X hours since last
  // completion, Y days required" reason for anyone digging in.
  skipped_cadence: "completed",
};

export interface LatestRunStatus {
  status: DigestRunStatus;
  createdAt: string | null;
  notes: string | null;
  costUsd: number | null;
}

interface SystemAlertRow {
  kind: string;
  notes: string | null;
  cost_usd: number | string | null;
  created_at: string | null;
}

/**
 * Read the most recent `system_alerts` row and derive a status. Caller
 * must pass the admin (service-role) client — operational tables are
 * service-role-only after migration 0010.
 */
export async function loadLatestRunStatus(
  adminClient: SupabaseClient,
): Promise<LatestRunStatus> {
  const trackedKinds = Object.keys(KIND_TO_STATUS);
  const { data, error } = await adminClient
    .from("system_alerts")
    .select("kind, notes, cost_usd, created_at")
    .in("kind", trackedKinds)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<SystemAlertRow[]>()
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { status: "no_runs", createdAt: null, notes: null, costUsd: null };
  }
  const status: DigestRunStatus =
    data.kind in KIND_TO_STATUS ? KIND_TO_STATUS[data.kind] : "unknown";
  const costNum = data.cost_usd === null ? null : Number(data.cost_usd);
  return {
    status,
    createdAt: data.created_at,
    notes: data.notes,
    costUsd: costNum !== null && Number.isFinite(costNum) ? costNum : null,
  };
}
