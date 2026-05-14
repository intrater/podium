import { podcasts } from "@/config/podcasts";
import type { DigestCard } from "@/lib/digest/load-cards";

/**
 * Stat line above the digest grid. Frames the work the daily ingest did
 * so users see the value of the scan, not just the cards. v1 surfaces
 * podcasts scanned + moments + episodes; "time saved" lands in v2 once
 * episode duration is captured in the pipeline.
 */
export function ScanSummary({ cards }: { cards: readonly DigestCard[] }) {
  const episodeCount = cards.length;
  const momentCount = cards.reduce((sum, c) => sum + c.segments.length, 0);
  if (momentCount === 0) return null;

  return (
    <p className="text-muted-foreground mb-3 text-sm">
      Scanned {podcasts.length} podcasts — surfaced {momentCount}{" "}
      {momentCount === 1 ? "moment" : "moments"} from {episodeCount}{" "}
      {episodeCount === 1 ? "episode" : "episodes"}.
    </p>
  );
}
