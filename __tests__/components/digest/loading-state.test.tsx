// @vitest-environment jsdom

/**
 * Branches of DigestLoadingState: running skeleton, failed retry,
 * cost-aborted surface, and no_runs auto-trigger. The polling tick
 * itself is exercised via the initial status branches; fake timers and
 * fetch interception are out of scope here — the polling logic is best
 * verified live (which the plan calls out as the U11 verification step).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DigestLoadingState } from "@/components/digest/loading-state";

describe("DigestLoadingState", () => {
  it("running: renders the 'Preparing your first digest' status + skeleton", () => {
    render(
      <DigestLoadingState
        initialStatus="running"
        onRetry={async () => {}}
      />,
    );
    expect(screen.getByText(/Preparing your first digest/)).toBeDefined();
  });

  it("failed: renders the retry surface and invokes onRetry on click", () => {
    const onRetry = vi.fn(async () => {});
    render(
      <DigestLoadingState
        initialStatus="failed"
        initialNotes="pipeline blew up"
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByText(/Something went wrong with your first run\./),
    ).toBeDefined();
    expect(screen.getByText(/pipeline blew up/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("cost_aborted: surfaces the budget message and the alert notes", () => {
    render(
      <DigestLoadingState
        initialStatus="cost_aborted"
        initialNotes="estimate $5.40 exceeded 60% of remaining"
        initialCostUsd={5.4}
        onRetry={async () => {}}
      />,
    );
    expect(screen.getByText(/Daily budget threshold reached\./)).toBeDefined();
    expect(screen.getByText(/Estimated next run: \$5\.40/)).toBeDefined();
    expect(
      screen.getByText(/estimate \$5\.40 exceeded 60% of remaining/),
    ).toBeDefined();
  });

  it("no_runs: auto-invokes onRetry once on mount (Q8 first-run seed)", () => {
    const onRetry = vi.fn(async () => {});
    render(
      <DigestLoadingState
        initialStatus="no_runs"
        onRetry={onRetry}
      />,
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    // After auto-trigger the surface is the running skeleton.
    expect(screen.getByText(/Preparing your first digest/)).toBeDefined();
  });
});
