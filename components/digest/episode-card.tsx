"use client";

import { ChevronRight, Clock } from "lucide-react";
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
import {
  type DigestCard,
  formatPublishedAt,
  formatTotalTime,
} from "@/lib/digest/load-cards";

/**
 * Card-per-episode surface. Tapping anywhere on the card opens a Sheet
 * with the episode-level rollup, audio player, and feedback bar.
 *
 * Local `hidden` state drives the "Not relevant" optimistic UX — the
 * feedback bar flips this on, the card animates out via Motion's
 * AnimatePresence, and the Undo path (handled in the toast) flips it
 * back. A page refresh re-evaluates the AE3 filter in load-cards.ts;
 * if the feedback row persisted, the card stays gone.
 */
export function EpisodeCard({ card }: { card: DigestCard }) {
  const [hidden, setHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const subtitle = `${card.episode.podcast.name} · ${formatPublishedAt(card.episode.publishedAt)}`;

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
                aria-label={card.episode.title}
                className="bg-card hover:bg-card/90 focus-within:ring-team-accent/40 group flex w-full cursor-pointer items-start gap-4 rounded-xl p-4 text-left transition-colors focus-within:ring-2 focus:outline-none"
              >
                <div
                  aria-hidden
                  className="bg-popover relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                >
                  {card.episode.podcast.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.episode.podcast.imageUrl}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="font-sans text-3xl font-semibold text-muted-foreground">
                      {card.episode.podcast.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2 className="text-foreground line-clamp-2 text-base font-semibold leading-snug">
                    {card.episode.title}
                  </h2>
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    {subtitle}
                  </p>
                  <p className="text-team-accent inline-flex items-center gap-1.5 text-xs font-medium">
                    <Clock aria-hidden className="size-3" />
                    {formatTotalTime(card)}
                  </p>
                  {card.episodeSummary ? (
                    <p className="text-foreground/80 mt-1 line-clamp-3 text-sm leading-relaxed">
                      {card.episodeSummary}
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  aria-hidden
                  className="text-muted-foreground/70 mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                />
              </article>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="bg-background h-[92vh] overflow-y-auto rounded-t-2xl border-0 p-0 sm:max-w-2xl sm:mx-auto"
            >
              <SheetHeader className="bg-background sticky top-0 z-10 border-b border-border/60 px-6 py-4 backdrop-blur">
                <SheetTitle className="text-foreground text-base leading-snug">
                  {card.episode.title}
                </SheetTitle>
                <SheetDescription className="text-muted-foreground text-xs">
                  {subtitle} · {formatTotalTime(card)}
                </SheetDescription>
              </SheetHeader>
              <div className="px-6 py-6">
                {card.episodeSummary ? (
                  <p className="text-foreground/90 mb-8 text-sm leading-relaxed">
                    {card.episodeSummary}
                  </p>
                ) : null}
                <AudioPlayer
                  src={card.episode.audioUrl}
                  segments={card.segments}
                  episodeTitle={card.episode.title}
                  episodeUrl={card.episode.audioUrl}
                />
                <FeedbackBar cardId={card.id} onHide={handleHide} />
              </div>
            </SheetContent>
          </Sheet>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
