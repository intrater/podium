import type { DigestSegment } from "@/lib/digest/load-cards";

/**
 * Renders the chronologically-ordered segments inside a card's expanded
 * sheet. v1 ships the structural shape (summary + pull quotes + bullets);
 * U12 inlines the audio player at each segment; U13 inlines the feedback
 * bar. Today the segment is read-only.
 */
export function SegmentList({ segments }: { segments: DigestSegment[] }) {
  if (segments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No segments were retained for this episode.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-6">
      {segments.map((segment, idx) => (
        <li
          key={segment.id}
          className="border-border/60 border-t pt-6 first:border-0 first:pt-0"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-xs">
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {formatRange(segment.startSeconds, segment.endSeconds)}
            </span>
            {segment.speakerName ? (
              <span className="text-muted-foreground text-xs">
                · {segment.speakerName}
              </span>
            ) : null}
          </div>
          {segment.summary ? (
            <p className="text-foreground/90 text-sm leading-relaxed">
              {segment.summary}
            </p>
          ) : null}
          {segment.pullQuotes.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {segment.pullQuotes.map((quote, i) => (
                <li
                  key={i}
                  className="border-team-accent text-foreground/90 border-l-2 pl-3 text-sm italic"
                >
                  “{quote}”
                </li>
              ))}
            </ul>
          ) : null}
          {segment.bullets.length > 0 ? (
            <ul className="text-foreground/80 mt-3 flex flex-col gap-1.5 text-sm">
              {segment.bullets.map((bullet, i) => (
                <li key={i} className="pl-4 -indent-2">
                  · {bullet}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function formatRange(start: number | null, end: number | null): string {
  if (start === null || end === null) return "—";
  return `${formatClock(start)} – ${formatClock(end)}`;
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const sec = total % 60;
  return `${minutes}:${String(sec).padStart(2, "0")}`;
}
