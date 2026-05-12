"use client";

import { cn } from "@/lib/utils";
import type { DigestSegment } from "@/lib/digest/load-cards";

/**
 * Segment-level transcript with active-segment highlight + click-to-seek.
 * The active segment (the one whose [startSeconds, endSeconds] contains
 * `currentTime`) carries `data-active="true"` for styling and a subtle
 * left-edge accent line. Clicking any segment button calls `onSeek`
 * with that segment's `startSeconds`, jumping playback (AE6).
 *
 * No word-level RAF loop in MVP; that lands when usage data justifies
 * the engineering bill. Re-rendering ~5 segments on `timeupdate` is
 * fine — the list is small and the work is bounded.
 */

interface Props {
  segments: DigestSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}

export function Transcript({ segments, currentTime, onSeek }: Props) {
  if (segments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transcript segments available.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4" data-slot="transcript">
      {segments.map((segment, idx) => {
        const start = segment.startSeconds ?? 0;
        const end = segment.endSeconds ?? Number.POSITIVE_INFINITY;
        const active = currentTime >= start && currentTime < end;
        return (
          <li key={segment.id}>
            <button
              type="button"
              data-slot="transcript-segment"
              data-active={active || undefined}
              data-start={start}
              onClick={() => onSeek(start)}
              className={cn(
                "border-border/40 hover:bg-card/80 group block w-full rounded-lg border-l-2 px-4 py-3 text-left transition-colors",
                active
                  ? "border-l-team-accent bg-card/70"
                  : "border-l-transparent",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-xs">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {formatClock(start)}
                </span>
                {segment.speakerName ? (
                  <span className="text-muted-foreground text-xs">
                    · {segment.speakerName}
                  </span>
                ) : null}
              </div>
              {segment.summary ? (
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    active ? "text-foreground" : "text-foreground/85",
                  )}
                >
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
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const sec = total % 60;
  return `${minutes}:${String(sec).padStart(2, "0")}`;
}
