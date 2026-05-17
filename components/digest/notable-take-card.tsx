"use client";

import { ChevronRight, Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { FeedbackBar } from "@/components/feedback/feedback-bar";
import { AudioPlayer } from "@/components/player/audio-player";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { DigestNotableTakeCard } from "@/lib/digest/types";

/**
 * Notable-take card surface — a single Tier-A voice's substantive
 * solo take. The voice attribution is the dominant identity (you're
 * opening this card *because* of who said it), with the verbatim
 * quote front-and-center on the closed card.
 *
 * Tap → Sheet with the full framing, why_it_matters, and audio
 * playback from the source episode segment.
 */
export function NotableTakeCard({ card }: { card: DigestNotableTakeCard }) {
  const [hidden, setHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleHide(next: boolean) {
    setHidden(next);
    if (next) setSheetOpen(false);
  }

  return (
    <AnimatePresence initial={false}>
      {hidden ? null : (
        <motion.div
          key={card.id}
          layout
          initial={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <article
                aria-label={card.body.title}
                className="bg-card hover:bg-card/90 focus-within:ring-team-accent/40 group flex w-full cursor-pointer flex-col gap-2.5 rounded-xl p-4 text-left transition-colors focus-within:ring-2 focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <span className="text-team-accent inline-flex items-center gap-1.5 text-xs font-medium">
                    <Mic aria-hidden className="size-3" />
                    {card.voiceDisplayName}
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="text-muted-foreground/70 ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </div>
                <h2 className="text-foreground line-clamp-2 text-base font-semibold leading-snug">
                  {card.body.title}
                </h2>
                {card.body.quote ? (
                  <p className="text-foreground/90 line-clamp-3 text-sm italic leading-relaxed">
                    &ldquo;{card.body.quote}&rdquo;
                  </p>
                ) : (
                  <p className="text-foreground/80 line-clamp-3 text-sm leading-relaxed">
                    {card.body.framing}
                  </p>
                )}
              </article>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="bg-background h-[92vh] overflow-y-auto rounded-t-2xl border-0 p-0 sm:max-w-2xl sm:mx-auto"
            >
              <SheetHeader className="bg-background sticky top-0 z-10 border-b border-border/60 px-6 py-4 backdrop-blur">
                <SheetTitle className="text-foreground text-base leading-snug">
                  {card.body.title}
                </SheetTitle>
                <SheetDescription className="text-muted-foreground text-xs">
                  {card.voiceDisplayName} · {card.episode.title}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-6 py-6">
                <p className="text-foreground/90 text-sm leading-relaxed">
                  {card.body.framing}
                </p>
                {card.body.quote ? (
                  <blockquote className="border-team-accent/40 bg-team-accent/5 rounded-lg border-l-2 px-4 py-3 text-sm italic leading-relaxed">
                    &ldquo;{card.body.quote}&rdquo;
                  </blockquote>
                ) : null}
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                    Why it matters
                  </p>
                  <p className="text-foreground/90 text-sm leading-relaxed">
                    {card.body.why_it_matters}
                  </p>
                </div>
                {card.episode.audioUrl ? (
                  <AudioPlayer
                    src={card.episode.audioUrl}
                    segments={[]}
                    episodeTitle={card.episode.title}
                    episodeUrl={card.episode.audioUrl}
                  />
                ) : null}
                <FeedbackBar cardId={card.id} onHide={handleHide} />
              </div>
            </SheetContent>
          </Sheet>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
