/**
 * Discriminated union for the v2 home-page feed.
 *
 * Each card_type carries the shape its renderer needs without
 * re-querying. The episode variant preserves the existing v1
 * DigestCard so the episode-card component keeps working unchanged.
 *
 * Card-type field matches the `cards.card_type` column added in
 * migration 0021.
 */

import type { DigestCard } from "./load-cards";

/** Per-voice contribution inside a theme card. */
export interface DigestThemeCardVoiceContribution {
  voice_id: string;
  voice_display_name: string;
  framing: string;
  /** Verbatim from the source moment; null when the writer's quote
   *  failed verbatim validation. */
  quote: string | null;
}

/** Theme card body — what the U7 writer produced. */
export interface DigestThemeCardBody {
  title: string;
  lede: string;
  voice_contributions: readonly DigestThemeCardVoiceContribution[];
  delta_copy: string | null;
}

export interface DigestThemeCard {
  card_type: "theme";
  id: string;
  surfacedAt: string;
  cardTitle: string;
  body: DigestThemeCardBody;
  /** Joined from `themes`. */
  themeId: string;
  themeSignature: string;
  themeLabel: string;
  newsEcho: boolean;
  surfacingEntities: readonly string[];
  memberSegmentIds: readonly string[];
  /** Distinct voice attribution for the "N podcasts" badge. */
  memberVoiceIds: readonly string[];
}

/** Notable-take card body — what the U7 writer produced. */
export interface DigestNotableTakeCardBody {
  title: string;
  framing: string;
  quote: string | null;
  why_it_matters: string;
}

export interface DigestNotableTakeCard {
  card_type: "notable_take";
  id: string;
  surfacedAt: string;
  cardTitle: string;
  body: DigestNotableTakeCardBody;
  /** Joined from `voices`. */
  voiceId: string;
  voiceDisplayName: string;
  /** Source episode the take came from — drives audio playback. */
  episode: {
    id: string;
    title: string;
    publishedAt: string | null;
    audioUrl: string | null;
    podcast: { id: string; name: string; imageUrl: string | null };
  };
}

/** Episode card retains the v1 shape — DigestCard from load-cards.ts. */
export interface DigestEpisodeCard extends DigestCard {
  card_type: "episode";
}

/**
 * The unified feed item. UI dispatches on `card_type` to pick a
 * renderer.
 */
export type DigestFeedItem =
  | DigestEpisodeCard
  | DigestThemeCard
  | DigestNotableTakeCard;

/**
 * Extract a date key for grouping a feed item under a day section.
 *
 * - Episode cards group by their episode's `publishedAt` (matches v1).
 * - Notable-take cards also group by source episode's `publishedAt`
 *   (the take is anchored to a specific episode).
 * - Theme cards group by `surfacedAt` — themes span multiple episodes
 *   so there's no single published_at; "today's conversation" is the
 *   meaningful timestamp.
 */
export function feedItemDateIso(item: DigestFeedItem): string | null {
  if (item.card_type === "episode") return item.episode.publishedAt;
  if (item.card_type === "notable_take") return item.episode.publishedAt;
  return item.surfacedAt;
}
