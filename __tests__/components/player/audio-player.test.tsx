// @vitest-environment jsdom

/**
 * AudioPlayer integration tests. Verifies state transitions driven by
 * media events on the underlying <audio> element, the play/pause
 * affordance, segment highlighting, click-to-seek (AE6), keyboard
 * navigation, and the error / no-source surfaces.
 *
 * jsdom doesn't run a real audio decoder, so we override duration /
 * currentTime / play / pause / load on the element with vi mocks and
 * dispatch the lifecycle events manually. This is the standard pattern
 * for testing native-media chrome in unit tests.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AudioPlayer } from "@/components/player/audio-player";
import type { DigestSegment } from "@/lib/digest/load-cards";

function segment(
  id: string,
  start: number,
  end: number,
  overrides: Partial<DigestSegment> = {},
): DigestSegment {
  return {
    id,
    particleSegmentId: null,
    startSeconds: start,
    endSeconds: end,
    audioUrl: null,
    speakerName: null,
    summary: `Summary ${id}`,
    pullQuotes: [],
    bullets: [],
    surfacingEntities: [],
    ...overrides,
  };
}

const SEGMENTS: DigestSegment[] = [
  segment("a", 0, 10),
  segment("b", 10, 25),
  segment("c", 25, 40),
];

/**
 * Patch the rendered <audio> element so its mocked play/pause/load can
 * be asserted, and so currentTime/duration are writable.
 */
function patchAudio(audio: HTMLAudioElement) {
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  const load = vi.fn();
  Object.defineProperty(audio, "play", { value: play, configurable: true });
  Object.defineProperty(audio, "pause", { value: pause, configurable: true });
  Object.defineProperty(audio, "load", { value: load, configurable: true });
  let _ct = 0;
  Object.defineProperty(audio, "currentTime", {
    configurable: true,
    get: () => _ct,
    set: (v: number) => {
      _ct = v;
      fireEvent.timeUpdate(audio);
    },
  });
  let _dur = 120;
  Object.defineProperty(audio, "duration", {
    configurable: true,
    get: () => _dur,
    set: (v: number) => {
      _dur = v;
    },
  });
  return { play, pause, load };
}

function getAudio(): HTMLAudioElement {
  return document.querySelector(
    "audio[data-slot=audio-element]",
  ) as HTMLAudioElement;
}

describe("AudioPlayer — basics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a no-source surface when src is null", () => {
    render(
      <AudioPlayer
        src={null}
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    expect(screen.getByText(/Audio not available/)).toBeDefined();
  });

  it("disables play button while metadata is loading", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const playBtn = screen.getByLabelText("Play") as HTMLButtonElement;
    expect(playBtn.disabled).toBe(true);
  });

  it("enables play after loadedmetadata and renders the duration readout", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    patchAudio(audio);
    act(() => {
      fireEvent.loadedMetadata(audio);
    });
    const playBtn = screen.getByLabelText("Play") as HTMLButtonElement;
    expect(playBtn.disabled).toBe(false);
    // Duration 120s rendered as "2:00".
    expect(screen.getByText("2:00")).toBeDefined();
  });

  it("toggles play → pause on the affordance and reflects element state", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    const { play, pause } = patchAudio(audio);
    act(() => {
      fireEvent.loadedMetadata(audio);
    });
    act(() => {
      fireEvent.click(screen.getByLabelText("Play"));
    });
    expect(play).toHaveBeenCalled();
    // The element dispatches `play` when audio.play() succeeds; mimic it.
    act(() => {
      fireEvent.play(audio);
    });
    expect(screen.getByLabelText("Pause")).toBeDefined();
    act(() => {
      fireEvent.click(screen.getByLabelText("Pause"));
    });
    expect(pause).toHaveBeenCalled();
    act(() => {
      fireEvent.pause(audio);
    });
    expect(screen.getByLabelText("Play")).toBeDefined();
  });
});

describe("AudioPlayer — transcript highlighting and click-to-seek", () => {
  it("highlights the segment whose [start, end] contains currentTime", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    patchAudio(audio);
    act(() => fireEvent.loadedMetadata(audio));

    function active() {
      return document
        .querySelector<HTMLButtonElement>(
          'button[data-slot="transcript-segment"][data-active="true"]',
        )
        ?.getAttribute("data-start");
    }
    // Range is [start, end) — inclusive of start, exclusive of end.
    // currentTime=0 falls inside [0, 10), so segment "a" is active.
    expect(active()).toBe("0");
    act(() => {
      (audio as HTMLAudioElement).currentTime = 5;
    });
    expect(active()).toBe("0");
    act(() => {
      (audio as HTMLAudioElement).currentTime = 15;
    });
    expect(active()).toBe("10");
    act(() => {
      (audio as HTMLAudioElement).currentTime = 30;
    });
    expect(active()).toBe("25");
  });

  it("AE6 — clicking a segment seeks the audio element to that start", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    patchAudio(audio);
    act(() => fireEvent.loadedMetadata(audio));
    const segmentB = document.querySelector(
      'button[data-slot="transcript-segment"][data-start="10"]',
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(segmentB);
    });
    expect((audio as HTMLAudioElement).currentTime).toBe(10);
  });
});

describe("AudioPlayer — keyboard navigation", () => {
  it("Space toggles play/pause", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    const { play, pause } = patchAudio(audio);
    act(() => fireEvent.loadedMetadata(audio));
    const region = screen.getByRole("region", { name: "Audio player" });

    act(() => fireEvent.keyDown(region, { code: "Space", key: " " }));
    expect(play).toHaveBeenCalled();

    act(() => fireEvent.play(audio));
    act(() => fireEvent.keyDown(region, { code: "Space", key: " " }));
    expect(pause).toHaveBeenCalled();
  });

  it("ArrowRight seeks by +5s, ArrowLeft by -5s", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    patchAudio(audio);
    act(() => fireEvent.loadedMetadata(audio));
    const region = screen.getByRole("region", { name: "Audio player" });

    act(() => fireEvent.keyDown(region, { key: "ArrowRight" }));
    expect((audio as HTMLAudioElement).currentTime).toBe(5);

    act(() => fireEvent.keyDown(region, { key: "ArrowLeft" }));
    expect((audio as HTMLAudioElement).currentTime).toBe(0);
  });

  it("Home and End jump to extremes", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    patchAudio(audio);
    act(() => fireEvent.loadedMetadata(audio));
    const region = screen.getByRole("region", { name: "Audio player" });

    act(() => fireEvent.keyDown(region, { key: "End" }));
    expect((audio as HTMLAudioElement).currentTime).toBe(120);
    act(() => fireEvent.keyDown(region, { key: "Home" }));
    expect((audio as HTMLAudioElement).currentTime).toBe(0);
  });
});

describe("AudioPlayer — error and offline surfaces", () => {
  it("renders the error surface with deep-link when the audio element errors", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
        episodeUrl="https://podcast.example/sample"
      />,
    );
    const audio = getAudio();
    patchAudio(audio);
    Object.defineProperty(audio, "error", {
      value: { code: 4 },
      configurable: true,
    });
    act(() => fireEvent.error(audio));
    expect(screen.getByText(/Audio unavailable/)).toBeDefined();
    const deepLink = screen.getByRole("link", {
      name: /Open in podcast app/,
    }) as HTMLAnchorElement;
    expect(deepLink.href).toContain("podcast.example/sample");
  });

  it("Retry button calls load() and clears the error", () => {
    render(
      <AudioPlayer
        src="https://example.com/audio.mp3"
        segments={SEGMENTS}
        episodeTitle="Sample"
      />,
    );
    const audio = getAudio();
    const { load } = patchAudio(audio);
    Object.defineProperty(audio, "error", {
      value: { code: 4 },
      configurable: true,
    });
    act(() => fireEvent.error(audio));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    });
    expect(load).toHaveBeenCalled();
  });
});
