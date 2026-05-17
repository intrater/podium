/**
 * Editorial voices catalog (v1: show-level only).
 *
 * Each Tier-A podcast gets a single show-level voice. The novelty gate
 * compares "what did this voice say last time" against "what is this
 * voice saying now" — keying on the show means we treat the whole
 * Mina Kimes Show as one voice (Mina-and-guests collectively), rather
 * than per-individual.
 *
 * Why show-level: the 2026-05-17 speaker-attribution probe found that
 * Particle's `segment.speaker_name` field is sparsely populated on
 * Tier-A shows. Host-level voice memory would be built on unreliable
 * signal and produce false position attributions — exactly the
 * dealbreaker (take-level repetition / mis-attribution) v2 is designed
 * to avoid.
 *
 * The schema supports kind = 'host' alongside kind = 'show'. When
 * Particle's attribution improves or we backfill via transcript
 * speaker diarization, we can add host-level voices without migration.
 *
 * Tier B / C podcasts do NOT get voices in v1: they contribute to
 * theme-card frequency signal only, never solo cards, so they don't
 * need position history.
 */

import { tiers, type Tier } from "./tiers.ts";

export type VoiceKind = "host" | "show";

export interface CuratedVoice {
  /** Stable voice id; for show-level voices, mirrors `particleSlug`. */
  id: string;
  kind: VoiceKind;
  displayName: string;
  tier: Tier;
  /** Show-level voices anchor to a podcast row by particleSlug. */
  podcastSlug: string;
}

/**
 * v1 seed: one show-level voice per Tier-A podcast. Display names are
 * what fans would call them when referring to "what [voice] said
 * about X."
 */
export const voices: readonly CuratedVoice[] = [
  {
    id: "the-mina-kimes-show",
    kind: "show",
    displayName: "The Mina Kimes Show",
    tier: "A",
    podcastSlug: "the-mina-kimes-show",
  },
  {
    id: "the-bill-simmons",
    kind: "show",
    displayName: "The Bill Simmons Podcast",
    tier: "A",
    podcastSlug: "the-bill-simmons",
  },
  {
    id: "the-dan-patrick-show",
    kind: "show",
    displayName: "The Dan Patrick Show",
    tier: "A",
    podcastSlug: "the-dan-patrick-show",
  },
  {
    id: "the-rich-eisen-show",
    kind: "show",
    displayName: "The Rich Eisen Show",
    tier: "A",
    podcastSlug: "the-rich-eisen-show",
  },
  {
    id: "the-ringer-nfl-show",
    kind: "show",
    displayName: "The Ringer NFL Show",
    tier: "A",
    podcastSlug: "the-ringer-nfl-show",
  },
  {
    id: "football-301",
    kind: "show",
    displayName: "Football 301 with Nate Tice",
    tier: "A",
    podcastSlug: "football-301",
  },
  {
    id: "the-athletic-football-show",
    kind: "show",
    displayName: "The Athletic Football Show",
    tier: "A",
    podcastSlug: "the-athletic-football-show",
  },
];

/**
 * Sanity check: every voice's tier matches the tier on its podcast.
 * Run at seed time so a stale voice config can't drift past the type
 * checker.
 */
export function assertTierConsistency(): void {
  for (const voice of voices) {
    const expected = tiers[voice.podcastSlug];
    if (expected !== voice.tier) {
      throw new Error(
        `config/voices: voice ${voice.id} has tier ${voice.tier} but podcast ${voice.podcastSlug} is tier ${expected ?? "MISSING"}`,
      );
    }
  }
}
