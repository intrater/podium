-- Podium v1 — prompt-version tagging on segments.
--
-- U5 of the cost-optimization plan: future prompt changes auto-trigger
-- re-processing on the next daily run without manual `?force=1` ceremony.
-- The pipeline's cross-run dedupe filter checks the version on each
-- already-persisted segment; rows whose version doesn't match the
-- current `EPISODE_EXTRACTION_PROMPT_VERSION` constant in
-- `lib/anthropic/types.ts` are treated as "unprocessed" and flow back
-- through the extraction step.
--
-- Backfill: existing segments (everything written before this migration)
-- are tagged as `'legacy'` so the first run after deploy doesn't see
-- NULL version values, which would cause unpredictable comparisons under
-- PostgREST equality semantics. The first run after this migration will
-- re-process every legacy segment exactly once (a known cost spike — see
-- plan U5 §First-deploy cost spike). After that, only intentional
-- version bumps trigger re-processing.
--
-- RLS posture unchanged. The new column is operational metadata.

alter table segments
  add column if not exists prompt_version text;

-- One-time backfill so the post-deploy filter behaves deterministically.
-- After this update, every existing row has a non-NULL version distinct
-- from the new "v1" constant — they'll be re-processed on the next run.
update segments
  set prompt_version = 'legacy'
  where prompt_version is null;

comment on column segments.prompt_version is
  'Version string of the extraction prompt that produced this row. When the prompt changes intentionally, bump EPISODE_EXTRACTION_PROMPT_VERSION in lib/anthropic/types.ts to trigger re-processing on the next ingest run.';
