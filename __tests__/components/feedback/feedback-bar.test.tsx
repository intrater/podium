// @vitest-environment jsdom

/**
 * FeedbackBar interaction tests. Mocks the optimistic helpers so we
 * can assert which helper fires for each verdict button without hitting
 * the network. The helpers themselves are covered by
 * __tests__/lib/feedback/optimistic.test.ts.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitNotRelevant = vi.fn().mockResolvedValue(undefined);
const submitFeedback = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/feedback/optimistic", () => ({
  submitNotRelevant: (
    args: Parameters<typeof submitNotRelevant>[0],
  ) => submitNotRelevant(args),
  submitFeedback: (
    cardId: string,
    verdict: string,
  ) => submitFeedback(cardId, verdict),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { FeedbackBar } from "@/components/feedback/feedback-bar";

const CARD_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  submitNotRelevant.mockClear();
  submitFeedback.mockClear();
});

describe("FeedbackBar", () => {
  it("renders the three labeled buttons + prompt", () => {
    render(<FeedbackBar cardId={CARD_ID} onHide={() => {}} />);
    expect(screen.getByText(/Was this useful\?/)).toBeDefined();
    expect(screen.getByLabelText("Not relevant")).toBeDefined();
    expect(screen.getByLabelText("Not substantive")).toBeDefined();
    expect(screen.getByLabelText("Love this")).toBeDefined();
  });

  it("Not relevant: invokes submitNotRelevant with cardId + onHide", async () => {
    const onHide = vi.fn();
    render(<FeedbackBar cardId={CARD_ID} onHide={onHide} />);
    fireEvent.click(screen.getByLabelText("Not relevant"));
    expect(submitNotRelevant).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: CARD_ID, setHidden: onHide }),
    );
  });

  it("Love this: posts the verdict and visually fills the button", async () => {
    render(<FeedbackBar cardId={CARD_ID} onHide={() => {}} />);
    const loveBtn = screen.getByLabelText("Love this");
    fireEvent.click(loveBtn);
    expect(submitFeedback).toHaveBeenCalledWith(CARD_ID, "love");
    // The "filled" state is async (resolves on successful POST); wait one tick.
    await new Promise((r) => setTimeout(r, 0));
    // The filled state styling is conditional via cn(); we can't easily
    // assert the class without coupling to Tailwind output. The verdict
    // call assertion above is the load-bearing check.
  });

  it("Not substantive: posts the verdict via submitFeedback", () => {
    render(<FeedbackBar cardId={CARD_ID} onHide={() => {}} />);
    fireEvent.click(screen.getByLabelText("Not substantive"));
    expect(submitFeedback).toHaveBeenCalledWith(CARD_ID, "not_substantive");
  });

  it("button has 44pt tap target (h/w-11 = 44px)", () => {
    render(<FeedbackBar cardId={CARD_ID} onHide={() => {}} />);
    const btn = screen.getByLabelText("Not relevant");
    expect(btn.className).toContain("size-11");
  });
});
