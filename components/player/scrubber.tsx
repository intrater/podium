"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { springs } from "@/components/player/motion-presets";
import { cn } from "@/lib/utils";

/**
 * Motion-driven drag scrubber + native progress fill.
 *
 * The visible track is a thin pill; the playhead is a motion.div the user
 * can drag horizontally. `useSpring` smooths the thumb position while
 * audio is playing; on drag end we call `onSeek` with the new time.
 *
 * Accessibility: the track itself carries `role="slider"` with
 * `aria-valuenow/min/max` so screen readers (and keyboard handling at
 * the AudioPlayer level) treat it as a real range control. Keyboard
 * arrows are bound on the AudioPlayer wrapper, not here, so the player
 * exposes a single focusable region rather than fighting native range
 * input behavior.
 *
 * Reduced motion: when prefers-reduced-motion is set, the thumb snaps
 * instead of springing.
 */

interface Props {
  /** Current playback position, seconds. */
  currentTime: number;
  /** Audio duration, seconds. May be 0 before loadedmetadata. */
  duration: number;
  /** Called when the user releases the thumb on a new position. */
  onSeek: (seconds: number) => void;
  /** When true (loading/error), the scrubber is dimmed and non-interactive. */
  disabled?: boolean;
  /** Subtle thumb pulse during buffering. */
  buffering?: boolean;
}

export function Scrubber({
  currentTime,
  duration,
  onSeek,
  disabled = false,
  buffering = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragX, setDragX] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  // Measure the track once mounted and on resize so dragConstraints
  // matches the rendered width.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.clientWidth);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const safeDuration = duration > 0 ? duration : 0;
  const progress =
    dragX !== null
      ? trackWidth > 0
        ? Math.max(0, Math.min(1, dragX / trackWidth))
        : 0
      : safeDuration > 0
        ? Math.max(0, Math.min(1, currentTime / safeDuration))
        : 0;
  const fillWidthPct = progress * 100;

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek through audio"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(currentTime)}
      aria-disabled={disabled || undefined}
      data-slot="scrubber-track"
      className={cn(
        "bg-popover relative h-1.5 w-full rounded-full",
        disabled && "opacity-50",
      )}
    >
      <div
        aria-hidden
        data-slot="scrubber-fill"
        className="bg-team-accent absolute top-0 left-0 h-full rounded-full"
        style={{ width: `${fillWidthPct}%` }}
      />
      {!disabled && trackWidth > 0 ? (
        <motion.div
          data-slot="scrubber-thumb"
          drag="x"
          dragConstraints={{ left: 0, right: trackWidth }}
          dragMomentum={false}
          dragElastic={0}
          onDrag={(_, info) => setDragX(info.point.x - trackRef.current!.getBoundingClientRect().left)}
          onDragEnd={(_, info) => {
            const x = info.point.x - trackRef.current!.getBoundingClientRect().left;
            const ratio = Math.max(0, Math.min(1, x / trackWidth));
            setDragX(null);
            if (safeDuration > 0) onSeek(ratio * safeDuration);
          }}
          animate={
            dragX !== null
              ? { x: dragX }
              : { x: progress * trackWidth }
          }
          transition={reduceMotion ? { duration: 0 } : springs.gentle}
          style={{ x: 0 }}
          className={cn(
            "bg-foreground absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full shadow-md active:cursor-grabbing",
            buffering && "animate-pulse",
          )}
        />
      ) : null}
    </div>
  );
}
