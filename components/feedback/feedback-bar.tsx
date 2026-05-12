"use client";

import { Filter, Heart, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { submitFeedback, submitNotRelevant } from "@/lib/feedback/optimistic";
import { cn } from "@/lib/utils";

/**
 * Three-button feedback bar at the foot of the expanded card sheet.
 *
 *   - Not relevant (X)        — hides the card (AE3) with a 5s Undo toast.
 *   - Not substantive (filter) — records signal; button fills.
 *   - Love this (heart)       — records signal; button fills.
 *
 * Icon-only by default with a screen-reader label; team accent on hover
 * keeps the surface restrained per the anti-AI-slop notes from U10
 * (no three equal-weight gradient buttons in a row).
 */

interface Props {
  cardId: string;
  /** Called by the parent to remove the card from the rendered grid
   *  on a "Not relevant" verdict (and to put it back if the user undoes). */
  onHide: (hidden: boolean) => void;
}

export function FeedbackBar({ cardId, onHide }: Props) {
  // Track recorded verdict so the icon stays filled after the user taps.
  // null = no verdict, "not_substantive" or "love" = recorded.
  const [recorded, setRecorded] = useState<"not_substantive" | "love" | null>(
    null,
  );

  async function handleRecord(verdict: "not_substantive" | "love") {
    setRecorded(verdict);
    const ok = await submitFeedback(cardId, verdict);
    if (!ok) {
      setRecorded(null);
      toast.error("Couldn't save feedback — try again.");
    }
  }

  return (
    <div
      data-slot="feedback-bar"
      className="border-border/60 mt-8 flex items-center gap-2 border-t pt-6"
    >
      <span className="text-muted-foreground mr-3 text-xs">Was this useful?</span>
      <FeedbackButton
        label="Not relevant"
        icon={<X aria-hidden className="size-4" />}
        onClick={() => void submitNotRelevant({ cardId, setHidden: onHide })}
      />
      <FeedbackButton
        label="Not substantive"
        icon={<Filter aria-hidden className="size-4" />}
        filled={recorded === "not_substantive"}
        onClick={() => void handleRecord("not_substantive")}
      />
      <FeedbackButton
        label="Love this"
        icon={<Heart aria-hidden className="size-4" />}
        filled={recorded === "love"}
        onClick={() => void handleRecord("love")}
      />
    </div>
  );
}

interface ButtonProps {
  label: string;
  icon: React.ReactNode;
  filled?: boolean;
  onClick: () => void;
}

function FeedbackButton({ label, icon, filled, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      data-slot="feedback-button"
      data-verdict={label}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground hover:text-team-accent hover:bg-card focus-visible:ring-team-accent/40 inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none",
        filled && "text-team-accent bg-card",
      )}
    >
      {icon}
    </button>
  );
}
