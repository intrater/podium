/**
 * Anthropic client factory.
 *
 * Wraps `@anthropic-ai/sdk` with cost-tracking that mirrors the Particle
 * tracked-call pattern: every Messages call writes one row to `api_calls`
 * with provider='anthropic', model name, separated input/output/cache
 * token counts, and the computed cost.
 *
 * The factory takes a `SupabaseClient` rather than constructing one
 * internally so callers — daily worker, future agent tools, vitest — can
 * supply whichever client matches their context. The supplied client must
 * be service-role; user-scoped clients fail the api_calls insert silently
 * because the v1 RLS policies expose `read by authenticated` only.
 */

import "server-only";

import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages";
import type { SupabaseClient } from "@supabase/supabase-js";

import { teams } from "@/config/teams";
import { env } from "../env.ts";

const KNOWN_TEAM_IDS = new Set(teams.map((t) => t.id));

import {
  AnthropicTransientError,
  ANTHROPIC_MODEL,
  computeCallCost,
  type AnthropicUsage,
} from "./types.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AnthropicClientOptions {
  supabase: SupabaseClient;
  /**
   * Team this client is scoped to. Forwarded to every `api_calls` insert
   * for per-team cost attribution (U1, supports CE1). Optional — one-off
   * scripts may omit it. Validated against config/teams.ts at factory
   * construction.
   */
  teamId?: string;
  /** Test-only override for the Anthropic SDK. */
  sdk?: Pick<Anthropic, "messages">;
  /** Per-request timeout (ms). Defaults to 30s — sized to fit inside the Edge Function budget. */
  timeoutMs?: number;
}

export interface AnthropicClient {
  /**
   * Create a Messages call (non-streaming) and write one row to api_calls.
   * Returns the raw SDK Message; callers parse tool-use content blocks.
   */
  createMessage(
    operation: string,
    params: MessageCreateParamsNonStreaming,
  ): Promise<Message>;
}

export function createAnthropicClient(options: AnthropicClientOptions): AnthropicClient {
  // Validate team_id early so a misspelled or stale identifier fails at
  // factory construction instead of corrupting per-team cost rows.
  if (options.teamId !== undefined && !KNOWN_TEAM_IDS.has(options.teamId)) {
    throw new Error(
      `createAnthropicClient: unknown team_id "${options.teamId}". Known: ${[...KNOWN_TEAM_IDS].join(", ")}`,
    );
  }
  const sdk: Pick<Anthropic, "messages"> =
    options.sdk ??
    new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      // Bumped from the SDK default (2) so the internal 429 retry has
      // enough runway when Tier-1 rate limits collide with long-episode
      // extraction calls. SDK does exponential backoff between attempts.
      maxRetries: 5,
    });

  return {
    async createMessage(operation, params) {
      let message: Message;
      try {
        message = await sdk.messages.create(params);
      } catch (err) {
        const status = err instanceof APIError ? err.status : undefined;
        const detail = err instanceof Error ? err.message : String(err);
        throw new AnthropicTransientError(
          operation,
          `Anthropic ${operation} failed${status !== undefined ? ` (HTTP ${status})` : ""}: ${detail}`,
          err,
          status,
        );
      }

      const usage: AnthropicUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? undefined,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? undefined,
      };
      const cost = computeCallCost(usage);

      await logApiCall(options.supabase, {
        provider: "anthropic",
        endpoint: operation,
        model: params.model ?? ANTHROPIC_MODEL,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd: cost,
        team_id: options.teamId ?? null,
        metadata: {
          cache_creation_input_tokens: usage.cacheCreationInputTokens ?? 0,
          cache_read_input_tokens: usage.cacheReadInputTokens ?? 0,
          stop_reason: message.stop_reason,
        },
      });

      return message;
    },
  };
}

interface ApiCallRow {
  provider: string;
  endpoint: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  team_id?: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Best-effort api_calls insert. Failures (thrown errors AND PostgREST
 * `{ error }` returns from RLS rejection) log to console and never
 * cascade to the caller — telemetry is observability, not a correctness
 * guarantee.
 */
async function logApiCall(supabase: SupabaseClient, row: ApiCallRow): Promise<void> {
  try {
    const { error } = await supabase.from("api_calls").insert(row);
    if (error) {
      console.error(
        `api_calls insert failed for ${row.provider}/${row.endpoint}: ${error.message}`,
      );
    }
  } catch (err) {
    console.error(
      `api_calls insert threw for ${row.provider}/${row.endpoint}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
