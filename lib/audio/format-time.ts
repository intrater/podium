/**
 * MM:SS clock formatter for audio player surfaces.
 *
 * Extracted from `components/player/audio-player.tsx` and
 * `components/player/transcript.tsx`, both of which carried identical
 * 4-line implementations. Co-located with the audio hook so the player
 * domain owns its own time-formatting.
 */

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const sec = total % 60;
  return `${minutes}:${String(sec).padStart(2, "0")}`;
}
