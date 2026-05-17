import { EpisodeCard } from "@/components/digest/episode-card";
import { NotableTakeCard } from "@/components/digest/notable-take-card";
import { ThemeCard } from "@/components/digest/theme-card";
import type { DigestFeedItem } from "@/lib/digest/types";

/**
 * Discriminated-union dispatcher. Picks the right card component per
 * card_type. Server component (no client interactivity at this level
 * — each individual card component is its own "use client" surface).
 *
 * Defensive fallback: an unknown card_type renders nothing rather
 * than crashing. Shouldn't happen given the TypeScript exhaustiveness
 * checks, but the cards table accepts strings and a future migration
 * could add a card_type the UI doesn't yet know about.
 */
export function CardRenderer({ item }: { item: DigestFeedItem }) {
  switch (item.card_type) {
    case "episode":
      return <EpisodeCard card={item} />;
    case "theme":
      return <ThemeCard card={item} />;
    case "notable_take":
      return <NotableTakeCard card={item} />;
    default: {
      // Exhaustive check at compile time. If a new variant is added
      // to DigestFeedItem without a renderer, TypeScript will flag
      // the `never` type mismatch here.
      const _exhaustive: never = item;
      void _exhaustive;
      return null;
    }
  }
}
