/**
 * Curated podcast list for v1 (R2).
 *
 * Every entry is catalog-resident in the Particle podcast database — verified
 * via `/v1/podcasts?q=...` during the U6 sweep on 2026-05-10. Wishlist shows
 * that did not appear in the catalog (Niners Nation, 49ers Webzone, Talkin'
 * Niners, ESPN Daily) were swapped for catalog-resident equivalents that
 * cover the same daily-49ers-show role (49ers Talk, The Gold Standard,
 * Section 415, KNBR, The Krueg Show).
 *
 * `kind` is a coarse taxonomy used as a UI filter hint:
 *   - "team-specific": single team's coverage, or regional shows where 49ers
 *     content dominates during NFL season (KNBR, The Leeds View).
 *   - "national": broader football / sports coverage where 49ers segments are
 *     embedded inside otherwise-unrelated episodes.
 *
 * The list lands in Postgres via `scripts/seed-supabase.ts` with
 * `on conflict (particle_slug) do nothing`, so re-runs are idempotent.
 */

export type PodcastKind = "team-specific" | "national";

export interface CuratedPodcast {
  particleSlug: string;
  name: string;
  kind: PodcastKind;
}

export const podcasts: readonly CuratedPodcast[] = [
  // ─── 49ers / Bay Area ────────────────────────────────────────────────
  { particleSlug: "locked-on-49ers", name: "Locked On 49ers", kind: "team-specific" },
  { particleSlug: "49ers-talk", name: "49ers Talk: A San Francisco 49ers Podcast", kind: "team-specific" },
  { particleSlug: "the-gold-standard", name: "The Gold Standard: SF 49ers Podcast Network", kind: "team-specific" },
  { particleSlug: "section-415", name: "Section 415", kind: "team-specific" },
  { particleSlug: "the-krueg-show", name: "The Krueg Show", kind: "team-specific" },
  { particleSlug: "knbr", name: "KNBR Podcast", kind: "team-specific" },
  { particleSlug: "the-leeds-view-podcast-and-news", name: "The Leeds View Podcast and News", kind: "team-specific" },

  // ─── National NFL coverage ───────────────────────────────────────────
  { particleSlug: "the-mina-kimes-show", name: "The Mina Kimes Show featuring Lenny", kind: "national" },
  { particleSlug: "the-bill-simmons", name: "The Bill Simmons Podcast", kind: "national" },
  { particleSlug: "the-pat-mcafee-show", name: "The Pat McAfee Show", kind: "national" },
  { particleSlug: "pardon-my-take", name: "Pardon My Take", kind: "national" },
  { particleSlug: "pft-live", name: "PFT Live with Mike Florio", kind: "national" },
  { particleSlug: "the-athletic-football-show", name: "The Athletic Football Show", kind: "national" },
  { particleSlug: "the-ringer-nfl-show", name: "The Ringer NFL Show", kind: "national" },
  { particleSlug: "nfl", name: "NFL: Move the Sticks with Daniel Jeremiah & Bucky Brooks", kind: "national" },
  { particleSlug: "nfl-2", name: "NFL: Good Morning Football", kind: "national" },
  { particleSlug: "nfl-3", name: "NFL: The Insiders", kind: "national" },
  { particleSlug: "football-301", name: "Football 301 with Nate Tice", kind: "national" },
  { particleSlug: "heed-the-call-nfl", name: "Heed the Call NFL Podcast (Hanzus & Sessler)", kind: "national" },
  { particleSlug: "the-mmqb-nfl", name: "The MMQB NFL Podcast", kind: "national" },
  { particleSlug: "the-rich-eisen-show", name: "The Rich Eisen Show", kind: "national" },
  { particleSlug: "the-herd", name: "The Herd with Colin Cowherd", kind: "national" },
  { particleSlug: "the-dan-patrick-show", name: "The Dan Patrick Show", kind: "national" },
  { particleSlug: "the-mcshay-show", name: "The McShay Show", kind: "national" },
  { particleSlug: "ross-tucker-football", name: "Ross Tucker Football Podcast", kind: "national" },
  { particleSlug: "first-take", name: "First Take", kind: "national" },
  { particleSlug: "get-up", name: "Get Up", kind: "national" },
  { particleSlug: "the-domonique-foxworth-show", name: "The Domonique Foxworth Show", kind: "national" },
  { particleSlug: "pablo-torre-finds-out", name: "Pablo Torre Finds Out", kind: "national" },
  { particleSlug: "the-right-time", name: "The Right Time with Bomani Jones", kind: "national" },
  { particleSlug: "the-jim-rome-show", name: "The Jim Rome Show", kind: "national" },
  { particleSlug: "first-things-first", name: "First Things First", kind: "national" },
  { particleSlug: "nightcap", name: "Nightcap", kind: "national" },
  { particleSlug: "the-arena-2", name: "The Arena: Gridiron", kind: "national" },

  // ─── Fantasy football ────────────────────────────────────────────────
  { particleSlug: "fantasy-footballers", name: "Fantasy Footballers", kind: "national" },
  { particleSlug: "fantasy-football-today", name: "Fantasy Football Today", kind: "national" },
];
