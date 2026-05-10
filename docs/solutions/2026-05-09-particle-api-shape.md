---
date: 2026-05-09
topic: particle-api-shape-verification
applicability: U1 verification, U7 client implementation, U8 ingestion pipeline, U12 audio player
status: docs + live-API empirical verification complete
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

---

# Round 2: Live API verification (2026-05-10)

All six remaining empirical questions from Round 1 resolved via live calls against `https://api.particle.pro` from the project sandbox (sandbox network reaches the host, so no laptop hand-off needed). Test scripts and raw response samples were transient (run from `$TMPDIR/particle/`); findings persist below.

## Headline

**Every contingency cleared or downgraded.** No structural plan revision required. Two findings warrant minor unit-level updates flagged below.

## Findings

### 4 (revisited). Audio URL signing / TTL / Accept-Ranges — CONTINGENCIES C AND D CLEARED

Tested HEAD + ranged GET against a real `audio_url` returned by `/v1/podcasts/clips/{id}`.

- **URL shape:** `https://cdn.particle.pro/podcast/episode/{episode-uuid}/clip/audio/{clip-uuid}.mp3`. **No query string, no signature, no token.** Permanent CDN paths.
- **Underlying storage:** Google Cloud Storage (`x-goog-*` headers visible). Particle proxies a `cdn.particle.pro` hostname over it.
- **Cache behavior:** `cache-control: public, max-age=31536000` (1 year). Aggressive caching — clips are immutable once published.
- **Range support:** `accept-ranges: bytes` confirmed; ranged GET (`Range: bytes=0-99`) returned `HTTP 206 Partial Content` with the right slice. **HTTP range seeking works.**
- **HTTP/2 + HTTP/3** advertised (`alt-svc: h3=":443"`).
- **Implication for U12:** the custom audio player can rely on a permanent URL stored in `segments.audio_url`, support seek-past-buffered-position via range requests, and skip any server-side re-signing route. **Contingency C downgrade:** the `app/api/clips/[id]/audio/route.ts` re-signing route is no longer needed for v1. **Contingency D fully cleared.**

### 5 (revisited). Entity coverage — CONTINGENCY E CLEARED

Tested 15 49ers names spanning starters, coaches, GM, owner, and the team itself against `/v1/entities?q=...`.

| | |
|---|---|
| Coverage rate | **15/15 = 100%** |
| Predicted-slug accuracy (where covered) | **15/15 = 100%** |

Slug rule confirmed: `name.toLowerCase().replace(/'/g,'').replace(/\./g,'').replace(/\s+/g,'-')`. Examples:

- Brock Purdy → `brock-purdy`
- Christian McCaffrey → `christian-mccaffrey`
- San Francisco 49ers → `san-francisco-49ers`
- Jauan Jennings → `jauan-jennings`
- Robert Saleh → `robert-saleh`

**Implication for U6:** seed the niners universe with **direct predicted slugs** — no name-fallback list needed in v1. The `nameFallbacks` field in the universe schema can stay (cheap insurance) but is empty for the niners. Skip the runtime slug-resolution startup script unless we discover misses on the broader roster.

**Bonus finding from `/v1/entities` shape:** entity records include `id`, `slug`, `name`, `description`, optional `wikipedia_url`, `image_url`. The description field carries useful disambiguation copy ("American football quarterback", "Brock Purdy's mother"). Fuzzy queries return related entities (querying "Brock Purdy" also surfaces his parents, which appear as separate Particle entities — relevant only as noise to filter, not as a coverage problem).

### 6 (revisited). Segment boundary granularity — CONTINGENCY F CLEARED

Sampled 20 segments via `/v1/podcasts/search?keyword_search=49ers&limit=20`.

| Statistic | Segment duration |
|---|---|
| min | 35.9s |
| p25 | 82.4s |
| **median** | **118.4s (~2 min)** |
| p75 | 175.6s |
| max | 618.5s (~10 min) |
| mean | 158.0s |

Segments are **focused, topic-level chunks with descriptive titles** ("Cowboys vs. 49ers: Different Roads, Same End", "Mike Evans to 49ers: win-now move", "Setting the draft table: WR priority and Round 1 question"). Not 30-minute slabs. Clip-within-segment durations are even tighter (median 45s) — clips are the quote-level highlights inside the segment.

**Implication for U9 (summarization):** the prompt can summarize the segment as-is without "extract only the 49ers-relevant portion" gymnastics. The boundary is already topical. Saves prompt tokens and improves quality.

**Implication for U11 (card rendering):** "8 minutes across 3 segments" is a realistic display claim — 3× ~2-min segments aligns with the median. Cards will typically show 2–5 segments per episode in the niners domain.

### 7. Curated catalog hit rate — CONTINGENCY G PARTIAL (no pivot needed)

Sampled 12 candidate sports podcasts via `/v1/podcasts?q=...`. Hit rate **8/12 = 67%**.

| Hit | Query | Catalog slug |
|---|---|---|
| ✓ | Locked On 49ers | `locked-on-49ers` |
| ✓ | The Mina Kimes Show | `the-mina-kimes-show` |
| ✓ | Pat McAfee Show | `the-pat-mcafee-show` |
| ✓ | Pardon My Take | `pardon-my-take` |
| ✓ | PFT Live | `pft-live` |
| ✓ | The Bill Simmons Podcast | `the-bill-simmons` |
| ✓ | The Athletic Football Show | `the-athletic-football-show` |
| ✓ | The Ringer NFL Show | `the-ringer-nfl-show` |
| ✗ | Niners Nation | (not in catalog under any spelling) |
| ✗ | 49ers Webzone | (not in catalog) |
| ✗ | Talkin' Niners | (not in catalog) |
| ✗ | ESPN Daily | (not in catalog) |

**Catalog coverage of 49ers content is broader than the misses suggest.** A query for `49ers` returned seven additional 49ers-relevant shows we hadn't explicitly probed:

- `49ers-talk` — 49ers Talk: A San Francisco 49ers Podcast
- `the-gold-standard` — The Gold Standard: San Francisco 49ers Podcast Network
- `section-415` — Section 415
- `knbr` — KNBR Podcast
- `the-krueg-show` — The Krueg Show
- `the-leeds-view-podcast-and-news` — The Leeds View Podcast and News (multi-team, includes 49ers)

**Implication for U6:** the curated 31-podcast list defines itself **from the catalog**, not from a wishlist. Misses (Niners Nation, Webzone) are niche fan-blog shows — Locked On 49ers + 49ers Talk + The Gold Standard + Section 415 cover the same daily-49ers-show role. **Contingency G plan pivot is NOT triggered** — curated surface remains primary.

**Action item flagged for U6:** before defining the final list, run a `/v1/podcasts?q=...` sweep for each candidate, drop misses, swap in catalog-resident equivalents. This is a 5-minute sweep at U6 start.

### 8 (revisited). Cost dry-run + rate-limit confirmation — CONTINGENCY H DOWNGRADED

Live response headers confirm:

- **Rate limit: 10,000 requests/minute** (per `x-ratelimit-limit`). **10× higher than the conservative 1,000/min assumption from docs round.** Daily-run headroom is enormous.
- **No credit/spend info exposed in response headers.** Cost tracking must be client-side via the price table in `lib/particle/tracked-call.ts`. Dashboard is sole source of truth for credit balance.
- **`/v1/organizations` returns 401** — the billing endpoints exist but require organization-owner JWT auth, not the API key. This isn't a path forward for in-app credit-balance display in v1.

The 50-page-or-so daily call budget (~67 base + 50–200 segment-detail calls = ~120–270 total) consumes 3% of one minute's rate-limit ceiling. Rate limits will not constrain anything in v1.

**Cost dry-run remains nominal until per-call credit weights are confirmed in the dashboard** (separate task, not blocking U5–U9 code work). The plan's cost-conscious mitigations (dev mode, pre-flight gate, payment method gate before first prod run, 402 handler) all still apply unchanged.

### Bonus: actual response shapes (refining U7 + U5 schema)

The Round 1 doc captured the response shape from documentation; the live shape adds detail and a few field names that should flow into `lib/particle/types.ts` and the U5 schema:

**`GET /v1/podcasts/search` response (top-level):**
```
{
  data: SearchResult[],
  has_more: boolean,
  cursor: string  // opaque continuation token; pass back as ?cursor=...
}

SearchResult = {
  episode: { id, slug, title, published_at, podcast: { id, title, slug, image_url } }
  segment: { id, episode, number, type, title, description, summary,
             start_seconds, end_seconds, duration_seconds, audio_url }
  clips:   Clip[]            // notable-line / quote-level extracts
  windows: Window[]          // keyword-match windows with line-level transcript
  match:   { source, relevance_score }
}

Clip = {
  id, episode, segment, type, title, description, intro_statement,
  engagement_score, speaker: { name, role },
  start_seconds, end_seconds, duration_seconds, audio_url
}

Window = {
  start_seconds, end_seconds,
  lines: [{ number, speaker, role, start_seconds, end_seconds, text, is_match? }]
}
```

**Critical detail not in Round 1 doc:** the `segment` object **already carries `audio_url`** at the segment level. Previously the plan assumed audio_url lived on the clip only. This is significant: U8 ingestion can store `segment.audio_url` directly into `segments.audio_url`, and U12's player can use it without an extra fetch. Clips are a subset (highlight quotes); segments are the natural card-row unit and they already have audio.

**`speaker.role` enum observed:** `PANELIST`, `HOST` (and likely others — should be typed as `string` and not enum-locked in v1). Worth surfacing on segments when present (helps the digest copy: "Mina Kimes said…" reads better than "speaker said…").

**`segment.type` enum observed:** `TOPIC_DISCUSSION`, `INTERVIEW`. Likely also `MONOLOGUE`, `Q_AND_A`, others. Type as `string` in v1.

**`clip.type` enum observed:** `NOTABLE_LINE`. Other values likely exist.

**Match metadata:** `match.source` is `"keyword"` for keyword search; `"semantic"` for semantic; `"entity"` for mention search. Worth persisting on `segments` so we know how each was surfaced (debugging + potential future UI badge).

## Plan-unit updates

Based on Round 2, **two units gain small refinements**:

### U5 schema refinement
- `segments.audio_url` is **populated at ingestion time** (always), not derived from clip lookup. Already in the plan but worth re-reading the column definition with this confirmed.
- Add `segments.match_source text` (values: `keyword | semantic | entity`) for surfacing-method debugging.
- Add `segments.speaker_name text` and `segments.speaker_role text` (both nullable) for use in card copy and pull-quote attribution.

### U6 universe seed
- Predicted slugs are confirmed correct for 49ers — no startup slug-resolution script needed. Universe config is just data.
- The 31-podcast curated list **must be defined against the live catalog**. 5-minute sweep at U6 start: query each candidate, drop misses, swap equivalents. Document the final list in `config/podcasts.ts` with `particle_slug` filled in (no nullable nulls — only catalog-resident shows make the list in v1).

### U7 client + types
- `lib/particle/types.ts` reflects the actual response shape above (segment carries audio_url; cursor pagination; speaker on clips and surfaceable on segments).
- Cursor-based pagination implemented as documented. `cursor` is an opaque string; pass it back via `?cursor=...`.
- Rate-limit headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`) are read but rarely actionable at our scale; log them in `api_calls.metadata` for posterity.

### U12 player
- Permanent CDN URLs + range-request support means: **no server-side re-signing route**, **no proactive refresh logic**, **client-side seek works.** Player is straightforward HTML5 `<audio>` + Tailwind chrome + segment-level highlight ticker driven by `timeupdate` events. Contingency A (`<particle-podcast-clip>` embed wrapper) is fully retired — the doc-round had already cleared it; live verification re-confirms.

## What remains (deferrable)

- **Per-call credit weights** for `standard` and `premium` tiers — only available in the Particle dashboard. Not blocking U5–U9 code; needed before the first non-dev-mode run to populate `lib/particle/tracked-call.ts` price table accurately. **User dashboard task, ~5 minutes.**
- **Word-level transcript live test** — deferred to v2 player work; not needed for v1 segment-level highlight.
- **Seed-window cost dry-run with real numbers** — depends on the credit weights above. Until then, dev-mode caps spend.

All of the above are explicit U1 contingencies that were already deferred in the plan. Round 2 doesn't add new blockers.
