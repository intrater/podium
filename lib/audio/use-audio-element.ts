"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wrap an HTMLAudioElement with React state. The hook owns the ref,
 * attaches the lifecycle event listeners we care about (play/pause/
 * loadedmetadata/timeupdate/waiting/playing/error/stalled), and returns
 * imperative controls plus a snapshot of the player's state.
 *
 * Consumers render the audio element with the returned `ref` and reach
 * for `controls.play`/`pause`/`seek` rather than touching the element
 * directly. State and controls are stable across re-renders.
 */

export interface AudioState {
  /** Element has reported `play` and has not yet reported `pause`. */
  isPlaying: boolean;
  /** Element fired `waiting` and hasn't fired `playing` since. */
  isBuffering: boolean;
  /** readyState < HAVE_CURRENT_DATA — metadata hasn't loaded yet. */
  isLoading: boolean;
  /** Current playback position, in seconds. */
  currentTime: number;
  /** Audio duration, in seconds. Zero before `loadedmetadata`. */
  duration: number;
  /** Most recent MediaError, or null. */
  error: MediaError | null;
  /** True when `stalled` has fired and the network is offline. */
  isStalled: boolean;
}

export interface AudioControls {
  play(): Promise<void>;
  pause(): void;
  /** Set currentTime, clamped to [0, duration]. */
  seek(seconds: number): void;
  /** Seek by a relative offset (±seconds). */
  seekBy(deltaSeconds: number): void;
  /** Reload the element after an error. */
  reload(): void;
}

export interface UseAudioElementResult {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  state: AudioState;
  controls: AudioControls;
}

export function useAudioElement(): UseAudioElementResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>({
    isPlaying: false,
    isBuffering: false,
    isLoading: true,
    currentTime: 0,
    duration: 0,
    error: null,
    isStalled: false,
  });

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setState((s) => ({ ...s, isPlaying: true, isBuffering: false }));
    const onPause = () => setState((s) => ({ ...s, isPlaying: false }));
    const onTimeUpdate = () =>
      setState((s) => ({ ...s, currentTime: el.currentTime }));
    const onLoadedMetadata = () =>
      setState((s) => ({
        ...s,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        isLoading: false,
      }));
    const onWaiting = () => setState((s) => ({ ...s, isBuffering: true }));
    const onPlaying = () =>
      setState((s) => ({ ...s, isBuffering: false, isStalled: false }));
    const onError = () =>
      setState((s) => ({ ...s, error: el.error, isLoading: false, isPlaying: false }));
    const onStalled = () =>
      setState((s) => ({
        ...s,
        isStalled: typeof navigator !== "undefined" && !navigator.onLine,
      }));
    const onCanPlay = () => setState((s) => ({ ...s, isLoading: false }));

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("error", onError);
    el.addEventListener("stalled", onStalled);
    el.addEventListener("canplay", onCanPlay);

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("error", onError);
      el.removeEventListener("stalled", onStalled);
      el.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  const play = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      await el.play();
    } catch {
      // Autoplay rejected — leave state alone; the user can retry.
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(seconds, el.duration || Infinity));
    el.currentTime = clamped;
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    seek(el.currentTime + deltaSeconds);
  }, [seek]);

  const reload = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    setState((s) => ({ ...s, error: null, isLoading: true }));
    el.load();
  }, []);

  return {
    audioRef,
    state,
    controls: { play, pause, seek, seekBy, reload },
  };
}
