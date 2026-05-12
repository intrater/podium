// @vitest-environment jsdom

/**
 * useAudioElement hook tests.
 *
 * The event-driven state transitions (play, pause, loadedmetadata, etc.)
 * are exercised end-to-end in the AudioPlayer component test, which
 * mounts a real <audio ref={audioRef}>. Here we cover the parts that
 * stand alone:
 *
 *   - Initial state shape
 *   - Controls are safe to call when the ref hasn't bound yet
 *   - Cleanup runs without throwing on unmount + remount
 *   - seek/seekBy clamp to [0, duration] when the ref is bound
 *   - play() swallows the autoplay-rejected promise gracefully
 */

import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";

import { useAudioElement } from "@/lib/audio/use-audio-element";

describe("useAudioElement", () => {
  it("returns initial state with isLoading=true and zero clock values", () => {
    const { result } = renderHook(() => useAudioElement());
    expect(result.current.state).toMatchObject({
      isPlaying: false,
      isBuffering: false,
      isLoading: true,
      currentTime: 0,
      duration: 0,
      error: null,
      isStalled: false,
    });
  });

  it("controls are no-ops when the ref isn't bound yet", async () => {
    const { result } = renderHook(() => useAudioElement());
    await act(async () => {
      await result.current.controls.play();
      result.current.controls.pause();
      result.current.controls.seek(10);
      result.current.controls.seekBy(5);
      result.current.controls.reload();
    });
    expect(result.current.state.error).toBeNull();
  });

  it("cleanup runs without throwing on unmount + remount", () => {
    const { unmount } = renderHook(() => useAudioElement());
    expect(() => unmount()).not.toThrow();
    const remount = renderHook(() => useAudioElement());
    expect(remount.result.current.state.isLoading).toBe(true);
  });

  it("seek/seekBy clamp to [0, duration] when the ref is bound", () => {
    const audio = document.createElement("audio");
    Object.defineProperty(audio, "duration", { value: 100, configurable: true });
    Object.defineProperty(audio, "currentTime", {
      value: 0,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useAudioElement());
    (result.current.audioRef as RefObject<HTMLAudioElement | null>).current = audio;

    act(() => result.current.controls.seek(50));
    expect(audio.currentTime).toBe(50);

    act(() => result.current.controls.seek(-10));
    expect(audio.currentTime).toBe(0);

    act(() => result.current.controls.seek(9999));
    expect(audio.currentTime).toBe(100);

    act(() => result.current.controls.seekBy(-5));
    expect(audio.currentTime).toBe(95);
  });

  it("play() swallows autoplay-rejected promises", async () => {
    const audio = document.createElement("audio");
    const playFn = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
    Object.defineProperty(audio, "play", { value: playFn });
    const { result } = renderHook(() => useAudioElement());
    (result.current.audioRef as RefObject<HTMLAudioElement | null>).current = audio;
    await act(async () => {
      await result.current.controls.play();
    });
    expect(playFn).toHaveBeenCalledTimes(1);
    expect(result.current.state.error).toBeNull();
  });
});
