-- Podium v1 — store the podcast cover image URL.
--
-- Particle returns `image_url` on every podcast detail GET. Persisting
-- it at seed time means the digest UI can render real cover art on
-- cards instead of the letter-avatar placeholder. Nullable so existing
-- rows tolerate the new column until the next seed run backfills them.

alter table podcasts
  add column image_url text;

comment on column podcasts.image_url is
  'Podcast cover image URL from Particle. Populated at seed time via getPodcastBySlug. Nullable; UI falls back to a letter avatar when absent.';
