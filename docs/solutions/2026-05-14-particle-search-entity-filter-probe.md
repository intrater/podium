---
title: Particle search entity_id filter — live probe
date: 2026-05-14
kind: bug-or-behavior-verification
status: verified
---

# Particle search `entity_id` filter — live probe

The PR landing U2 of [2026-05-14-001-refactor-particle-api-optimizations-plan.md](../plans/2026-05-14-001-refactor-particle-api-optimizations-plan.md) shipped the `entityId`/`companyId` surface on `searchByContent` per docs, with consumer-side use gated on a live probe (because the 2026-05-09 shape verification found no `entity_id` field on response payloads, hinting the filter might be a no-op).

This is the probe.

## Method

Two `/v1/podcasts/search` calls against the live API, same `semantic_search="quarterback play"`, same 7-day `since` window, `limit=25`. Second call adds `entity_id=1GmOP1C2zBHewl4l6q` (Brock Purdy's Particle ID).

## Result

| Call | Status | Returned | Unique episodes |
|---|---|---|---|
| Unfiltered | 200 | 15 | 14 |
| `entity_id=brock-purdy` | 200 | 7 | 2 |

Of the 2 filtered episodes, **1 also appears in the unfiltered set**. The other was surfaced *because* of the entity filter — `entity_id` is changing the ranking, not just post-filtering. Both filtered results are Purdy-relevant (titles include "QB development, w/ Coach Paul Callahan" and similar).

## Implication

The filter is real and useful. Consumer-side rollout is safe.

Concrete next steps available without further verification:
- Storyline searches in `lib/ingest/pipeline.ts:144-159` could optionally accept an `entityId` parameter to scope the storyline to one player (e.g. "offseason moves" + `entity_id=brock-purdy`). Today the storyline net is global per team — narrowing it would reduce off-topic candidates and Claude cost.
- Investigative tools / inspectors could expose entity-scoped search for the operator.

No plan currently calls for this — flagged here so a future planning pass can pick it up.
