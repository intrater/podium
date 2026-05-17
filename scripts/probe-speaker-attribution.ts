/**
 * Speaker-attribution diagnostic for U3 of the v2 plan.
 *
 * Voice memory's effectiveness hinges on knowing which voice (Mina,
 * Simmons, Tice, etc.) made each take. Particle's segment shape includes
 * an optional `speaker.name` field, but real-world fill rate is unknown.
 * This script measures it.
 *
 * Pulls every persisted segment for each Tier-A podcast and reports:
 *   - Total segments
 *   - Segments with `speaker_name` populated
 *   - Fill-rate %
 *   - Recommended `kind` per show: `host` if >= 90%, `show` otherwise
 *
 * If most Tier-A shows return `host`, voice memory keys on speaker
 * identity (Mina herself, Simmons himself). If most return `show`,
 * we fall back to show-level voice (the Mina Kimes Show as one voice,
 * irrespective of individual speaker) — lower fidelity, but doesn't
 * fabricate attribution.
 *
 * Run:
 *   npm run probe:speakers
 */

import { createClient } from "@supabase/supabase-js";

import { tiers } from "../config/tiers.ts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/** Fill-rate at or above which we trust speaker.name enough to key
 *  voice memory on the individual host rather than the show. */
export const HOST_LEVEL_THRESHOLD = 0.9;

/** Min segments required for a per-show recommendation to be
 *  data-driven rather than a guess. */
export const MIN_SAMPLE_SIZE = 5;

export interface ShowReport {
  particleSlug: string;
  podcastName: string;
  totalSegments: number;
  segmentsWithSpeaker: number;
  fillRate: number;
  recommendedKind: "host" | "show";
}

/**
 * Pure decision: given a show's fill rate and segment count, recommend
 * whether voice memory should key on host (per-speaker) or show
 * (per-podcast). Exported for unit testing without DB.
 */
export function recommendKindFromFillRate(
  totalSegments: number,
  segmentsWithSpeaker: number,
): "host" | "show" {
  if (totalSegments < MIN_SAMPLE_SIZE) return "show";
  const fillRate = segmentsWithSpeaker / totalSegments;
  return fillRate >= HOST_LEVEL_THRESHOLD ? "host" : "show";
}

async function main() {
  const tierASlugs = Object.entries(tiers)
    .filter(([, tier]) => tier === "A")
    .map(([slug]) => slug);

  console.log(`Probing ${tierASlugs.length} Tier-A shows for speaker attribution coverage...\n`);

  const { data: podcastRows, error: pErr } = await supabase
    .from("podcasts")
    .select("id, particle_slug, name")
    .in("particle_slug", tierASlugs);
  if (pErr) throw new Error(`podcasts lookup failed: ${pErr.message}`);

  const reports: ShowReport[] = [];

  for (const podcast of podcastRows ?? []) {
    // Find all episodes for this podcast.
    const { data: episodes, error: eErr } = await supabase
      .from("episodes")
      .select("id")
      .eq("podcast_id", podcast.id);
    if (eErr) throw new Error(`episodes lookup failed for ${podcast.particle_slug}: ${eErr.message}`);

    const episodeIds = (episodes ?? []).map((e) => e.id);
    if (episodeIds.length === 0) {
      reports.push({
        particleSlug: podcast.particle_slug,
        podcastName: podcast.name,
        totalSegments: 0,
        segmentsWithSpeaker: 0,
        fillRate: 0,
        recommendedKind: "show",
      });
      continue;
    }

    const { data: segments, error: sErr } = await supabase
      .from("segments")
      .select("speaker_name")
      .in("episode_id", episodeIds);
    if (sErr) throw new Error(`segments lookup failed for ${podcast.particle_slug}: ${sErr.message}`);

    const total = segments?.length ?? 0;
    const withSpeaker = (segments ?? []).filter(
      (s) => s.speaker_name != null && (s.speaker_name as string).trim().length > 0,
    ).length;
    const fillRate = total === 0 ? 0 : withSpeaker / total;
    reports.push({
      particleSlug: podcast.particle_slug,
      podcastName: podcast.name,
      totalSegments: total,
      segmentsWithSpeaker: withSpeaker,
      fillRate,
      recommendedKind: recommendKindFromFillRate(total, withSpeaker),
    });
  }

  // Sort by fill rate desc for readability.
  reports.sort((a, b) => b.fillRate - a.fillRate);

  const colSlug = Math.max(12, ...reports.map((r) => r.particleSlug.length));
  const colName = Math.max(20, ...reports.map((r) => r.podcastName.length));
  const pad = (s: string, n: number) => s.padEnd(n);

  console.log(
    `${pad("particle_slug", colSlug)}  ${pad("podcast name", colName)}  ${pad("total", 6)}  ${pad("named", 6)}  ${pad("fill%", 7)}  recommend`,
  );
  console.log("-".repeat(colSlug + colName + 38));

  for (const r of reports) {
    const fillPct = `${(r.fillRate * 100).toFixed(1)}%`;
    console.log(
      `${pad(r.particleSlug, colSlug)}  ${pad(r.podcastName, colName)}  ${pad(String(r.totalSegments), 6)}  ${pad(String(r.segmentsWithSpeaker), 6)}  ${pad(fillPct, 7)}  ${r.recommendedKind}`,
    );
  }

  console.log();

  // Aggregate recommendation.
  const showsWithData = reports.filter((r) => r.totalSegments >= MIN_SAMPLE_SIZE);
  const hostQualifiedShows = showsWithData.filter((r) => r.recommendedKind === "host");
  const lowDataShows = reports.filter((r) => r.totalSegments < MIN_SAMPLE_SIZE);

  console.log("=== Summary ===");
  console.log(`Tier-A shows total:                   ${reports.length}`);
  console.log(`Shows with sufficient data (n>=5):    ${showsWithData.length}`);
  console.log(`Of those, host-level qualifies:       ${hostQualifiedShows.length}`);
  console.log(`Shows with insufficient data (n<5):   ${lowDataShows.length}`);

  if (showsWithData.length === 0) {
    console.log(
      "\nVerdict: NOT ENOUGH DATA YET. Run an ingest pass first, then re-probe.",
    );
    console.log("Recommendation: ship show-level voice for v1 (safer baseline);");
    console.log("re-probe after the first week of v2-era ingest to revisit.");
    return;
  }

  const hostFraction = hostQualifiedShows.length / showsWithData.length;
  if (hostFraction >= 0.6) {
    console.log(
      `\nVerdict: HOST-LEVEL VIABLE. ${hostQualifiedShows.length}/${showsWithData.length} = ${(hostFraction * 100).toFixed(0)}% of shows pass the ${HOST_LEVEL_THRESHOLD * 100}% threshold.`,
    );
    console.log("Recommendation: voice memory keys on speaker.name with show-level fallback for null cases.");
  } else {
    console.log(
      `\nVerdict: SHOW-LEVEL FALLBACK. Only ${hostQualifiedShows.length}/${showsWithData.length} shows clear the threshold.`,
    );
    console.log("Recommendation: voice memory keys on podcast/show, not speaker. One voice = one show.");
    console.log("Hosts that DO appear in speaker_name can still drive richer card attribution at write time.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
