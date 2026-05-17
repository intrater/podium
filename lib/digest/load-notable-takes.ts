import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DigestNotableTakeCard,
  DigestNotableTakeCardBody,
} from "./types";

const CARDS_LIMIT = 50;

interface NotableTakeCardRow {
  id: string;
  surfaced_at: string;
  card_title: string | null;
  card_body: DigestNotableTakeCardBody | null;
  notable_take_voice_id: string | null;
  voices: { id: string; display_name: string } | null;
  episodes: {
    id: string;
    title: string;
    published_at: string | null;
    audio_url: string | null;
    podcasts: { id: string; name: string; image_url: string | null } | null;
  } | null;
}

interface FeedbackRow {
  card_id: string | null;
}

/**
 * Read notable-take cards for the user/team. Each card joins to a
 * single voice (the Tier-A source) and a single episode (so audio
 * playback continues to work).
 *
 * Filters hidden cards via the existing feedback mechanism. Sorted
 * newest-first; capped at CARDS_LIMIT.
 */
export async function loadDigestNotableTakes(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DigestNotableTakeCard[]> {
  const [cardsResult, feedbackResult] = await Promise.all([
    supabase
      .from("cards")
      .select(
        `
          id, surfaced_at, card_title, card_body, notable_take_voice_id,
          voices ( id, display_name ),
          episodes (
            id, title, published_at, audio_url,
            podcasts ( id, name, image_url )
          )
        `,
      )
      .eq("team_id", teamId)
      .eq("card_type", "notable_take")
      .eq("hidden", false)
      .order("surfaced_at", { ascending: false })
      .limit(CARDS_LIMIT)
      .returns<NotableTakeCardRow[]>(),
    supabase
      .from("feedback")
      .select("card_id")
      .eq("verdict", "not_relevant")
      .limit(500)
      .returns<FeedbackRow[]>(),
  ]);

  if (cardsResult.error) throw cardsResult.error;
  if (feedbackResult.error) throw feedbackResult.error;

  const hidden = new Set<string>();
  for (const row of feedbackResult.data ?? []) {
    if (row.card_id) hidden.add(row.card_id);
  }

  const out: DigestNotableTakeCard[] = [];
  for (const row of cardsResult.data ?? []) {
    if (hidden.has(row.id)) continue;
    if (!row.voices) continue; // can't render without voice attribution
    if (!row.episodes) continue; // can't render without source episode
    if (!row.card_body) continue;

    const ep = row.episodes;
    const podcast = ep.podcasts ?? { id: "", name: "Unknown podcast", image_url: null };

    out.push({
      card_type: "notable_take",
      id: row.id,
      surfacedAt: row.surfaced_at,
      cardTitle: row.card_title ?? row.card_body.title,
      body: row.card_body,
      voiceId: row.voices.id,
      voiceDisplayName: row.voices.display_name,
      episode: {
        id: ep.id,
        title: ep.title,
        publishedAt: ep.published_at,
        audioUrl: ep.audio_url,
        podcast: { id: podcast.id, name: podcast.name, imageUrl: podcast.image_url ?? null },
      },
    });
  }
  return out;
}
