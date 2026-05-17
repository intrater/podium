import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "../env";

import { loadDigestCards } from "./load-cards";
import { loadDigestNotableTakes } from "./load-notable-takes";
import { loadDigestThemes } from "./load-themes";
import type { DigestFeedItem } from "./types";

/**
 * Build the unified home-page feed.
 *
 * v1 mode (NEXT_PUBLIC_PODIUM_V2_FEED='off' — default): returns only
 * episode cards, same behavior the v1 home page has shipped with.
 *
 * v2 mode (NEXT_PUBLIC_PODIUM_V2_FEED='on'): runs all three loaders
 * in parallel via Promise.allSettled — episode cards, theme cards,
 * and notable-take cards — and merges them into one feed sorted by
 * `surfacedAt` newest-first. A failure in any single loader degrades
 * the feed to the remaining loaders' output rather than throwing
 * (matches the existing degradation posture in app/(app)/page.tsx).
 */
export async function loadDigestFeed(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DigestFeedItem[]> {
  const v2On = env.NEXT_PUBLIC_PODIUM_V2_FEED === "on";

  const [episodesResult, themesResult, takesResult] = await Promise.allSettled([
    loadDigestCards(supabase, teamId),
    v2On ? loadDigestThemes(supabase, teamId) : Promise.resolve([]),
    v2On ? loadDigestNotableTakes(supabase, teamId) : Promise.resolve([]),
  ]);

  const items: DigestFeedItem[] = [];

  if (episodesResult.status === "fulfilled") {
    for (const c of episodesResult.value) {
      items.push({ ...c, card_type: "episode" });
    }
  } else {
    console.error("loadDigestFeed: episode cards failed:", episodesResult.reason);
  }

  if (themesResult.status === "fulfilled") {
    for (const t of themesResult.value) items.push(t);
  } else {
    console.error("loadDigestFeed: theme cards failed:", themesResult.reason);
  }

  if (takesResult.status === "fulfilled") {
    for (const t of takesResult.value) items.push(t);
  } else {
    console.error("loadDigestFeed: notable-take cards failed:", takesResult.reason);
  }

  // Sort newest-first by surfacedAt. Episode card uses `surfacedAt`;
  // theme + notable-take cards also use `surfacedAt`. Same field
  // name across the union, so the sort is uniform.
  items.sort((a, b) => {
    const ta = Date.parse(a.surfacedAt ?? "");
    const tb = Date.parse(b.surfacedAt ?? "");
    return tb - ta;
  });

  return items;
}
