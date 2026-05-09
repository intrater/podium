---
date: 2026-05-09
topic: podium-v1-49ers-podcast-digest
---

# Podium v1 — 49ers Podcast Digest

## Summary

Podium is a daily web-app digest that surfaces only the parts of sports podcasts relevant to a fan's favorite teams — turning hours of content into minutes of focused, scannable takes. v1 ships for one user (the builder), one team (the SF 49ers), as a card-per-episode morning digest powered by the Particle podcast intelligence API.

---

## Problem Frame

Sports fans rely on podcasts as their best source for analysis of their favorite teams, but podcast volume has exploded faster than anyone's listening time. The pain has two distinct shapes:

- **Team-specific shows** (e.g. Niners Nation): nearly every minute is relevant, but there are too many full episodes to listen to in a week. The fan needs a way to triage which episodes are worth the time.
- **National shows** (e.g. The Mina Kimes Show, Bill Simmons Pod, PFT Live): a 90-minute episode may include 90 seconds about the fan's team — buried somewhere inside, with no way to know if it's there or what was said. The fan misses the take entirely or wastes 90 minutes scrubbing for it.

The builder has tried to solve this multiple times in the past. Each attempt stalled on the same wall: building reliable ingestion infrastructure (RSS polling, transcription at scale, segment-boundary detection) was its own multi-month project before any of the actual product work could start. The recent emergence of the Particle API — which already provides diarized transcripts, entity-mention search, semantic search, and engagement-scored clips across the public podcast catalog — collapses that infrastructure layer and makes the problem tractable for the first time.

---

## Actors

- A1. **Fan** — the primary user. Follows specific teams, has limited time, wants to keep up with podcast takes about their teams without listening to every episode in full.
- A2. **Daily ingestion worker** — runs once each morning. Queries Particle, dedupes results, summarizes via LLM, persists cards to the database.
- A3. **Team universe (config)** — a per-team configuration object: entity slugs (team, roster, coaches) plus a small set of storyline-shaped semantic-search queries. Defines what "team-relevant content" means for that team.
- A4. **Particle API** — external podcast intelligence service. Source of transcripts, search results, entities, episodes, and clips.
- A5. **Summarization LLM (Claude Haiku 4.5)** — turns transcript snippets into the unified summary + pull quotes + bullets format.
- A6. **Future fans (deferred)** — additional users with their own team selections, eventually across multiple sports. Not active in v1; data model accommodates them from day one.

---

## Key Flows

- F1. **Daily digest consumption (Fan-facing)**
  - **Trigger:** Fan opens Podium in the browser in the morning.
  - **Actors:** A1
  - **Steps:** Fan loads the app → sees a list of cards (one per podcast episode that contained 49ers-relevant content in the last 24h) → scans each card's summary and total relevant time → optionally expands a card to see segments, pull quotes, and play clips with synchronized transcript → optionally flags cards via feedback affordances.
  - **Outcome:** Fan has consumed the day's relevant podcast takes in minutes instead of hours, with no episode missed.
  - **Covered by:** R4, R5, R6, R9, R17

- F2. **Daily ingestion (background)**
  - **Trigger:** Cron schedule (~6am local).
  - **Actors:** A2, A3, A4, A5
  - **Steps:** Worker reads the team universe config → issues parallel Particle queries (entity-mention search per entity; semantic search per storyline; date-filtered episode scan over curated podcast slugs) → unions results and dedupes by segment → fetches segment transcripts → calls Claude Haiku per segment for summary + quotes + bullets → groups segments by episode → persists cards to Supabase.
  - **Outcome:** When the Fan opens the app, the day's digest is ready.
  - **Covered by:** R1, R2, R3, R7, R8, R16

- F3. **Relevance feedback loop**
  - **Trigger:** Fan clicks "Not relevant" / "Not substantive" / "Love this" on a card.
  - **Actors:** A1
  - **Steps:** Click recorded → feedback row written keyed on (segment_id, surfacing_entity_or_query, user_id, verdict, timestamp) → flagged cards optionally hidden from the Fan's feed → feedback aggregated for later tuning of the universe config and per-show weighting.
  - **Outcome:** The Fan's feed gets more accurate over time; the team universe config improves with use.
  - **Covered by:** R9, R10, R11, R12

- F4. **Audio playback with synchronized transcript**
  - **Trigger:** Fan clicks play on a clip inside an expanded card.
  - **Actors:** A1
  - **Steps:** Custom audio player loads the clip's audio URL and word-level transcript from Particle → playback begins → transcript line currently being spoken is highlighted in real time → Fan can click any transcript line to seek to that point.
  - **Outcome:** Fan can listen to the actual quote in context, with the visual feel of a designed product (not a black-box embed).
  - **Covered by:** R6, R17

---

## Requirements

**Source coverage**

- R1. v1 ships with the SF 49ers as the only active team. The data model and ingestion logic accommodate adding other teams (and other sports) by adding a row plus a universe config — no code changes.
- R2. The daily run pulls from a curated list of ~31 podcasts (mix of Niners-specific shows like *Niners Nation* and national shows like *The Mina Kimes Show*) AND from the full Particle library. The curated list is the default-rendered surface in v1; the broader "discovery" surface is one config flag away (Phase 2). The exact list is finalized during planning and lives in `config/podcasts.ts` once the project scaffolds.
- R3. The "Niners universe" is a config object containing: team name(s) and entity slug(s); the full active roster as entity slugs; coaching staff entity slugs; and 4–6 storyline-shaped semantic search queries (e.g. "49ers cap space and contracts", "49ers draft", "NFC West race").

**Content surface**

- R4. Each unit of surfaced content is rendered in a unified format: short summary + pull quotes + bullets. The format does not change based on segment length — a 60-second mention and a 45-minute deep dive use the same shape, with depth scaling naturally.
- R5. Content is grouped card-per-episode. Each card displays: episode title, podcast name, total team-relevant time inside the episode (e.g. "8 minutes across 3 segments"), an episode-level summary across all relevant segments, and the segments themselves listed inside.
- R6. Each segment has a custom audio player (not Particle's default `<particle-podcast-clip>` embed). The player shows a synchronized transcript with the line currently being spoken highlighted, and supports click-to-seek.

**Cadence**

- R7. The daily ingestion worker runs once per morning (default ~6am local time). Schedule is a single config knob — increasing cadence (twice-daily, every 4 hours, hourly) requires no code changes.
- R8. Each daily run pulls "everything new since the last successful run" via Particle's date-filtered episode queries. Re-runs and missed runs do not produce duplicates.

**Quality and tuning**

- R9. Each digest card has feedback affordances: "Not relevant", "Not substantive", "Love this". Feedback is captured per `(segment_id, surfacing_entity_or_query, user_id, verdict, timestamp)`.
- R10. Phase 1 of relevance intelligence is passive collection — feedback is logged for periodic manual review and config tuning. No automatic filter changes.
- R11. Phase 2 introduces per-show automatic weighting — shows with high not-relevant rates are deprioritized in ranking via SQL aggregation, no ML required.
- R12. Phase 3 introduces an LLM-based borderline-case relevance check — accumulated feedback is used as few-shot examples for Claude when an incoming card is borderline.

**Multi-user / multi-team / multi-sport readiness**

- R13. The data model supports multiple users from day one. Every user-facing row carries a `user_id`; row-level security scopes feedback and (if/when added) per-user preferences.
- R14. The data model supports multiple teams across multiple sports. A team has a `team_id`, `sport`, `slug`, and a reference to its universe config.
- R15. v1 ships with auth stubbed (single-user mode, no sign-in required). Auth via Supabase magic-link is one config flip away — not built in v1, but no rework required to enable it.

**Sports-aware disambiguation**

- R16. The system handles sports-name ambiguity ("Giants" can mean SF baseball or NY football; "Warriors" can mean NBA or NCAA; "Sharks" can mean SJ NHL or college). It uses the user's followed-team sport context plus podcast-topic context to disambiguate before surfacing content.

**Design and feel**

- R17. Podium is a design-led product. Visual polish — typography, color, layered motion, page transitions, the feel of the custom audio player — is treated as a first-class requirement, not an afterthought. The bar is "this looks and feels intentionally designed", not "this is functional and unstyled".

---

## Acceptance Examples

- AE1. **Covers R4, R5.** Given Mina Kimes spent 90 seconds discussing the 49ers inside an otherwise-unrelated 90-minute episode, when the daily run completes, a card for that episode appears in the digest showing only the 49ers-relevant summary, quotes, and bullets — not a summary of the whole episode.
- AE2. **Covers R5.** Given a Niners Nation episode that is entirely about the 49ers, when the daily run completes, a single card appears with an episode-level summary plus the constituent segments listed inside — same card shape as AE1, more density.
- AE3. **Covers R9.** Given the Fan clicks "Not relevant" on a card, when they refresh the feed, that card no longer appears. The feedback row persists and is available to later tuning passes.
- AE4. **Covers R16.** Given the Fan only follows the SF 49ers, when a baseball podcast says "the Giants are looking shaky on defense" referring to the SF Giants, that segment is not surfaced — the system knows "Giants" in a baseball context is not the user's team.
- AE5. **Covers R8.** Given the daily run is missed for two days (e.g. a deployment outage), when it next runs, it pulls the prior 48h of new episodes — not just the prior 24h — and produces no duplicates against any previously-stored cards.
- AE6. **Covers R6.** Given the Fan clicks play on a clip and then clicks a line midway through the transcript, when they click, playback seeks to the timestamp of that line.

---

## Success Criteria

**Human outcome**

- The Fan opens Podium daily and feels they're keeping up with their teams' coverage without listening to every podcast in full.
- Time from "a 49ers take landed in a podcast" to "Fan has read or heard it" is under 24 hours by default, under 5 minutes once the Fan opens the app.
- Cards consistently feel useful — the Fan's "Not relevant" rate trends down over weeks of use, not up.
- The Fan looks at Podium and feels it is well-designed — visually polished, smooth, distinct. Not generic AI scaffolding.

**Downstream-agent / handoff**

- A new contributor (or a future Claude session) can add a team (e.g. SF Giants) by adding a row + universe config file — no code changes, no migrations.
- The ingestion, summarization, and rendering layers are decoupled enough that swapping any one of them (Particle for another provider; Haiku for another model; Vercel for another host) does not require rewriting the others.
- The plan that follows this brainstorm can be executed by `/ce-work` without inventing product behavior or scope.

---

## Scope Boundaries

### Deferred for later

- Additional teams beyond the 49ers (Giants, Warriors, Sharks). Architecture supports them; v1 ships only one to validate the loop.
- Multi-team UI chrome — section headers per team, etc. Only meaningful once v1 expands.
- Auth flows beyond stub (magic link via Supabase). One flag away.
- "Discovery" surface that pulls from the full Particle library (not just curated podcasts). Architecture supports it; v1 renders the curated surface only.
- Auto-refresh of roster from external NFL data (ESPN, Pro Football Reference). v1 uses a manually-maintained roster config.
- Phase 2 feedback intelligence (per-show automatic weighting).
- Phase 3 feedback intelligence (LLM borderline-case relevance check).
- Email digest, push notifications, stitched personal-podcast-feed delivery. v1 is web-app-only.
- Other content sources mentioned in the original vision (YouTube clips, tweets, articles).
- Mobile-native apps. v1 is responsive web only.

### Outside this product's identity

- Hosting or re-hosting podcast audio. Podium points back to the source episode and embeds clips via Particle; it is not a podcast publishing platform.
- A general-purpose podcast app or "Spotify for sports." Podium is a *digest* — its identity is reducing volume to relevance, not browsing or replacing the listening experience.
- A breaking-news ticker. Cadence is intentionally daily (with room to tighten). Twitter is better for real-time alerts and we are not competing with it.
- Discovery-driven content ("what podcasts should I follow?"). The product assumes the user already has shows they care about and a team they follow.
- Editorial content. Podium summarizes what others said; it does not generate original sports analysis or opinion.

---

## Key Decisions

- **49ers-only for v1, multi-team / multi-sport architecture from day one.** Validate the loop with one team before scaling. Architecture cost of multi-team-ready is small; rework cost of single-team-only is large.
- **Particle as the podcast intelligence layer.** Eliminates the previously-blocking transcription, segmentation, and audio-hosting infrastructure. Enables features (entity-mention search, semantic search, engagement-scored clips, diarized transcripts) that would take months to replicate.
- **Curated podcast list as the default surface; full Particle library as a deferred "discovery" view.** Get curation quality right first; expand surface area later. Both paths are query-parameter changes against the same API.
- **Daily morning cadence; cadence-as-config.** Ships fastest. Tighten when the daily rhythm proves the value and breaking-news gap becomes painful.
- **Card-per-episode digest shape.** Directly answers the original "is this 90-minute episode worth my time?" question in one glance. Handles both short national mentions and long team-specific deep-dives in a single UI.
- **Unified output format (summary + pull quotes + bullets) regardless of segment length.** One mental model. Density scales with content length naturally.
- **"Niners universe" is config (entities + storylines), not code.** Enables per-team scaling. A new team is a new config file.
- **Multi-phase feedback intelligence (passive log → per-show SQL weighting → LLM check).** Get smarter with use; pay for ML only after there's data to make it worthwhile.
- **Custom audio player, not Particle's `<particle-podcast-clip>` embed.** A black-box embed is incompatible with a design-led product. Custom player with synchronized transcript also unlocks the click-to-seek interaction.
- **Stack: TypeScript + Next.js (App Router) + Tailwind v4 + shadcn/ui + Motion on Vercel; Supabase Postgres + Auth; Claude Haiku 4.5 for summarization.** Leverages user's existing paid Vercel Pro and Supabase Pro accounts. shadcn/ui is copy-into-repo (full source ownership for restyling). Motion and Tailwind v4 give the design surface needed for R17.
- **Compound-engineering plugin installed at `.claude/`.** Workflow tooling (STRATEGY → BRAINSTORM → PLAN → WORK) travels with the repo so any future session in this codebase has the same skills available.

---

## Dependencies / Assumptions

- Particle API access with sufficient pricing tier and rate limits to cover daily queries: ~30 entity-mention searches + ~6 semantic searches + episode-listing across the ~31 curated podcasts. Account is on the Starter tier ($10 starter credit, ~$0.004/req list price, no payment method on file as of planning) — plan must be cost-conscious by default and surface telemetry in-app.
- Anthropic API access for Claude Haiku 4.5 (with prompt caching to control cost).
- User maintains active paid Vercel Pro and Supabase Pro subscriptions for the lifetime of the product.
- Particle's knowledge graph contains 49ers-relevant entities (team slug, current roster players, coaches Shanahan and Lynch). High confidence given Particle's coverage scope, but to be verified at planning time against actual API responses.
- Particle exposes raw audio URLs and word-level timestamps per clip — required for the custom audio player with synchronized transcript. To be verified at planning time against the actual `Get a clip` and `Get word-level transcript` endpoint responses.
- The Particle API key was pasted into the prior session's chat history. It must be rotated and stored only in `.env.local` (gitignored) before any code consumes it.

---

## Outstanding Questions

### Resolve Before Planning

- [Affects R2, R8] [User decision] Confirm the curated 20-podcast list — both human names and Particle podcast slugs. Without this, the daily worker has nothing to query.
- [Affects assumptions] [User decision] Confirm Particle pricing tier and any rate limits on the user's account. Determines whether the daily-run query strategy must be cost-conscious from day one (e.g. cache aggressively, batch entity searches).

### Deferred to Planning

- [Affects R6] [Needs research] Verify Particle API exposes raw audio URLs and word-level timestamps sufficient for a custom player with synchronized transcript. Look at `Get a clip`, `Get clip embed`, and `Get word-level transcript` endpoints.
- [Affects R3] [Technical] Determine the exact "Niners universe" config shape — file format, entity slug vs. name resolution, storyline phrasing conventions, weighting per source if any.
- [Affects R8] [Technical] Decide dedupe strategy when an episode matches multiple entities (segment-level dedupe vs. episode-level dedupe vs. union-with-attribution).
- [Affects R16] [Technical] Determine sport disambiguation mechanism — Particle entity slugs that are already sport-aware vs. our own filter layer that classifies by surrounding context.
- [Affects R7] [Technical] Choose the daily-worker runtime — Vercel Cron vs. Supabase Edge Function vs. external scheduler. Trade-offs include cold-start time, max execution duration, and cost.
- [Affects R13–R15] [Technical] Specific Supabase row-level security policy shape for per-user feedback in single-user mode that gracefully extends to multi-user without policy rewrites.
- [Affects R17] [Needs research] Concrete reference points for the visual direction — sample apps, design systems, or specific motion patterns the user wants Podium to feel like.
