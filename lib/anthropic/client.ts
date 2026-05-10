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

import { env } from "@/lib/env";

import {
  AnthropicTransientError,
  ANTHROPIC_MODEL,
  computeCallCost,
  type AnthropicUsage,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface AnthropicClientOptions {
  supabase: SupabaseClient;
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
  const sdk: Pick<Anthropic, "messages"> =
    options.sdk ??
    new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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
