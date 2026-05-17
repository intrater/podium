/**
 * Catalog tiering for v2 (editorial reframe).
 *
 * Tier governs whether a podcast can surface a SOLO card (Tier A only)
 * vs. only contribute to THEME card frequency signal (any tier). See
 * `docs/brainstorms/podium-v2-editorial-direction.md` § Catalog tiering
 * and `docs/plans/2026-05-17-001-feat-podium-v2-editorial-reframe-plan.md`
 * U1 for the editorial rationale.
 *
 * Assignments locked in with the maker on 2026-05-17. They are NOT
 * algorithmic — they reflect the maker's read on which voices a 49ers
 * fanatic would open Podium specifically to hear from. Adjust freely
 * by editing this file and re-running the seed; the DB `tier` column
 * is overwritten by `on conflict do update`.
 *
 * Drift safety: every entry in `config/podcasts.ts` must have a tier
 * in this map. Enforced by `__tests__/lib/config/tiers.test.ts`.
 */

export type Tier = "A" | "B" | "C";

/**
 * Map of `particleSlug` → `Tier`. Keep alphabetized within each tier
 * for review-friendliness; group order follows the editorial layering
 * (A first, then B, then C with the local-49ers / hot-take / fantasy
 * sub-blocks visible).
 */
export const tiers: Readonly<Record<string, Tier>> = {
  // ─── Tier A — named voices, opinion-driven ─────────────────────────
  // Fanatics open Podium specifically for these. May surface solo
  // notable-take cards with no cross-source corroboration.
  "football-301": "A",
  "the-athletic-football-show": "A",
  "the-bill-simmons": "A",
  "the-dan-patrick-show": "A",
  "the-mina-kimes-show": "A",
  "the-rich-eisen-show": "A",
  "the-ringer-nfl-show": "A",

  // ─── Tier B — real coverage / reportorial ──────────────────────────
  // Cluster into theme cards with Tier A. Do not surface solo cards.
  "get-up": "B",
  "heed-the-call-nfl": "B",
  "nfl": "B", // Move the Sticks
  "pablo-torre-finds-out": "B",
  "pardon-my-take": "B",
  "pft-live": "B",
  "the-domonique-foxworth-show": "B",
  "the-mmqb-nfl": "B",
  "the-pat-mcafee-show": "B",
  "the-right-time": "B",

  // ─── Tier C — local 49ers daily shows ──────────────────────────────
  // Contribute to theme frequency signal. Never solo.
  "49ers-talk": "C",
  "knbr": "C",
  "locked-on-49ers": "C",
  "section-415": "C",
  "the-gold-standard": "C",
  "the-krueg-show": "C",
  "the-leeds-view-podcast-and-news": "C",

  // ─── Tier C — national hot-take / news entertainment ──────────────
  "first-take": "C",
  "first-things-first": "C",
  "nfl-2": "C", // Good Morning Football
  "nfl-3": "C", // The Insiders
  "nightcap": "C",
  "ross-tucker-football": "C",
  "the-arena-2": "C",
  "the-herd": "C",
  "the-jim-rome-show": "C",
  "the-mcshay-show": "C",

  // ─── Tier C — fantasy football ─────────────────────────────────────
  "fantasy-football-today": "C",
  "fantasy-footballers": "C",
};

/**
 * Look up a tier by slug. Defaults to 'C' for unknown slugs — matches
 * the DB column default so seed-time drift fails closed rather than
 * promoting a podcast accidentally.
 */
export function tierForSlug(particleSlug: string): Tier {
  return tiers[particleSlug] ?? "C";
}
