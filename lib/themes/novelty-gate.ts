import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnthropicClient } from "../anthropic/client.ts";
import { detectShift } from "../voice-memory/detect-shift.ts";
import { loadVoicePositions, voiceHasPriorPosition } from "../voice-memory/load.ts";
import { extractTopicKey } from "../voice-memory/extract-topic-key.ts";
import type { TeamBrain } from "../team-brain/types.ts";

import type { MomentForClustering, ThemeCandidate } from "./types.ts";

/** Lookback for "has this theme appeared recently?" — used by
 *  recurrence suppression. Theme that recurs inside this window
 *  without any novelty signal gets suppressed. */
const THEME_RECURRENCE_LOOKBACK_DAYS = 2;

/** Each kind of signal the gate can fire for a candidate. Surface
 *  decision = any signal fires AND no veto. */
export type NoveltyKind =
  | "new_voice"
  | "new_fact"
  | "contrarian_turn"
  | "position_shift"
  | "first_surfacing";

export interface NoveltySignal {
  kind: NoveltyKind;
  /** Optional human-readable detail (rendered as card delta copy). */
  detail?: string;
}

export interface NoveltyDecision {
  /** Should this theme be surfaced today? */
  surface: boolean;
  /** Which signals fired. Empty when surface=false. */
  signals: readonly NoveltySignal[];
  /** Human rationale — used both for logging and for card delta copy
   *  ("Mina just flipped the consensus"). */
  rationale: string;
}

export interface NoveltyGateDeps {
  supabase: SupabaseClient;
  anthropic: AnthropicClient;
  teamBrain: TeamBrain;
}

export interface NoveltyGateInput {
  teamId: string;
  /** ISO timestamp of "now" — used for recurrence-window math. */
  now: string;
  /** The theme candidate from Stage 2. */
  theme: ThemeCandidate;
  /** All input moments for the cluster, joined back from clustering
   *  output via member_segment_ids. Used to identify the topic and
   *  the new positions to compare against history. */
  members: readonly MomentForClustering[];
  /** Voice display names by id, for the shift-detector prompt. */
  voiceDisplayNames: Map<string, string>;
}

/**
 * Evaluate a single theme candidate against voice memory and theme
 * recurrence. Surface decision returns true if ANY novelty signal
 * fires:
 *
 *   1. First surfacing — signature never seen before
 *   2. new_voice — at least one cluster voice is making its first
 *      position on this topic
 *   3. position_shift — at least one cluster voice has previously
 *      argued this topic and is now revising
 *
 * Suppress decision (surface=false) only fires when the theme has
 * been seen within THEME_RECURRENCE_LOOKBACK_DAYS AND no novelty
 * signal applies.
 */
export async function evaluateThemeNovelty(
  deps: NoveltyGateDeps,
  input: NoveltyGateInput,
): Promise<NoveltyDecision> {
  const signals: NoveltySignal[] = [];

  // Step 1: theme-recurrence check (deterministic SQL).
  const lookbackStart = new Date(
    Date.parse(input.now) - THEME_RECURRENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const recurred = await themeSignatureSeenSince(
    deps.supabase,
    input.theme.theme_signature,
    lookbackStart,
  );
  if (!recurred) {
    signals.push({
      kind: "first_surfacing",
      detail: "First time this theme has been clustered.",
    });
  }

  // Step 2: per-voice checks against voice_positions.
  const topicKey = pickThemeTopicKey(input.theme, input.members);
  const positionShiftRationales: string[] = [];

  for (const voiceId of input.theme.member_voice_ids) {
    const hasPrior = await voiceHasPriorPosition(deps.supabase, {
      voiceId,
      teamId: input.teamId,
      topicKey,
    });
    if (!hasPrior) {
      const display = input.voiceDisplayNames.get(voiceId) ?? voiceId;
      signals.push({
        kind: "new_voice",
        detail: `${display} is engaging with this topic for the first time.`,
      });
      continue;
    }

    // Voice has prior. Compare new position to history with LLM.
    const memberForVoice = input.members.find(
      (m) => m.voice_id === voiceId && input.theme.member_segment_ids.includes(m.segment_id),
    );
    if (!memberForVoice) continue;

    const priorPositions = await loadVoicePositions(deps.supabase, {
      voiceId,
      teamId: input.teamId,
      topicKey,
    });
    if (priorPositions.length === 0) {
      // Race: priors disappeared between hasPrior and load. Treat
      // as new_voice rather than firing an erroneous LLM call.
      const display = input.voiceDisplayNames.get(voiceId) ?? voiceId;
      signals.push({ kind: "new_voice", detail: `${display} (no priors).` });
      continue;
    }

    const classification = await detectShift(deps.anthropic, {
      teamBrain: deps.teamBrain,
      voiceDisplayName: input.voiceDisplayNames.get(voiceId) ?? voiceId,
      topicKey,
      priorPositions,
      newPositionSummary: memberForVoice.summary,
      newPositionEvidenceQuote: memberForVoice.pull_quote,
    });
    // null from detectShift → transient or schema failure. Bias
    // toward restate per dealbreaker policy: do not fire a shift
    // signal on uncertain output.
    if (classification?.kind === "position_shift") {
      const display = input.voiceDisplayNames.get(voiceId) ?? voiceId;
      positionShiftRationales.push(`${display}: ${classification.rationale}`);
      signals.push({
        kind: "position_shift",
        detail: `${display}: ${classification.rationale}`,
      });
    }
  }

  // Step 3: decision.
  const noNoveltySignalsFired = signals.length === 0;
  if (recurred && noNoveltySignalsFired) {
    return {
      surface: false,
      signals: [],
      rationale: `Theme recurred within the ${THEME_RECURRENCE_LOOKBACK_DAYS}-day window with no new movement.`,
    };
  }

  const rationale = signals
    .map((s) => s.detail)
    .filter(Boolean)
    .join(" ");
  return {
    surface: true,
    signals,
    rationale: rationale || (recurred ? "Recurring theme with movement." : "Fresh theme."),
  };
}

/**
 * Pick a topic_key representative of the theme. Themes can have
 * multiple member topic_keys; we pick the most-common one as the
 * canonical for voice-memory comparisons. Falls back to slugifying
 * the theme's dominant surfacing entity if member topic_keys are
 * absent.
 */
function pickThemeTopicKey(
  theme: ThemeCandidate,
  members: readonly MomentForClustering[],
): string {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (!theme.member_segment_ids.includes(m.segment_id)) continue;
    counts.set(m.topic_key, (counts.get(m.topic_key) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return extractTopicKey(theme.surfacing_entities);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [k, n] of counts) {
    if (n > bestCount) {
      best = k;
      bestCount = n;
    }
  }
  return best ?? "general";
}

async function themeSignatureSeenSince(
  supabase: SupabaseClient,
  themeSignature: string,
  sinceIso: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("themes")
    .select("id", { count: "exact", head: true })
    .eq("theme_signature", themeSignature)
    .gte("surfaced_at", sinceIso);
  if (error) {
    throw new Error(`themeSignatureSeenSince(${themeSignature}) failed: ${error.message}`);
  }
  return (count ?? 0) > 0;
}
