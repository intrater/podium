-- Podium v1 — indexes.
--
-- Single-user v1 makes most queries small, but the indexes are written to the
-- multi-user shape so they continue to serve the v3 query plan unchanged.

-- User-scoped lookups (digest fetch, recent-cards window).
create index cards_user_surfaced_idx
  on cards (user_id, surfaced_at desc);
create index feedback_user_idx
  on feedback (user_id, created_at desc);

-- Card → episode → segment fan-out for digest rendering.
create index cards_episode_idx       on cards (episode_id);
create index segments_episode_idx    on segments (episode_id);
create index episodes_podcast_pub_idx on episodes (podcast_id, published_at desc);

-- Ingestion-time dedupe (hot path under daily worker).
create index segments_particle_id_idx
  on segments (particle_segment_id) where particle_segment_id is not null;

-- Daily worker sharding state (refined in U8).
create index ingest_jobs_run_shard_idx
  on ingest_jobs (run_id, shard_index);

-- Cost telemetry rollups.
create index api_calls_ts_provider_idx on api_calls (ts desc, provider);
