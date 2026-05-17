import "server-only";

import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AnthropicClient } from "../anthropic/client.ts";
import { findToolUse } from "../anthropic/_helpers.ts";
import { buildTeamBrainUpdateSystemPrompt } from "../anthropic/prompts/team-brain-update.ts";
import {
  ANTHROPIC_MODEL,
  AnthropicSchemaError,
  AnthropicTransientError,
} from "../anthropic/types.ts";

import { loadTeamBrain } from "./load.ts";
import {
  TEAM_BRAIN_PROMPT_VERSION,
  type TeamBrain,
} from "./types.ts";

const TOOL_NAME = "submit_brain_update";

const ROSTER_ENTRY_SCHEMA = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  note: z.string().optional(),
});

const NARRATIVE_ARC_SCHEMA = z.object({
  label: z.string().min(1),
  summary: z.string().min(1),
  state: z.enum(["hot", "simmering", "cold"]).optional(),
});

const RECENT_THEME_SCHEMA = z.object({
  signature: z.string().min(1),
  label: z.string().min(1),
  first_seen: z.string().min(1),
  last_seen: z.string().min(1),
  hot: z.boolean(),
});

const BRAIN_PAYLOAD_SCHEMA = z.object({
  team_id: z.string().min(1),
  team_name: z.string().min(1),
  sport: z.string().min(1),
  season_context: z.string().min(1),
  season_storyline: z.string().min(1),
  roster: z.array(ROSTER_ENTRY_SCHEMA),
  narrative_arcs: z.array(NARRATIVE_ARC_SCHEMA),
  fan_psychology: z.array(z.string().min(1)),
  recent_themes: z.array(RECENT_THEME_SCHEMA),
});

const TOOL_INPUT_SCHEMA = z.object({
  payload: BRAIN_PAYLOAD_SCHEMA,
});

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description:
    "Submit the complete updated TeamBrain payload after incorporating the past week's themes and surfaced cards.",
  input_schema: {
    type: "object" as const,
    required: ["payload"],
    properties: {
      payload: {
        type: "object" as const,
        required: [
          "team_id",
          "team_name",
          "sport",
          "season_context",
          "season_storyline",
          "roster",
          "narrative_arcs",
          "fan_psychology",
          "recent_themes",
        ],
        properties: {
          team_id: { type: "string" as const },
          team_name: { type: "string" as const },
          sport: { type: "string" as const },
          season_context: { type: "string" as const },
          season_storyline: { type: "string" as const },
          roster: { type: "array" as const, items: { type: "object" as const } },
          narrative_arcs: { type: "array" as const, items: { type: "object" as const } },
          fan_psychology: { type: "array" as const, items: { type: "string" as const } },
          recent_themes: { type: "array" as const, items: { type: "object" as const } },
        },
      },
    },
  },
};

const MAX_OUTPUT_TOKENS = 4_096;
const MAX_ATTEMPTS = 2;
const LOOKBACK_DAYS = 7;

export interface UpdateTeamBrainOutput {
  status: "updated" | "no_brain" | "no_input" | "failed";
  themesConsidered: number;
  cardsConsidered: number;
}

/**
 * Run the weekly brain update for a team.
 *
 * - Loads the current brain. If absent (team hasn't been seeded), returns
 *   no_brain — operator action required (seed first).
 * - Gathers the past week of themes + surfaced cards.
 * - Asks Claude to produce an updated brain payload.
 * - Validates + upserts in place. Updated_at bumps; payload replaces.
 *
 * Failure modes are absorbed (transient Anthropic, schema mismatch):
 * the prior brain stays in place. The system never operates without
 * a brain.
 */
export async function updateTeamBrain(
  supabase: SupabaseClient,
  anthropic: AnthropicClient,
  teamId: string,
  now: Date = new Date(),
): Promise<UpdateTeamBrainOutput> {
  const out: UpdateTeamBrainOutput = {
    status: "updated",
    themesConsidered: 0,
    cardsConsidered: 0,
  };

  const currentBrain = await loadTeamBrain(supabase, teamId);
  if (!currentBrain) {
    return { ...out, status: "no_brain" };
  }

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const sinceTimestamp = since;

  const { data: themes } = await supabase
    .from("themes")
    .select("theme_signature, label, surfacing_entities, news_echo, surfaced_at")
    .eq("team_id", teamId)
    .gte("surfaced_at", sinceTimestamp);
  const { data: cards } = await supabase
    .from("cards")
    .select("card_type, card_title, card_body, surfaced_at")
    .eq("team_id", teamId)
    .gte("surfaced_at", sinceTimestamp)
    .in("card_type", ["theme", "notable_take"]);
  out.themesConsidered = themes?.length ?? 0;
  out.cardsConsidered = cards?.length ?? 0;

  if (out.themesConsidered === 0 && out.cardsConsidered === 0) {
    // Quiet week — nothing to fold in. Skip the LLM call.
    return { ...out, status: "no_input" };
  }

  const updated = await callBrainUpdate(anthropic, currentBrain, themes ?? [], cards ?? []);
  if (!updated) return { ...out, status: "failed" };

  const { error } = await supabase.from("team_brain").upsert(
    {
      team_id: teamId,
      payload: updated,
      prompt_version: TEAM_BRAIN_PROMPT_VERSION,
      updated_at: now.toISOString(),
    },
    { onConflict: "team_id" },
  );
  if (error) {
    console.error(`updateTeamBrain: upsert failed: ${error.message}`);
    return { ...out, status: "failed" };
  }

  return out;
}

async function callBrainUpdate(
  anthropic: AnthropicClient,
  currentBrain: TeamBrain,
  themes: readonly Record<string, unknown>[],
  cards: readonly Record<string, unknown>[],
): Promise<Omit<TeamBrain, "updated_at"> | null> {
  const system = buildTeamBrainUpdateSystemPrompt();
  const userMessage = [
    `# Current TeamBrain`,
    "```json",
    JSON.stringify(brainToPayloadShape(currentBrain), null, 2),
    "```",
    "",
    `# Themes surfaced in the past ${LOOKBACK_DAYS} days (${themes.length})`,
    "```json",
    JSON.stringify(themes, null, 2),
    "```",
    "",
    `# Cards surfaced in the past ${LOOKBACK_DAYS} days (${cards.length})`,
    "```json",
    JSON.stringify(cards, null, 2),
    "```",
    "",
    `Produce the updated TeamBrain. Submit via the \`${TOOL_NAME}\` tool.`,
  ].join("\n");

  const baseParams: MessageCreateParamsNonStreaming = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools: [{ ...TOOL_DEFINITION, cache_control: { type: "ephemeral" } }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  };

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Message;
    try {
      response = await anthropic.createMessage("update_team_brain", baseParams);
    } catch (err) {
      if (err instanceof AnthropicTransientError) {
        console.error(`updateTeamBrain: transient error on attempt ${attempt}: ${err.message}`);
        return null;
      }
      throw err;
    }
    try {
      const toolUse = findToolUse(response, TOOL_NAME);
      if (!toolUse) throw new AnthropicSchemaError("update_team_brain", "missing tool_use");
      const parsed = TOOL_INPUT_SCHEMA.safeParse(toolUse.input);
      if (!parsed.success) {
        throw new AnthropicSchemaError(
          "update_team_brain",
          `shape validation failed: ${parsed.error.message}`,
        );
      }
      return parsed.data.payload;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }
  console.error(`updateTeamBrain: returning null: ${lastError?.message ?? "unknown"}`);
  return null;
}

/** Strip updated_at for prompt rendering — it's row metadata, not
 *  payload, and including it would unstable the cache prefix.
 *  Returns the same shape stored in DB (sans updated_at). */
function brainToPayloadShape(brain: TeamBrain): Omit<TeamBrain, "updated_at"> {
  const { updated_at: _ignore, ...rest } = brain;
  void _ignore;
  return rest;
}
