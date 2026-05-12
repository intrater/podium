"use client";

import { Loader2, Pause, Play } from "lucide-react";
import type { KeyboardEvent } from "react";

import {
  PlayerErrorSurface,
  PlayerStalledSurface,
} from "@/components/player/playback-states";
import { Scrubber } from "@/components/player/scrubber";
import { Transcript } from "@/components/player/transcript";
import { useAudioElement } from "@/lib/audio/use-audio-element";
import type { DigestSegment } from "@/lib/digest/load-cards";
import { cn } from "@/lib/utils";

/**
 * Top-level audio player.
 *
 * Renders a hidden <audio> element (the actual playback engine) plus the
 * custom chrome: a 56pt circular play button, the Motion-driven scrubber,
 * a duration readout, and the segment transcript with click-to-seek.
 * Hard errors and offline state get dedicated surfaces (see
 * `playback-states.tsx`).
 *
 * Keyboard model: the player region is one focusable element. Space
 * toggles play/pause. Arrow Left/Right seek ±5s. Home/End jump to
 * extremes. Avoiding multiple focusable controls keeps the focus story
 * simple on mobile and avoids fighting native <button> behavior.
 */

interface Props {
  src: string | null;
  segments: DigestSegment[];
  episodeTitle: string;
  /** Public episode URL for the "Open in podcast app" fallback. */
  episodeUrl?: string | null;
}

const SEEK_STEP_SECONDS = 5;

export function AudioPlayer({
  src,
  segments,
  episodeTitle,
  episodeUrl = null,
}: Props) {
  const { audioRef, state, controls } = useAudioElement();

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Skip if focus is in a child interactive control (e.g. a transcript
    // button). The transcript segments are buttons that handle their own
    // Enter/Space; we don't want to fight them at the player level.
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" && target !== e.currentTarget) return;
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (state.isPlaying) controls.pause();
      else void controls.play();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      controls.seekBy(-SEEK_STEP_SECONDS);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      controls.seekBy(SEEK_STEP_SECONDS);
    } else if (e.key === "Home") {
      e.preventDefault();
      controls.seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      controls.seek(state.duration);
    }
  }

  if (!src) {
    return (
      <div
        role="status"
        data-slot="player-no-source"
        className="bg-card text-muted-foreground rounded-xl p-4 text-sm"
      >
        Audio not available for this episode.
      </div>
    );
  }

  return (
    <section
      role="region"
      aria-label="Audio player"
      data-slot="audio-player"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-team-accent/40 flex flex-col gap-5 rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-slot="audio-element"
        className="sr-only"
      />
      {state.error ? (
        <PlayerErrorSurface
          episodeUrl={episodeUrl}
          episodeTitle={episodeTitle}
          onRetry={controls.reload}
        />
      ) : (
        <>
          {state.isStalled ? (
            <PlayerStalledSurface onRetry={controls.reload} />
          ) : null}
          <div className="flex items-center gap-4">
            <button
              type="button"
              data-slot="play-toggle"
              aria-label={state.isPlaying ? "Pause" : "Play"}
              disabled={state.isLoading}
              onClick={() => {
                if (state.isPlaying) controls.pause();
                else void controls.play();
              }}
              className={cn(
                "bg-team-accent text-team-accent-fg focus-visible:ring-team-accent/40 flex size-14 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:opacity-50",
              )}
            >
              {state.isLoading ? (
                <Loader2 aria-hidden className="size-5 animate-spin" />
              ) : state.isPlaying ? (
                <Pause aria-hidden className="size-5" />
              ) : (
                <Play aria-hidden className="size-5 translate-x-0.5" />
              )}
            </button>
            <div className="flex-1">
              <Scrubber
                currentTime={state.currentTime}
                duration={state.duration}
                onSeek={controls.seek}
                disabled={state.isLoading || state.duration === 0}
                buffering={state.isBuffering}
              />
              <div className="text-muted-foreground mt-2 flex justify-between font-mono text-xs tabular-nums">
                <span data-slot="current-time">
                  {formatClock(state.currentTime)}
                </span>
                <span data-slot="duration">
                  {state.duration > 0 ? formatClock(state.duration) : "—"}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
      <Transcript
        segments={segments}
        currentTime={state.currentTime}
        onSeek={controls.seek}
      />
    </section>
  );
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const sec = total % 60;
  return `${minutes}:${String(sec).padStart(2, "0")}`;
}
