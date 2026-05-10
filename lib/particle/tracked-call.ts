/**
 * Cost-tracked fetch wrapper for the Particle API.
 *
 * Every call writes one row to `api_calls` per attempt, with the canonical
 * endpoint name, the cost charged from the per-tier price table, and
 * metadata including response status, attempt count, and rate-limit
 * headers. The row lands even when the call fails so cost-conscious
 * accounting stays accurate.
 *
 * Retry policy:
 *   - 429: honor `Retry-After` (capped at 60s), otherwise exponential
 *     backoff with jitter. Up to 3 total attempts.
 *   - 408 / 5xx: exponential backoff with jitter. Up to 3 total attempts.
 *   - 401: terminal — no retry. Throws `ParticleAuthError`.
 *   - 422: terminal validation error — no retry. Throws `ParticleSchemaError`.
 *   - AbortError (caller cancelled): terminal. Re-throws.
 *   - Network failures: surfaced as `ParticleTransientError` after retries.
 *
 * Telemetry is best-effort: a Supabase write failure (rejected promise)
 * is caught and dropped so it never replaces the actual Particle outcome.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

import {
  PARTICLE_PRICE_USD,
  ParticleAuthError,
  ParticleRateLimitError,
  ParticleSchemaError,
  ParticleTransientError,
  type ParticleTier,
} from "./types";

const BASE_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 5_000;
const MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRY_AFTER_SECONDS = 60;

// 4xx codes that represent transient infrastructure conditions worth retrying.
// 408 = Request Timeout; 425 = Too Early.
const RETRIABLE_4XX = new Set([408, 425]);

/** Narrow fetcher signature — compatible with `globalThis.fetch` for callers. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface TrackedCallOptions {
  /** Canonical endpoint name (e.g., `podcasts.search`). */
  endpoint: string;
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  tier?: ParticleTier;
  /** Caller-supplied abort signal (e.g., the request's AbortSignal). */
  signal?: AbortSignal;
  /** Hard timeout per attempt. Defaults to 30s. */
  timeoutMs?: number;
  /** Service-role client for the api_calls write. */
  supabase: SupabaseClient;
  /** Inject a fetch (used by tests). Defaults to global fetch. */
  fetcher?: Fetcher;
  /** Inject a sleeper (used by tests). Defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export async function trackedCall<T>(opts: TrackedCallOptions): Promise<T> {
  const tier = opts.tier ?? "standard";
  const fetcher = opts.fetcher ?? (globalThis.fetch as Fetcher);
  const sleeper = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(fetcher, opts, timeoutMs);
    } catch (err) {
      // Caller-initiated abort is terminal — never retry.
      if (isAbortError(err) && opts.signal?.aborted) {
        await logCall(opts, undefined, attempt, 0);
        throw err;
      }

      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await logCall(opts, undefined, attempt, 0);
        await sleeper(backoffDelay(attempt));
        continue;
      }
      // Network failure exhausted retries — log a $0 call and surface as
      // transient.
      await logCall(opts, undefined, attempt, 0);
      throw new ParticleTransientError(
        opts.endpoint,
        `Network failure after ${attempt} attempts: ${errorMessage(err)}`,
        0,
      );
    }
    lastResponse = response;

    // 401 — terminal. Particle does not charge credits on auth failures.
    if (response.status === 401) {
      await logCall(opts, response, attempt, 0);
      throw new ParticleAuthError(
        opts.endpoint,
        `Particle ${opts.endpoint} returned 401 — API key rejected`,
      );
    }

    // 422 — validation error. Caller-side bug; retrying won't fix it.
    if (response.status === 422) {
      const cost = PARTICLE_PRICE_USD[tier];
      await logCall(opts, response, attempt, cost);
      const detail = await readErrorDetail(response);
      throw new ParticleSchemaError(
        opts.endpoint,
        `Particle ${opts.endpoint} returned 422 validation error${detail ? `: ${detail}` : ""}`,
      );
    }

    // 429 — honor Retry-After (clamped), then retry.
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      const delayMs = retryAfter !== undefined
        ? Math.min(retryAfter, MAX_RETRY_AFTER_SECONDS) * 1_000
        : backoffDelay(attempt);
      await logCall(opts, response, attempt, 0);
      await sleeper(delayMs);
      continue;
    }

    // 408 / 425 / 5xx — retry with backoff.
    if (
      attempt < MAX_ATTEMPTS &&
      (response.status >= 500 || RETRIABLE_4XX.has(response.status))
    ) {
      await logCall(opts, response, attempt, 0);
      await sleeper(backoffDelay(attempt));
      continue;
    }

    // 429 on the final attempt — surface as rate-limit (retries exhausted).
    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      await logCall(opts, response, attempt, 0);
      throw new ParticleRateLimitError(
        opts.endpoint,
        `Particle ${opts.endpoint} rate-limited; exhausted ${MAX_ATTEMPTS} attempts`,
        retryAfter !== undefined ? Math.min(retryAfter, MAX_RETRY_AFTER_SECONDS) : undefined,
      );
    }

    // Anything else non-2xx — log the cost (request hit the server) and
    // surface as transient.
    if (!response.ok) {
      const cost = PARTICLE_PRICE_USD[tier];
      await logCall(opts, response, attempt, cost);
      throw new ParticleTransientError(
        opts.endpoint,
        `Particle ${opts.endpoint} returned HTTP ${response.status}`,
        response.status,
      );
    }

    // 2xx — log + parse + return.
    const cost = PARTICLE_PRICE_USD[tier];
    await logCall(opts, response, attempt, cost);
    let parsed: T;
    try {
      parsed = (await response.json()) as T;
    } catch (err) {
      throw new ParticleSchemaError(
        opts.endpoint,
        `Particle ${opts.endpoint} returned non-JSON body`,
        err,
      );
    }
    return parsed;
  }

  // Unreachable in practice — every loop iteration either returns or
  // throws. The throw below satisfies the type checker.
  throw new ParticleTransientError(
    opts.endpoint,
    `Particle ${opts.endpoint} fell through retry loop (last status ${lastResponse?.status ?? "n/a"}, last error ${errorMessage(lastError)})`,
    lastResponse?.status ?? 0,
  );
}

async function fetchWithTimeout(
  fetcher: Fetcher,
  opts: TrackedCallOptions,
  timeoutMs: number,
): Promise<Response> {
  const internalController = new AbortController();
  const timeoutId = setTimeout(() => internalController.abort(), timeoutMs);

  // If the caller passed a signal, propagate its abort to the internal controller.
  const onCallerAbort = () => internalController.abort();
  opts.signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    return await fetcher(opts.url, {
      method: opts.method ?? "GET",
      headers: {
        "X-API-Key": env.PARTICLE_API_KEY,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: internalController.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function backoffDelay(attempt: number): number {
  const exp = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return Math.min(exp + jitter, MAX_BACKOFF_MS);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const cloned = response.clone();
    const body = await cloned.json();
    if (body && typeof body === "object" && "detail" in body) {
      return String((body as { detail: unknown }).detail);
    }
  } catch {
    /* swallow — error detail is best-effort */
  }
  return undefined;
}

async function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logCall(
  opts: TrackedCallOptions,
  response: Response | undefined,
  attempt: number,
  costUsd: number,
): Promise<void> {
  const metadata: Record<string, unknown> = {
    attempt,
    method: opts.method ?? "GET",
  };
  if (response) {
    metadata.status = response.status;
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");
    if (remaining !== null) metadata.rate_limit_remaining = Number(remaining);
    if (reset !== null) metadata.rate_limit_reset = Number(reset);
  }
  // Best-effort: a Supabase write failure (network blip, transport error)
  // must never replace the actual Particle outcome the caller is waiting on.
  try {
    await opts.supabase.from("api_calls").insert({
      provider: "particle",
      endpoint: opts.endpoint,
      tier: opts.tier ?? "standard",
      cost_usd: costUsd,
      metadata,
    });
  } catch (err) {
    console.error(`api_calls insert failed for ${opts.endpoint}:`, errorMessage(err));
  }
}
