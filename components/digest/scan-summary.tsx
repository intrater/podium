import { podcasts } from "@/config/podcasts";
import type { DigestCard } from "@/lib/digest/load-cards";

/**
 * Stat line above the digest grid. Cumulative across all visible cards.
 * The "saved ~X" segment only appears when at least one episode has a
 * known duration — backfill is best-effort, so partial coverage is
 * tolerated and the line degrades gracefully.
 */
export function ScanSummary({ cards }: { cards: readonly DigestCard[] }) {
  const episodeCount = cards.length;
  const momentCount = cards.reduce((sum, c) => sum + c.segments.length, 0);
  if (momentCount === 0) return null;

  const savedLabel = computeSavedLabel(cards);

  return (
    <p className="text-muted-foreground mb-3 text-sm">
      Scanned {podcasts.length} podcasts — surfaced {momentCount}{" "}
      {momentCount === 1 ? "moment" : "moments"} from {episodeCount}{" "}
      {episodeCount === 1 ? "episode" : "episodes"}
      {savedLabel ? <>, saving you ~{savedLabel} of listening</> : null}.
    </p>
  );
}

/**
 * Compact per-day stat for date-section headers: "3 episodes · saved
 * you ~2h". Drops the "saved" clause when no episode duration is known.
 */
export function DaySummary({ cards }: { cards: readonly DigestCard[] }) {
  if (cards.length === 0) return null;
  const episodeCount = cards.length;
  const savedLabel = computeSavedLabel(cards);
  return (
    <span className="text-muted-foreground text-xs">
      {episodeCount} {episodeCount === 1 ? "episode" : "episodes"}
      {savedLabel ? <> · saved you ~{savedLabel}</> : null}
    </span>
  );
}

function computeSavedLabel(cards: readonly DigestCard[]): string | null {
  const scannedSeconds = cards.reduce(
    (sum, c) => sum + (c.episode.durationSeconds ?? 0),
    0,
  );
  const momentSeconds = cards.reduce(
    (sum, c) => sum + (c.totalRelevantSeconds ?? 0),
    0,
  );
  const savedSeconds = Math.max(0, scannedSeconds - momentSeconds);
  return scannedSeconds > 0 ? formatSaved(savedSeconds) : null;
}

/** Formats seconds as "1h 22m" / "47m" / "2m" — sized for the
 *  "saved you ~X" inline label. */
function formatSaved(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}
