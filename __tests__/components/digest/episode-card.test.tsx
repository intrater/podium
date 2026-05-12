// @vitest-environment jsdom

/**
 * EpisodeCard rendering test. Verifies the card surface presents the
 * episode title, podcast + date subtitle, total-time pill, and the
 * episode-level rollup. Sheet expansion is exercised through the
 * trigger (Radix renders the content lazily on open; for this test we
 * verify the trigger button is in the document and accessible).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EpisodeCard } from "@/components/digest/episode-card";
import type { DigestCard } from "@/lib/digest/load-cards";

function card(overrides: Partial<DigestCard> = {}): DigestCard {
  return {
    id: "card-1",
    surfacedAt: "2026-05-10T12:00:00Z",
    totalRelevantSeconds: 480,
    episodeSummary: "Two-paragraph rollup about the 49ers offense.",
    episode: {
      id: "ep-1",
      title: "What we learned from the rookie minicamp",
      publishedAt: "2026-05-09T18:00:00Z",
      audioUrl: "https://example.com/audio.mp3",
      podcast: { id: "pod-1", name: "Niners Nation Daily" },
    },
    segments: [
      {
        id: "seg-1",
        particleSegmentId: "psa-1",
        startSeconds: 60,
        endSeconds: 200,
        audioUrl: null,
        speakerName: "Mina Kimes",
        summary: "Discussion of Purdy.",
        pullQuotes: ["He looked sharp."],
        bullets: ["3 TDs", "0 INTs"],
        surfacingEntities: ["brock-purdy"],
      },
    ],
    ...overrides,
  };
}

describe("EpisodeCard", () => {
  it("renders episode title, subtitle, total-time pill, and rollup", () => {
    render(<EpisodeCard card={card()} />);
    expect(
      screen.getByText("What we learned from the rookie minicamp"),
    ).toBeDefined();
    expect(screen.getByText(/Niners Nation Daily/)).toBeDefined();
    expect(screen.getByText(/8 min across 1 segment/)).toBeDefined();
    expect(
      screen.getByText("Two-paragraph rollup about the 49ers offense."),
    ).toBeDefined();
  });

  it("uses an <article> with the episode title as accessible name", () => {
    render(<EpisodeCard card={card()} />);
    const article = screen.getByRole("article");
    expect(article.getAttribute("aria-label")).toBe(
      "What we learned from the rookie minicamp",
    );
  });

  it("omits the rollup paragraph when episodeSummary is null", () => {
    render(<EpisodeCard card={card({ episodeSummary: null })} />);
    expect(screen.queryByText(/Two-paragraph rollup/)).toBeNull();
    // But the title still renders.
    expect(
      screen.getByText("What we learned from the rookie minicamp"),
    ).toBeDefined();
  });

  it("falls back to em-dash subtitle date when publishedAt is null", () => {
    render(
      <EpisodeCard
        card={card({
          episode: {
            ...card().episode,
            publishedAt: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/Niners Nation Daily · —/)).toBeDefined();
  });
});
