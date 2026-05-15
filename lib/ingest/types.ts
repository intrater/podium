/**
 * Ingest pipeline shared types.
 *
 * Shared between the Node-flavored pipeline (`lib/ingest/pipeline.ts`) and
 * the Deno-flavored mirror (`supabase/functions/daily-digest/_pipeline-deno.ts`)
 * — both implement `runIngestPipeline(input)` against the same input/output
 * shapes so a single integration test fixture can drive either runtime.
 */

export interface IngestPipelineInput {
  teamId: string;
  /**
   * Particle podcast IDs the pipeline should scan for fresh episodes —
   * one shard's slice of the curated catalog. A daily run with N=31
   * podcasts and shard size of 10 produces 4 shards.
   */
  podcastIds: readonly string[];
  /** ISO 8601 lower bound on episode publish time. */
  sinceTimestamp: string;
  /** ISO 8601 upper bound on episode publish time. Defaults to now() at the call site. */
  untilTimestamp?: string;
  /**
   * Optional shard identifier — when present, the pipeline writes
   * progress against an existing `ingest_jobs` row. Absent during
   * the manual single-shard trigger path.
   */
  ingestJobId?: string;
  /**
   * Run identifier shared across all shards of the same daily run.
   * Tied through to `system_alerts.payload.run_id`.
   */
  runId?: string;
  /**
   * Bypass the "already in DB" dedup filter — re-fetch transcripts and
   * re-summarize every found segment. Used during prompt iteration so
   * the same episodes can be re-summarized after a prompt change
   * without manual DB cleanup. Default: false.
   */
  forceReprocess?: boolean;
  /**
   * Cap the number of episodes processed in this run. Set via the
   * `?limit=N` query param on POST /api/ingest. Used during prompt
   * iteration to keep validation runs cheap and fast (5-episode sample
   * is plenty for content-shape sign-off). Absent = no cap.
   */
  maxEpisodes?: number;
  /**
   * Candidate-episode discovery path. "mentions" (default) walks
   * /v1/podcasts/mentions per entity (premium tier) and surfaces moment
   * windows for Claude to anchor on. "list-episodes" walks
   * /v1/podcasts/episodes per entity (standard tier) and asks Claude to
   * identify its own moments from the full transcript. Operator-driven
   * A/B per the 2026-05-14 Particle API optimizations plan.
   */
  discoveryMode?: "mentions" | "list-episodes";
}

export interface IngestPipelineOutput {
  episodesPersisted: number;
  segmentsPersisted: number;
  cardsPersisted: number;
  /** Segments that the summarizer marked off-topic (`is_team_relevant: false`). */
  segmentsRejectedOffTopic: number;
  /** Segments that failed summarization across both retries. */
  segmentsFailedSummary: number;
  /** Cost-tracked Particle call count (informational; api_calls is the source of truth). */
  particleCallsAttempted: number;
  /** Cost-tracked Anthropic call count. */
  anthropicCallsAttempted: number;
}

export interface PipelineDeps {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  particle: import("@/lib/particle/client").ParticleClient;
  anthropic: import("@/lib/anthropic/client").AnthropicClient;
  /** PODIUM_USER_ID — every card gets attributed to this user in v1. */
  userId: string;
}
