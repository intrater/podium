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

function card(id: string, segCount: number): DigestCard {
  return {
    id,
    surfacedAt: "2026-05-14T12:00:00Z",
    totalRelevantSeconds: 60 * segCount,
    episodeSummary: null,
    episode: {
      id: `ep-${id}`,
      title: `Episode ${id}`,
      publishedAt: null,
      audioUrl: null,
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
});
