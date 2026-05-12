"use client";

import { AlertTriangle, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error and stalled-network surfaces for the player.
 *
 * Loading and buffering live inside the player chrome (the play button
 * shows a spinner, the scrubber thumb pulses), so they don't need
 * dedicated surfaces. Hard errors and offline states do — they kick
 * the user out of the listening flow and deserve a clear message and
 * the right recovery affordance.
 */

interface ErrorSurfaceProps {
  /** Deep-link to the original podcast source so the user can listen
   *  elsewhere when our audio can't load. Falls back to episode title. */
  episodeUrl: string | null;
  episodeTitle: string;
  onRetry: () => void;
}

export function PlayerErrorSurface({
  episodeUrl,
  episodeTitle,
  onRetry,
}: ErrorSurfaceProps) {
  return (
    <div
      role="alert"
      data-slot="player-error"
      className="bg-card flex flex-col gap-3 rounded-xl p-4"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle aria-hidden className="text-destructive size-4" />
        <span className="text-foreground text-sm font-semibold">
          Audio unavailable
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        We couldn&apos;t play this clip. Try again, or listen in your podcast app.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
        {episodeUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={episodeUrl} target="_blank" rel="noreferrer">
              Open in podcast app
            </a>
          </Button>
        ) : (
          <span className="text-muted-foreground self-center text-xs">
            ({episodeTitle})
          </span>
        )}
      </div>
    </div>
  );
}

export function PlayerStalledSurface({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      data-slot="player-stalled"
      className="bg-card flex items-center gap-3 rounded-xl p-3"
    >
      <WifiOff aria-hidden className="text-muted-foreground size-4" />
      <span className="text-foreground flex-1 text-sm">Reconnecting…</span>
      <Button size="xs" variant="ghost" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
