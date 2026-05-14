// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScanSummary } from "@/components/digest/scan-summary";
import { podcasts } from "@/config/podcasts";
import type { DigestCard, DigestSegment } from "@/lib/digest/load-cards";

function segment(id: string): DigestSegment {
  return {
    id,
    particleSegmentId: `psa-${id}`,
    startSeconds: 0,
    endSeconds: 60,
    audioUrl: null,
    speakerName: null,
    summary: null,
    pullQuotes: [],
    bullets: [],
    surfacingEntities: [],
  };
}

function card(
  id: string,
  segCount: number,
  opts: { durationSeconds?: number | null; momentSeconds?: number } = {},
): DigestCard {
  return {
    id,
    surfacedAt: "2026-05-14T12:00:00Z",
    totalRelevantSeconds: opts.momentSeconds ?? 60 * segCount,
    episodeSummary: null,
    episode: {
      id: `ep-${id}`,
      title: `Episode ${id}`,
      publishedAt: null,
      audioUrl: null,
      durationSeconds: opts.durationSeconds ?? null,
      podcast: { id: `pod-${id}`, name: `Podcast ${id}` },
    },
    segments: Array.from({ length: segCount }, (_, i) => segment(`${id}-${i}`)),
  };
}

describe("ScanSummary", () => {
  it("renders the catalog size, moment count, and episode count", () => {
    render(<ScanSummary cards={[card("a", 3), card("b", 5)]} />);
    expect(
      screen.getByText(
        new RegExp(`Scanned ${podcasts.length} podcasts.*8 moments.*2 episodes`),
      ),
    ).toBeDefined();
  });

  it("uses singular forms for one-moment, one-episode digests", () => {
    render(<ScanSummary cards={[card("a", 1)]} />);
    expect(screen.getByText(/1 moment from 1 episode\b/)).toBeDefined();
    expect(screen.queryByText(/moments|episodes/)).toBeNull();
  });

  it("renders nothing when there are zero moments (delegates to empty fallback)", () => {
    const { container } = render(<ScanSummary cards={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("adds a 'saving you ~X of listening' clause when at least one episode has a duration", () => {
    // ep A: 60min long, 5min relevant → 55min saved
    // ep B: 30min long, 5min relevant → 25min saved
    // Total saved = 80min = "1h 20m"
    render(
      <ScanSummary
        cards={[
          card("a", 1, { durationSeconds: 3600, momentSeconds: 300 }),
          card("b", 1, { durationSeconds: 1800, momentSeconds: 300 }),
        ]}
      />,
    );
    expect(screen.getByText(/saving you ~1h 20m of listening/)).toBeDefined();
  });

  it("omits the saving clause when no episode has a duration (backfill gap)", () => {
    render(<ScanSummary cards={[card("a", 3, { durationSeconds: null })]} />);
    expect(screen.queryByText(/saving you/)).toBeNull();
  });
});
