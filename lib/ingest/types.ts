/**
 * Ingest pipeline shared types.
 *
 * Shared between the Node-flavored pipeline (`lib/ingest/pipeline.ts`) and
 * the Deno-flavored mirror (`supabase/functions/daily-digest/_pipeline-deno.ts`)
 * — both implement `runIngestPipeline(input)` against the same input/output
 * shapes so a single integration test fixture can drive either runtime.
 */

/**
 * Candidate-episode discovery strategy. "mentions" walks
 * /v1/podcasts/mentions per entity (premium). "list-episodes" walks
 * /v1/podcasts/episodes per entity (standard) and asks Claude to find
 * moments freely from the full transcript.
 */
export type DiscoveryMode = "mentions" | "list-episodes";

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
  /** Discovery strategy; defaults to "mentions". See `DiscoveryMode`. */
  discoveryMode?: DiscoveryMode;
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
  /**
   * Episodes the deadline guard skipped because the wall-clock budget
   * was already exhausted. They stay un-persisted at the current
   * prompt_version, so the next run picks them up via filterAlreadyPersisted.
   */
  episodesSkippedByDeadline: number;
  /**
   * Voice-position rows written this run. Append-only and bounded by
   * the UNIQUE(voice_id, team_id, topic_key, segment_id) constraint,
   * so re-extracts don't inflate this. Only Tier-A episodes
   * contribute; Tier B/C episodes never write voice positions.
   */
  voicePositionsWritten: number;
}

export interface PipelineDeps {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  particle: import("@/lib/particle/client").ParticleClient;
  anthropic: import("@/lib/anthropic/client").AnthropicClient;
  /** PODIUM_USER_ID — every card gets attributed to this user in v1. */
  userId: string;
}
