"use client";

import type { ReactNode } from "react";

import { formatClock } from "@/lib/audio/format-time";
import { cn } from "@/lib/utils";
import type { DigestSegment } from "@/lib/digest/load-cards";

/**
 * Segment-level transcript with active-segment highlight + click-to-seek.
 * The active segment (the one whose [startSeconds, endSeconds] contains
 * `currentTime`) carries `data-active="true"` for styling and a subtle
 * left-edge accent line. Clicking any segment button calls `onSeek`
 * with that segment's `startSeconds`, jumping playback (AE6).
 *
 * When `playable` is false (the episode has no audio URL), segments
 * render as static `<div>`s instead of buttons — content is still
 * readable but there's nothing to seek into.
 *
 * No word-level RAF loop in MVP; that lands when usage data justifies
 * the engineering bill. Re-rendering ~5 segments on `timeupdate` is
 * fine — the list is small and the work is bounded.
 */

interface Props {
  segments: DigestSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  /** When false, segments render as read-only divs with no click-to-seek. */
  playable?: boolean;
}

export function Transcript({
  segments,
  currentTime,
  onSeek,
  playable = true,
}: Props) {
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
        const active = playable && currentTime >= start && currentTime < end;
        const body = <SegmentBody segment={segment} idx={idx} start={start} active={active} />;
        const className = cn(
          "border-border/40 group block w-full rounded-lg border-l-2 px-4 py-3 text-left transition-colors",
          playable && "hover:bg-card/80",
          active ? "border-l-team-accent bg-card/70" : "border-l-transparent",
        );
        return (
          <li key={segment.id}>
            {playable ? (
              <button
                type="button"
                data-slot="transcript-segment"
                data-active={active || undefined}
                data-start={start}
                onClick={() => onSeek(start)}
                className={className}
              >
                {body}
              </button>
            ) : (
              <div
                data-slot="transcript-segment"
                data-start={start}
                className={className}
              >
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SegmentBody({
  segment,
  idx,
  start,
  active,
}: {
  segment: DigestSegment;
  idx: number;
  start: number;
  active: boolean;
}): ReactNode {
  return (
    <>
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
    </>
  );
}
