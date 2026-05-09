---
date: 2026-05-09
topic: particle-api-shape-verification
applicability: U1 verification, U7 client implementation, U8 ingestion pipeline, U12 audio player
status: docs verified; live-API empirical tests pending laptop session
plan-ref: docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md
---

# Particle API Shape Verification (Round 1: Docs)

**Headline:** Both highest-impact contingencies from the plan's U1 cleared. The custom audio player is genuinely viable (raw `audio_url` exposed, word-level timestamps available). All foundational API details (auth, base URL, pagination, rate limits, entity slug conventions) captured in this doc. Six remaining empirical questions require live API calls from a laptop session.

---

## Method

The Claude Code sandbox blocks outbound HTTP to `docs.particle.pro`. Fetched the docs by proxy through Claude on iOS (consumer Claude with web access). Source pages read: `llms.txt` (index), `api-reference/introduction`, `api-reference/podcast-search/search-podcasts-by-content`, `api-reference/podcast-search/search-podcast-dialogue-for-entity-mentions`, `api-reference/entities/list-entities`, `api-reference/podcast-episodes/list-episodes`, `api-reference/podcast-clips/get-a-clip`, `api-reference/podcast-transcripts/get-clip-transcript`, `api-reference/podcast-transcripts/get-word-level-transcript`, plus the Concepts, Transcripts guide, and rate-limits error page.

Cross-checked against the eight verification questions in plan U1.

---

## Findings

### 1. Auth header format and base URL

- **Base URL:** `https://api.particle.pro` (the `/v1/` prefix lives in the endpoint paths, not the base).
- **Auth headers (two equivalent forms; `X-API-Key` recommended):**
  ```
  X-API-Key: $PARTICLE_API_KEY          ← recommended
  Authorization: Bearer $PARTICLE_API_KEY  ← equivalent, useful when routing through middleware
  ```
- **Public endpoints:** `/v1/embed/*` are intentionally public, no auth required (useful when serving the embed wrapper as a public preview).

### 2. Raw audio URL on `GET /v1/podcasts/clips/{id}` — CRITICAL CONTINGENCY CLEARED

- **`audio_url` field exists at the top level of the clip object.** Doc text: `"audio_url: Direct audio URL for this clip"`.
- **Field is NOT in the required array.** Required fields on a clip: `id`, `title`, `engagement_score`, `start_seconds`, `end_seconds`, `duration_seconds`. `audio_url` is optional and may be absent on some clips. **Implication: handle null at the type level.**
- **Episode object also has its own `audio_url`** — `"Direct audio stream URL"` for the full episode, returned by list-episodes. This is the natural fallback if the clip-level URL is missing (use episode-level URL + `start_seconds`/`end_seconds` for client-side range seek).
- **Format:** `"direct MP3 of the clip; embed it without slicing yourself"` (per segments-and-clips guide).

### 3. Word-level transcript shape — CRITICAL CONTINGENCY CLEARED

- **Endpoint:** `GET /v1/podcasts/episodes/{id}/transcript/words`
- **Returns** a `WordTranscriptResponse` with a `words` array of `TranscriptWord` objects:
  ```
  TranscriptWord:
    text:          string  (required)
    start_seconds: number  (required)
    end_seconds:   number  (required)
    speaker:       string  (OPTIONAL — speaker name or ID)
    type:          string  (OPTIONAL — "word" | "spacing" | "audio_event")
  ```
- **Field naming uses `_seconds` suffix**, not bare `start` / `end`. Update plan-references accordingly.
- **`speaker` is optional** — code must handle null/undefined.
- **`type` field can be non-word entries** (`"spacing"`, `"audio_event"`). When rendering for transcript-sync UI, filter out non-`"word"` entries OR render them with a different visual treatment.
- **Time-window filter:** the endpoint accepts `?start=` and `?end=` query params (in seconds) to extract a slice. Useful for long episodes — fetch only the segment window relevant to a clip.

### 4. Audio URL signing / TTL / Accept-Ranges — DOCS SILENT (empirical test pending)

- **Docs do not state explicitly** whether `audio_url` values are signed-with-expiry or permanent CDN paths.
- **Example URL shown in segments-and-clips guide** looks like a plain CDN path:
  ```
  https://cdn.particle.pro/podcast/episode/…/clip/audio/….mp3
  ```
- **No mention** of query-string signing parameters, expiry behavior, TTL, or `Accept-Ranges` support anywhere in the docs.
- **Mild positive signal:** absence of any "URLs expire" warning suggests stable CDN paths.
- **Empirical test required** during the laptop-session half of U1: HEAD request against a real `audio_url`, inspect `Cache-Control`, `Content-Length`, `Accept-Ranges`. If `Accept-Ranges: bytes` is present, the wavesurfer/scrubber seek behavior in the future v2 player is unblocked. If absent, MVP segment-level seek still works (full client-side load per clip).

### 5. Pagination

- **Cursor-based, not offset-based.** Uniform across all list endpoints.
- **Response envelope:**
  ```
  {
    "data": [...],
    "has_more": true,
    "cursor": "r.4gfFC7"
  }
  ```
- **Next page:** pass `?cursor=r.4gfFC7` on the follow-up request.
- **Cursors are opaque** — docs warn: *"treat them as strings; do not parse or construct them; do not assume any ordering of values across versions."*
- **Default page size:** 25. **Max via `limit`:** 100.
- **Implication for `lib/particle/client.ts` (U7):** add a generic paginate-helper that auto-walks `has_more` + `cursor` until exhausted; bound max pages as a safety knob.

### 6. Date filtering

- **`list-episodes`** uses `published_after` / `published_before`.
- **Search endpoints** (`/v1/podcasts/search`, `/v1/podcasts/mentions`) use `since` / `until`.
- **Format on both:** ISO 8601 — accepts date-only (`2024-01-01`) or full datetime (`2024-01-01T00:00:00Z`).
- **Implication:** the client must use different param names depending on endpoint family. Type the wrapper methods so this is enforced at compile time, not runtime.

### 7. Rate-limit headers — fully documented

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Max requests/minute for your plan |
| `X-RateLimit-Remaining` | Requests left in the current window |
| `X-RateLimit-Reset` | Seconds until the window resets |
| `Retry-After` | Seconds to wait (only on 429 responses) |

- **By plan tier:**
  - Free: 1,000 req/min
  - Paid (Growth and above): 10,000 req/min
- **Starter tier (this account):** treated as Free for rate-limit purposes — **1,000 req/min, plenty for our daily run** (worst-case ~150 reqs in burst).
- **429 response shape:** `error_code: "rate_limit_exceeded"`. Docs recommend exponential backoff.

### 8. Entity slug conventions

- **Slugging is kebab-case, lowercase, human-readable.**
- **People:** `firstname-lastname` (e.g. `sam-altman`, `kara-swisher`, `elon-musk`).
- **Organizations:** lowercased, hyphenated version of the name (e.g. `nvidia`, `openai`, `the-joe-rogan-experience`).
- **Predicted slugs for our 49ers universe (NOT yet confirmed against the live API):**
  - `brock-purdy`
  - `kyle-shanahan`
  - `san-francisco-49ers`
- **To confirm:** `GET /v1/entities?q=Brock+Purdy` returns the canonical `slug` and `id`. Run during the laptop-session half of U1.

---

## Plan implications

### Contingencies cleared (planning risk → resolved)

- **U1-A (no raw audio URL):** ✅ ruled out. `audio_url` exists.
- **U1-B (no word-level timestamps):** ✅ ruled out. `words[]` with `start_seconds`/`end_seconds` exists.

These were the two highest-impact contingencies in the plan. Both clearing means **the custom audio player path is unblocked** for v1 MVP (segment-level highlight) and v2 evolution (word-level highlight).

### Contingencies still pending (require live API calls)

- **U1-C (signed URL with TTL):** docs silent. HEAD test required.
- **U1-D (no Accept-Ranges):** docs silent. Ranged GET test required.
- **U1-E (entity coverage <60%):** unknown. Sample 10–15 roster names against `/v1/entities`.
- **U1-F (segment boundaries too coarse):** unknown. Visual review of `/v1/podcasts/search` results.
- **U1-G (catalog hits <50%):** unknown. Look up each of 31 curated podcasts.
- **U1-H (worst-case cost >50% credit):** uncomputable until a sample call returns real per-endpoint billing weight (verified by request-counter delta in dashboard).

### Plan code-level specifics now confirmed

These should flow into U7's `lib/particle/client.ts` and `lib/particle/types.ts`:

- **Base URL:** `https://api.particle.pro` (no `/v1` suffix in the constant; the path strings include it)
- **Auth header:** `X-API-Key` (preferred) — emit this; accept `Authorization: Bearer` as a config override if middleware demands it
- **Word-transcript types:** `start_seconds` / `end_seconds`, NOT bare `start` / `end`. `speaker` and `type` both optional in TS types.
- **Filter non-word entries** (`type: "spacing" | "audio_event"`) before rendering transcript UI — likely just drop them from the highlight loop, but they're still valid transcript content for context.
- **Pagination wrapper** auto-walks `has_more` + `cursor`. Max-pages safety knob for unbounded result sets.
- **Date params:** different across endpoints. Type the methods to enforce correct param at compile time.
- **Rate-limit handling:** read all four headers; back off on `Retry-After` from 429s. With 1,000 req/min on the Starter tier, our daily run has 6× headroom — generous.
- **Audio URL handling:** treat `audio_url` as `string | null | undefined` at the type level. When null, fall back to the parent episode's `audio_url` + the segment's `start_seconds` / `end_seconds` for client-side seeking.
- **Entity lookup pattern:** start with predicted slugs (`brock-purdy`, `kyle-shanahan`, `san-francisco-49ers`); on 404 fall through to `/v1/entities?q=...` for resolution and cache the canonical slug.

### Specific updates that flow into other plan units

- **U6 (Niners universe):** seed the universe with predicted slugs as the default; add a startup script that resolves any missing slugs via `/v1/entities?q=...` and updates the config. The `nameFallbacks` field stays in the schema as a safety net.
- **U7 (Particle client):** use the field names captured above; cursor-based pagination; rate-limit-aware retry.
- **U12 (audio player):** the MVP-first decision still holds (ship segment-level highlight in v1), but the contingency block in U12 can be downgraded — the embed-wrapper fallback (contingency A) is no longer plausible. Word-level evolution path (v2) is fully supported by the API.

---

## Remaining U1 work (laptop session)

In rough priority order:

1. **Generate Particle API key** in dashboard (if not already done in this verification round).
2. **HEAD test on a real `audio_url`** — `curl -I` against one returned clip URL. Capture `Cache-Control`, `Accept-Ranges`, `Content-Length`. Resolves U1-C and U1-D.
3. **`GET /v1/entities?q=Brock+Purdy`** — confirm slug + capture canonical `id`. Repeat for `Kyle Shanahan`, `San Francisco 49ers`.
4. **Sample 10–15 more 49ers roster names** against `/v1/entities` — measure coverage rate. Resolves U1-E.
5. **`GET /v1/podcasts/search?q=49ers&limit=20`** — measure typical segment length distribution. Resolves U1-F.
6. **For each of the 31 curated podcasts** in `config/podcasts.ts`, look up the Particle slug. Measure catalog hit rate. Resolves U1-G.
7. **Cost dry-run** — given the verified rate-limit math (1k/min) and per-endpoint costs (~$0.004/req list), compute worst-case 3-day seed spend against the $10 starter credit. Document in `docs/solutions/2026-05-09-particle-cost-estimate.md`. Resolves U1-H.

---

## What this enables

With the docs-verification half of U1 complete, the plan can move forward more confidently:

- **Phase A** (foundation/verification): U1 needs only the live-API tests above (~30–60 min on laptop). U2–U4 unchanged.
- **Phase B** (data layer): proceed as planned with the verified slug conventions.
- **Phase C** (ingestion): proceed as planned with the verified pagination + rate-limit + auth header specifics.
- **Phase D** (UI): the MVP audio player can be built knowing the audio URL field exists; the v2 word-level evolution has a documented data path.

The plan does not need a structural revision based on these findings — it accommodated the unknowns through explicit contingencies. Now ~half of those contingencies have collapsed to a known answer; the other half remain pending laptop verification.
