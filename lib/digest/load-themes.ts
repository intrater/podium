import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DigestThemeCard,
  DigestThemeCardBody,
  DigestThemeCardVoiceContribution,
} from "./types";

const CARDS_LIMIT = 50;

interface ThemeCardRow {
  id: string;
  surfaced_at: string;
  card_title: string | null;
  card_body: DigestThemeCardBody | null;
  theme_id: string | null;
  themes: {
    id: string;
    theme_signature: string;
    label: string;
    member_segment_ids: string[];
    member_voice_ids: string[];
    surfacing_entities: string[];
    news_echo: boolean;
  } | null;
}

interface VoiceLookupRow {
  id: string;
  display_name: string;
}

interface FeedbackRow {
  card_id: string | null;
}

/**
 * Read theme cards for the user/team. Joins themes for the cluster
 * metadata + a separate fan-out to voices for display names so card
 * voice attribution is human-readable.
 *
 * Filters hidden cards via the existing feedback mechanism (matches
 * loadDigestCards). Sorted newest-first; capped at CARDS_LIMIT.
 */
export async function loadDigestThemes(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DigestThemeCard[]> {
  const [cardsResult, feedbackResult, voicesResult] = await Promise.all([
    supabase
      .from("cards")
      .select(
        `
          id, surfaced_at, card_title, card_body, theme_id,
          themes (
            id, theme_signature, label, member_segment_ids,
            member_voice_ids, surfacing_entities, news_echo
          )
        `,
      )
      .eq("team_id", teamId)
      .eq("card_type", "theme")
      .eq("hidden", false)
      .order("surfaced_at", { ascending: false })
      .limit(CARDS_LIMIT)
      .returns<ThemeCardRow[]>(),
    supabase
      .from("feedback")
      .select("card_id")
      .eq("verdict", "not_relevant")
      .limit(500)
      .returns<FeedbackRow[]>(),
    supabase
      .from("voices")
      .select("id, display_name")
      .returns<VoiceLookupRow[]>(),
  ]);

  if (cardsResult.error) throw cardsResult.error;
  if (feedbackResult.error) throw feedbackResult.error;
  if (voicesResult.error) throw voicesResult.error;

  const hidden = new Set<string>();
  for (const row of feedbackResult.data ?? []) {
    if (row.card_id) hidden.add(row.card_id);
  }
  const voiceNames = new Map<string, string>();
  for (const v of voicesResult.data ?? []) {
    voiceNames.set(v.id, v.display_name);
  }

  const out: DigestThemeCard[] = [];
  for (const row of cardsResult.data ?? []) {
    if (hidden.has(row.id)) continue;
    if (!row.themes) continue; // can't render without theme metadata
    if (!row.card_body) continue; // can't render without writer output

    const body = row.card_body;
    const voiceContribs: DigestThemeCardVoiceContribution[] = (
      body.voice_contributions ?? []
    ).map((vc) => ({
      voice_id: vc.voice_id,
      voice_display_name: voiceNames.get(vc.voice_id) ?? vc.voice_id,
      framing: vc.framing,
      quote: vc.quote,
    }));

    out.push({
      card_type: "theme",
      id: row.id,
      surfacedAt: row.surfaced_at,
      cardTitle: row.card_title ?? body.title,
      body: {
        title: body.title,
        lede: body.lede,
        voice_contributions: voiceContribs,
        delta_copy: body.delta_copy,
      },
      themeId: row.themes.id,
      themeSignature: row.themes.theme_signature,
      themeLabel: row.themes.label,
      newsEcho: row.themes.news_echo,
      surfacingEntities: row.themes.surfacing_entities,
      memberSegmentIds: row.themes.member_segment_ids,
      memberVoiceIds: row.themes.member_voice_ids,
    });
  }
  return out;
}
