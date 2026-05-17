"use client";

import { ChevronRight, Newspaper, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { FeedbackBar } from "@/components/feedback/feedback-bar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { DigestThemeCard } from "@/lib/digest/types";

/**
 * Theme card surface — a cross-source aggregation card. The hierarchy
 * is:
 *
 *   - Topic header (title), small "N podcasts" badge alongside.
 *   - Lede sentence (analytical framing in fan voice).
 *   - Optional delta_copy chip ("Mina just flipped the Purdy take")
 *     when the novelty gate fired a position_shift.
 *   - Optional "news echo" tag when the cluster looked manufactured.
 *
 * Tap → Sheet with the per-voice contributions (each voice's framing
 * + verbatim quote). Audio is not played from theme cards in v1 —
 * member moments span multiple episodes, and the visual treatment of
 * a multi-source player needs more design work than this unit scope.
 * Per-voice contributions link out to the source segment if needed
 * (future enhancement).
 */
export function ThemeCard({ card }: { card: DigestThemeCard }) {
  const [hidden, setHidden] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleHide(next: boolean) {
    setHidden(next);
    if (next) setSheetOpen(false);
  }

  const podcastCount = card.memberVoiceIds.length;
  const podcastLabel = `${podcastCount} podcast${podcastCount === 1 ? "" : "s"}`;

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
                    <Users aria-hidden className="size-3" />
                    {podcastLabel}
                  </span>
                  {card.newsEcho ? (
                    <span className="text-muted-foreground bg-muted/40 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      <Newspaper aria-hidden className="size-2.5" />
                      News echo
                    </span>
                  ) : null}
                  <ChevronRight
                    aria-hidden
                    className="text-muted-foreground/70 ml-auto size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </div>
                <h2 className="text-foreground line-clamp-2 text-base font-semibold leading-snug">
                  {card.body.title}
                </h2>
                <p className="text-foreground/80 line-clamp-3 text-sm leading-relaxed">
                  {card.body.lede}
                </p>
                {card.body.delta_copy ? (
                  <p className="text-team-accent line-clamp-2 text-xs italic">
                    {card.body.delta_copy}
                  </p>
                ) : null}
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
                  {podcastLabel} · {card.themeLabel}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-6 px-6 py-6">
                <p className="text-foreground/90 text-sm leading-relaxed">
                  {card.body.lede}
                </p>
                {card.body.delta_copy ? (
                  <p className="border-team-accent/40 bg-team-accent/5 rounded-lg border-l-2 px-3 py-2 text-sm italic">
                    {card.body.delta_copy}
                  </p>
                ) : null}
                {card.body.voice_contributions.length > 0 ? (
                  <ul className="flex flex-col gap-5">
                    {card.body.voice_contributions.map((vc) => (
                      <li
                        key={vc.voice_id}
                        className="flex flex-col gap-2 border-l-2 border-border/40 pl-4"
                      >
                        <p className="text-foreground text-sm font-semibold">
                          {vc.voice_display_name}
                        </p>
                        <p className="text-foreground/80 text-sm leading-relaxed">
                          {vc.framing}
                        </p>
                        {vc.quote ? (
                          <p className="text-foreground/90 text-sm italic leading-relaxed">
                            &ldquo;{vc.quote}&rdquo;
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
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
