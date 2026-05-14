---
source: https://docs.particle.pro/llms-full.txt
snapshot: 2026-05-14
refresh: curl -sL https://docs.particle.pro/llms-full.txt -o docs/reference/particle-api.md (then re-add this frontmatter)
scope: every Particle endpoint with shape + description. The full upstream docs in one file.
---

# Get a company
Source: https://docs.particle.pro/api-reference/companies/get-a-company

/openapi.json get /v1/companies/{id}
Returns a single company by slug (e.g., 'apple'), domain (e.g., 'apple.com'), or ID.



# Get company advertising profile
Source: https://docs.particle.pro/api-reference/companies/get-company-advertising-profile

/openapi.json get /v1/companies/{id}/podcast/advertising
Returns advertising intelligence for a specific company across the podcast ecosystem, including reach metrics and recent ad placements. Identify the company by slug (e.g., 'apple'), domain, or ID.



# List companies
Source: https://docs.particle.pro/api-reference/companies/list-companies

/openapi.json get /v1/companies
Returns a paginated list of companies. Filter by entity slug (e.g., 'apple'), ticker, domain, CIK, or QID. Search by name or fetch updates since a timestamp.



# List company competitors
Source: https://docs.particle.pro/api-reference/companies/list-company-competitors

/openapi.json get /v1/companies/{id}/competitors
Returns a paginated list of competitors for a company, ordered by prominence (news coverage volume, market cap, podcast appearances, Wikidata notability) so the largest / most-newsworthy competitors come first. Each result includes a competitive basis describing the relationship. Identify the company by slug (e.g., 'apple'), domain, or ID.



# List company products
Source: https://docs.particle.pro/api-reference/companies/list-company-products

/openapi.json get /v1/companies/{id}/products
Returns the product hierarchy for a company as a nested tree. Segments contain product lines, which contain individual products. Identify the company by slug (e.g., 'apple'), domain, or ID. Defaults to active products only.



# Get clip embed
Source: https://docs.particle.pro/api-reference/embed/get-clip-embed

/openapi.json get /v1/embed/clips/{id}
Returns a minimal public representation of a clip for embed rendering.



# Get clip embed transcript
Source: https://docs.particle.pro/api-reference/embed/get-clip-embed-transcript

/openapi.json get /v1/embed/clips/{id}/transcript
Returns the diarized transcript for a clip embed.



# Get episode embed code
Source: https://docs.particle.pro/api-reference/embed/get-episode-embed-code

/openapi.json get /v1/embed/episodes/{episode_id}/code
Returns a paste-ready <particle-podcast-clip> HTML snippet for an existing clip or a custom timestamp range within an episode. Either clip_id or start (with optional end) must be supplied; the two modes are mutually exclusive.

For slices: when end is omitted, it defaults to start + 120 seconds. The embed widget caps slice length at 120 seconds, so any end value beyond start + 120s is silently clamped to start + 120s. End is also clamped to the episode duration. The actual range used is encoded in the returned script_url.



# Get an entity
Source: https://docs.particle.pro/api-reference/entities/get-an-entity

/openapi.json get /v1/entities/{id}
Returns a single knowledge graph entity by slug (e.g., 'sam-altman', 'apple') or ID.



# List entities
Source: https://docs.particle.pro/api-reference/entities/list-entities

/openapi.json get /v1/entities
Search and list knowledge graph entities (people, organizations, places) across all podcast content. Defaults to the most frequently appearing entities ranked by number of distinct podcast episodes featuring them when no query or podcast filter is provided. Filter by podcast slug or ID.



# List entity types
Source: https://docs.particle.pro/api-reference/entities/list-entity-types

/openapi.json get /v1/entities/types
Returns the entity categories supported as values for the `type` query parameter on /v1/entities and the `entity_type` query parameter on /v1/podcasts/search.



# Introduction
Source: https://docs.particle.pro/api-reference/introduction

Particle API reference — base URL, authentication, and machine-readable specs.

## Base URL

All API endpoints are served from:

```
https://api.particle.pro
```

## Authentication

Every endpoint that returns user data requires an API key. Two header forms are accepted; `X-API-Key` is recommended.

### `X-API-Key` header (recommended)

```bash theme={"dark"}
curl https://api.particle.pro/v1/podcasts \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

### `Authorization: Bearer` header

Equivalent in every way; useful when you're routing through middleware that already understands bearer tokens.

```bash theme={"dark"}
curl https://api.particle.pro/v1/podcasts \
  -H "Authorization: Bearer $PARTICLE_API_KEY"
```

The `/v1/embed/*` endpoints are public and intentionally do not require authentication.

## Get an API key

1. Sign up or log in at the <DashboardLink>API Dashboard</DashboardLink>
2. Create an organization and project
3. Open the project's **API Keys** section
4. Click **Create API Key** and copy the key — it won't be shown again

## Machine-readable resources

For automated integrations and AI-assisted development:

| Resource            | URL                                                         | Use it for                                                |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Public OpenAPI spec | [`/openapi.json`](/openapi.json)                            | Code generation, schema validation, contract testing      |
| `llms.txt`          | [`/llms.txt`](https://docs.particle.pro/llms.txt)           | Compact index of every doc page for LLM context           |
| `llms-full.txt`     | [`/llms-full.txt`](https://docs.particle.pro/llms-full.txt) | Full-text concatenation of every guide for deep retrieval |

The OpenAPI spec is auto-generated from the server source on every release and the page-level reference that follows is rendered directly from it. It is the authoritative reference for endpoint structure; for individual field semantics, defer to the live API response when the two disagree (occasional drift can happen between schema annotations and serialized values).

## Conventions

See [Concepts](/concepts) for the rules every endpoint follows: ID/slug resolution, cursor pagination, error envelope, and pricing weight.


# Get a sponsor
Source: https://docs.particle.pro/api-reference/podcast-advertising/get-a-sponsor

/openapi.json get /v1/podcasts/advertising/sponsors/{id}
Returns a single advertising sponsor with activity metrics. The {id} path parameter accepts a sponsor ID, a company ID, a company domain, or a company slug.



# Get advertising leaderboard
Source: https://docs.particle.pro/api-reference/podcast-advertising/get-advertising-leaderboard

/openapi.json get /v1/podcasts/advertising/leaderboard
Returns the top podcast advertising sponsors ranked by the specified metric, with optional time range and company filtering.



# Get sponsor co-occurrence
Source: https://docs.particle.pro/api-reference/podcast-advertising/get-sponsor-co-occurrence

/openapi.json get /v1/podcasts/advertising/co-occurrence
Returns pairs of sponsors that frequently appear together in the same podcast episodes.



# List podcasts for a sponsor
Source: https://docs.particle.pro/api-reference/podcast-advertising/list-podcasts-for-a-sponsor

/openapi.json get /v1/podcasts/advertising/sponsors/{id}/podcasts
Returns a paginated list of podcasts where the sponsor advertises, ordered by the number of episodes featuring the sponsor.



# List sponsors
Source: https://docs.particle.pro/api-reference/podcast-advertising/list-sponsors

/openapi.json get /v1/podcasts/advertising/sponsors
Returns a paginated list of podcast advertising sponsors, optionally filtered by name search or company.



# Get a clip
Source: https://docs.particle.pro/api-reference/podcast-clips/get-a-clip

/openapi.json get /v1/podcasts/clips/{id}
Returns a single clip by its unique identifier.



# List clips
Source: https://docs.particle.pro/api-reference/podcast-clips/list-clips

/openapi.json get /v1/podcasts/clips
Returns AI-extracted highlight clips across podcast episodes, ranked by engagement potential. For text-based clip discovery (semantic, keyword, or entity mention search), use GET /v1/podcasts/search — matching clips are embedded inside each search result alongside the parent segment and dialogue.



# List clips for an episode
Source: https://docs.particle.pro/api-reference/podcast-clips/list-clips-for-an-episode

/openapi.json get /v1/podcasts/episodes/{id}/clips
Returns the AI-extracted highlight clips for a specific episode, sorted by engagement score.



# Get an episode
Source: https://docs.particle.pro/api-reference/podcast-episodes/get-an-episode

/openapi.json get /v1/podcasts/episodes/{id}
Returns a single episode by its unique identifier.



# List ads in an episode
Source: https://docs.particle.pro/api-reference/podcast-episodes/list-ads-in-an-episode

/openapi.json get /v1/podcasts/episodes/{id}/ads
Returns the advertising spots detected in a specific episode, including the sponsor, the linked company in the knowledge graph, the advertised product or offer, the read type (HOST_READ vs PRE_RECORDED), and the placement (PRE_ROLL/MID_ROLL/POST_ROLL). Network promos are excluded.



# List entities in an episode
Source: https://docs.particle.pro/api-reference/podcast-episodes/list-entities-in-an-episode

/openapi.json get /v1/podcasts/episodes/{id}/entities
Returns knowledge graph entities mentioned in a specific episode, with salience scores and occurrence counts.



# List episodes
Source: https://docs.particle.pro/api-reference/podcast-episodes/list-episodes

/openapi.json get /v1/podcasts/episodes
Returns a paginated list of podcast episodes across all podcasts. Filter by podcast slug or ID, entity slug or ID, company slug or domain, date range, and language.



# List speakers in an episode
Source: https://docs.particle.pro/api-reference/podcast-episodes/list-speakers-in-an-episode

/openapi.json get /v1/podcasts/episodes/{id}/speakers
Returns the identified speakers in a specific episode with their roles and speaking durations.



# List topics for an episode
Source: https://docs.particle.pro/api-reference/podcast-episodes/list-topics-for-an-episode

/openapi.json get /v1/podcasts/episodes/{id}/topics
Returns the topic taxonomy classifications for a specific episode.



# Get a podcast publisher
Source: https://docs.particle.pro/api-reference/podcast-publishers/get-a-podcast-publisher

/openapi.json get /v1/podcasts/publishers/{id}
Returns a single podcast publisher by slug (e.g., 'goalhanger', 'iheartpodcasts', 'bbc-radio-4') or ID. Slugs are human-readable identifiers populated for the vast majority of publishers and are the recommended way to reference a publisher in URLs. The ID always works as a fallback for publishers whose name doesn't slugify.



# List podcast publishers
Source: https://docs.particle.pro/api-reference/podcast-publishers/list-podcast-publishers

/openapi.json get /v1/podcasts/publishers
Returns a paginated list of podcast publishers, ordered by catalog size (largest first, the default) or alphabetically by name. Each entry includes the publisher name, slug, and the number of podcasts attributed to the publisher.



# List podcasts for a publisher
Source: https://docs.particle.pro/api-reference/podcast-publishers/list-podcasts-for-a-publisher

/openapi.json get /v1/podcasts/publishers/{id}/podcasts
Returns a paginated list of podcasts attributed to a publisher, ordered by popularity. Identify the publisher by slug (e.g., 'goalhanger', 'iheartpodcasts', 'bbc-radio-4') or ID.



# Get chart slot history
Source: https://docs.particle.pro/api-reference/podcast-rankings/get-chart-slot-history

/openapi.json get /v1/podcasts/rankings/history
Returns historical chart snapshots for a chart slot, ordered most-recent first. Set `since` / `until` to bound the time range; set `podcast_id` to filter to one podcast within the slot.



# Get historical rankings for a podcast
Source: https://docs.particle.pro/api-reference/podcast-rankings/get-historical-rankings-for-a-podcast

/openapi.json get /v1/podcasts/{id}/rankings/history
Returns the historical rank entries for a podcast across one or more chart slots. Optional filters narrow the scope (single source, single country, single category, or a date range).



# List current rankings for a podcast
Source: https://docs.particle.pro/api-reference/podcast-rankings/list-current-rankings-for-a-podcast

/openapi.json get /v1/podcasts/{id}/rankings
Returns every live chart appearance of the given podcast — across sources, countries, and categories. Identify the podcast by slug (e.g., 'the-daily') or ID.



# List podcast rankings
Source: https://docs.particle.pro/api-reference/podcast-rankings/list-podcast-rankings

/openapi.json get /v1/podcasts/rankings
Returns chart entries from the live ranking snapshot. The most common call needs no parameters — it returns the first page (default 25, max 100 per request) of the US Apple Top Podcasts overall chart, ordered by rank ascending. Charts run to rank 200; paginate with `cursor` to fetch the rest. Narrow the result with `country`, `category_slug`, `source`, or `podcast_id`. When `podcast_id` is set, the response is the podcast's current chart appearances across the matching slots.



# List ranking categories
Source: https://docs.particle.pro/api-reference/podcast-rankings/list-ranking-categories

/openapi.json get /v1/podcasts/rankings/categories
Returns every category currently represented in the rankings dataset, optionally restricted to a single source. For Apple sub-categories the response includes `parent_slug` so clients can render the category hierarchy.



# List ranking countries
Source: https://docs.particle.pro/api-reference/podcast-rankings/list-ranking-countries

/openapi.json get /v1/podcasts/rankings/countries
Returns every country currently represented in the rankings dataset, optionally restricted to a single source. Each entry carries the human-readable country name (when known) and a count of distinct chart slots.



# List ranking movers
Source: https://docs.particle.pro/api-reference/podcast-rankings/list-ranking-movers

/openapi.json get /v1/podcasts/rankings/movers
Returns the chart entries whose rank changed between the live snapshot and the comparison snapshot `window_days` ago. Use the `change` filter to focus on debuts (`new`), departures (`exit`), or directional moves (`up` / `down`). Stable rows are excluded.



# List ranking sources
Source: https://docs.particle.pro/api-reference/podcast-rankings/list-ranking-sources

/openapi.json get /v1/podcasts/rankings/sources
Returns each (source, chart_type) pair available on this API together with row counts and freshness for the live snapshot.



# Summarize a podcast's chart presence
Source: https://docs.particle.pro/api-reference/podcast-rankings/summarize-a-podcasts-chart-presence

/openapi.json get /v1/podcasts/{id}/rankings/summary
Returns a one-call aggregate of the podcast's current chart presence: the number of distinct chart slots, sources, countries, and categories it appears on, plus the single best (lowest-numbered) rank it currently holds and a per-source breakdown.



# Search podcast dialogue for entity mentions
Source: https://docs.particle.pro/api-reference/podcast-search/search-podcast-dialogue-for-entity-mentions

/openapi.json get /v1/podcasts/mentions
Returns every line of dialogue that mentions a person or company, grouped by episode and ordered by recency. Each result is one episode plus all of that episode's mention windows — a window is a contiguous range of dialogue containing the mention with `context_lines` of surrounding context, and lines containing the mention have `is_mention=true`.

Use this endpoint for the "every line about X" use case. For finding dialogue by topic or exact phrase use `/v1/podcasts/search` instead.



# Search podcasts by content
Source: https://docs.particle.pro/api-reference/podcast-search/search-podcasts-by-content

/openapi.json get /v1/podcasts/search
Search the podcast catalog by what is said in episodes — by meaning (`semantic_search`), by exact phrase (`keyword_search`), or both at once (hybrid). Each result is a segment of an episode, returned with bounded preview windows of dialogue and any highlight clips that overlap the segment.

For "every line about a person or company" use `/v1/podcasts/mentions` instead — that endpoint returns episode-grouped mention windows with line-level highlights and is shaped for the read-everything-about-X use case. `entity_id` and `company_id` here narrow the result set to episodes featuring the resolved entity, but the ranking still comes from `semantic_search` / `keyword_search`.



# Get a segment
Source: https://docs.particle.pro/api-reference/podcast-segments/get-a-segment

/openapi.json get /v1/podcasts/segments/{id}
Returns a single segment by its unique identifier.



# List segments
Source: https://docs.particle.pro/api-reference/podcast-segments/list-segments

/openapi.json get /v1/podcasts/segments
Returns AI-identified segments across podcast episodes. Segments represent structural sections like topic discussions, interviews, ads, etc. At least one of `episode_id`, `podcast_id`, or `type` is required — this endpoint does not return a global feed.



# List segments for an episode
Source: https://docs.particle.pro/api-reference/podcast-segments/list-segments-for-an-episode

/openapi.json get /v1/podcasts/episodes/{id}/segments
Returns the AI-identified segments for a specific episode in chronological order.



# Get clip transcript
Source: https://docs.particle.pro/api-reference/podcast-transcripts/get-clip-transcript

/openapi.json get /v1/podcasts/clips/{id}/transcript
Returns the diarized transcript for a specific clip.



# Get entity mentions in transcript
Source: https://docs.particle.pro/api-reference/podcast-transcripts/get-entity-mentions-in-transcript

/openapi.json get /v1/podcasts/episodes/{id}/transcript/mentions
Finds all mentions of a specific entity within an episode's transcript and returns each mention with surrounding dialogue context. Useful for seeing exactly where and how an entity is discussed.



# Get episode transcript
Source: https://docs.particle.pro/api-reference/podcast-transcripts/get-episode-transcript

/openapi.json get /v1/podcasts/episodes/{id}/transcript
Returns the diarized transcript for a podcast episode. Supports dialogue (speaker-attributed lines), plain text, and SRT subtitle formats. Optionally filter by speaker or time range.



# Get segment transcript
Source: https://docs.particle.pro/api-reference/podcast-transcripts/get-segment-transcript

/openapi.json get /v1/podcasts/segments/{id}/transcript
Returns the diarized transcript for a specific segment.



# Get word-level transcript
Source: https://docs.particle.pro/api-reference/podcast-transcripts/get-word-level-transcript

/openapi.json get /v1/podcasts/episodes/{id}/transcript/words
Returns the word-level timestamped transcript for a podcast episode. Use start/end parameters to extract a time range for long episodes.



# Get a podcast
Source: https://docs.particle.pro/api-reference/podcasts/get-a-podcast

/openapi.json get /v1/podcasts/{id}
Returns a single podcast by slug (e.g., 'all-in') or ID. Slugs are human-readable identifiers included in every podcast response.



# Get a podcast's latest bias analysis
Source: https://docs.particle.pro/api-reference/podcasts/get-a-podcasts-latest-bias-analysis

/openapi.json get /v1/podcasts/{id}/bias
Returns the most recent automated political bias analysis for a podcast, including the agent's reasoning, transcript evidence, web research evidence, and the sample episodes that informed the rating. Returns 404 when the podcast is not found or when it has not yet been analyzed.



# Get a podcast's latest brand suitability assessment
Source: https://docs.particle.pro/api-reference/podcasts/get-a-podcasts-latest-brand-suitability-assessment

/openapi.json get /v1/podcasts/{id}/suitability
Returns the most recent brand suitability assessment for a podcast against the IAB Tech Lab Content Taxonomy 3.x Brand Safety & Suitability Framework (the industry-standard 12-category taxonomy formerly stewarded by GARM): overall tier, per-category prevalence and treatment, evidence excerpts from sampled episodes, and the methodology that produced the rating. Pass include=trend for a deterministically-derived comparison against the prior assessment, or include=history for the list of prior assessments. Returns 404 when the podcast is not found or has not yet been analyzed.



# Get podcast advertising profile
Source: https://docs.particle.pro/api-reference/podcasts/get-podcast-advertising-profile

/openapi.json get /v1/podcasts/{id}/advertising
Returns advertising intelligence for a specific podcast, including aggregate stats, read type breakdown, and top sponsors. Identify the podcast by slug (e.g., 'all-in') or ID.



# List a podcast's third-party platform presences
Source: https://docs.particle.pro/api-reference/podcasts/list-a-podcasts-third-party-platform-presences

/openapi.json get /v1/podcasts/{id}/external-links
Returns every third-party platform on which the podcast has a known presence — podcast directories (Apple Podcasts, Spotify, Castbox, …), social profiles (X, Instagram, TikTok, …), video channels (YouTube), and the publisher's own website. Each entry includes the platform-native identifier, a resolved web URL, and a list of optional attributes (audience size, profile metadata, account status). The shape is uniform across platforms; new attributes may be added over time without breaking existing clients.



# List entity mentions in a podcast
Source: https://docs.particle.pro/api-reference/podcasts/list-entity-mentions-in-a-podcast

/openapi.json get /v1/podcasts/{id}/mentions
Returns episodes where a specific entity appears within a podcast, ordered by most recent. Each result includes the episode, salience score, occurrence count, and speaker roles. Requires entity_id or company_id.



# List episodes for a podcast
Source: https://docs.particle.pro/api-reference/podcasts/list-episodes-for-a-podcast

/openapi.json get /v1/podcasts/{id}/episodes
Returns a paginated list of episodes for a specific podcast, identified by slug (e.g., 'all-in') or ID.



# List podcast topics
Source: https://docs.particle.pro/api-reference/podcasts/list-podcast-topics

/openapi.json get /v1/podcasts/topics
Returns the top-level topics covered across all podcasts, sorted by the number of podcasts covering each topic.



# List podcasts
Source: https://docs.particle.pro/api-reference/podcasts/list-podcasts

/openapi.json get /v1/podcasts
Returns a paginated list of podcasts, optionally filtered by text search, topic, or language.



# Get a topic
Source: https://docs.particle.pro/api-reference/topics/get-a-topic

/openapi.json get /v1/topics/{id}
Returns a single topic by its unique identifier, including ancestors and direct children.



# List topics
Source: https://docs.particle.pro/api-reference/topics/list-topics

/openapi.json get /v1/topics
Returns the hierarchical topic taxonomy. Use parent_id to navigate the tree.



# Companies
Source: https://docs.particle.pro/companies/overview

Cross-referenced company profiles with SEC, Wikidata, ticker, domain, and knowledge-graph identifiers.

Companies in Particle API map across every identifier system you might already have. Look up Nvidia by ticker, by domain, by SEC CIK, or by knowledge-graph slug — you'll always land on the same record. From there you can pull a structured product hierarchy, follow the company's appearances across podcasts, fetch its competitors, or pull sponsor analytics for its ad presence.

<Note>Available to MCP agents as [`companies/resolve_company`](/mcp/tools/companies/resolve-company) and [`companies/get_company`](/mcp/tools/companies/get-company).</Note>

## Identifiers

Every company carries a single `identifiers` block:

| Identifier                  | Source                 | Example      |
| --------------------------- | ---------------------- | ------------ |
| `ticker`                    | Primary stock ticker   | `NVDA`       |
| `cik`                       | SEC Central Index Key  | `0001045810` |
| `qid`                       | Wikidata QID           | `Q182477`    |
| `domain`                    | Company domain         | `nvidia.com` |
| `entity_id` / `entity_slug` | Knowledge-graph entity | `nvidia`     |

Use any of them as a query filter on `list-companies`. The slug, domain, and canonical ID resolve directly in the `{id}` slot of singular endpoints; for ticker, CIK, or QID, query `GET /v1/companies?ticker=…` (or `?cik=…` / `?qid=…`) first and pass the returned slug, domain, or ID through the singular endpoint.

## List companies

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/companies?ticker=NVDA&limit=1" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/companies?ticker=NVDA&limit=1",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/companies",
      params={"ticker": "NVDA", "limit": 1},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```json Response theme={"dark"}
{
  "data": [
    {
      "id": "3CensCwu5G2oKCFgPrNf89",
      "name": "Nvidia",
      "description": "Nvidia is a leading developer of graphics processing units…",
      "updated_at": "2026-02-15T08:41:32Z",
      "identifiers": {
        "cik": "0001045810",
        "qid": "Q182477",
        "entity_id": "nvidia",
        "entity_slug": "nvidia",
        "ticker": "NVDA",
        "domain": "nvidia.com"
      }
    }
  ],
  "has_more": false
}
```

### Filter parameters

| Parameter       | Description                                                  | Example                               |
| --------------- | ------------------------------------------------------------ | ------------------------------------- |
| `q`             | Case-insensitive name search                                 | `?q=Apple`                            |
| `ticker`        | Stock ticker(s), comma-separated, up to 100                  | `?ticker=AAPL,GOOG`                   |
| `domain`        | Domain(s), comma-separated, up to 100                        | `?domain=apple.com,nvidia.com`        |
| `cik`           | SEC CIK(s), comma-separated, up to 100                       | `?cik=0000320193,0001045810`          |
| `qid`           | Wikidata QID(s), comma-separated, up to 100                  | `?qid=Q312,Q182477`                   |
| `entity_id`     | Knowledge-graph slug(s) or ID(s), comma-separated, up to 100 | `?entity_id=apple,nvidia`             |
| `updated_after` | Incremental sync filter                                      | `?updated_after=2026-04-01T00:00:00Z` |

```bash theme={"dark"}
# Bulk lookup by tickers
curl "https://api.particle.pro/v1/companies?ticker=AAPL,NVDA,MSFT" \
  -H "X-API-Key: $PARTICLE_API_KEY"

# Incremental sync
curl "https://api.particle.pro/v1/companies?updated_after=2026-04-01T00:00:00Z" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Get a single company

```bash theme={"dark"}
curl "https://api.particle.pro/v1/companies/nvidia" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

`nvidia` (slug), `nvidia.com` (domain), and `3CensCwu5G2oKCFgPrNf89` (canonical ID) all resolve directly via `/v1/companies/{id}` to the same response. To look up a company by `NVDA` (ticker), `0001045810` (CIK), or `Q182477` (QID), call `GET /v1/companies` with the matching query filter (`?ticker=NVDA`, `?cik=…`, `?qid=…`) and use the returned slug, domain, or canonical ID with the singular endpoint.

## Sub-resources

| Endpoint                                     | Returns                                             |
| -------------------------------------------- | --------------------------------------------------- |
| `GET /v1/companies/{id}/products`            | Three-level product hierarchy with lifecycle status |
| `GET /v1/companies/{id}/competitors`         | Competitor list                                     |
| `GET /v1/companies/{id}/podcast/advertising` | Sponsor analytics for the company's ad presence     |

See [Products](/companies/products) for the product hierarchy and [Advertising](/podcasts/advertising#per-company-advertising) for the sponsor analytics shape.

## Cross-referencing with the knowledge graph

The `entity_slug` field on every company doubles as a knowledge-graph handle. Use it to find every podcast appearance, mention, and clip where the company is discussed:

```bash theme={"dark"}
# Episodes featuring or mentioning Nvidia
curl "https://api.particle.pro/v1/podcasts/episodes?company_id=nvidia&limit=5" \
  -H "X-API-Key: $PARTICLE_API_KEY"

# Every line of dialogue mentioning Nvidia, grouped by episode
curl "https://api.particle.pro/v1/podcasts/mentions?company_id=nvidia&limit=5" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

The `company_id` filter on the episodes and mentions endpoints accepts a slug, domain, or canonical ID — the same handles that resolve directly via `/v1/companies/{id}`.

## Related

* [Products](/companies/products) — recursive product tree with lifecycle status
* [Podcast advertising](/podcasts/advertising) — `/companies/{id}/podcast/advertising` and the leaderboard
* [Knowledge graph → entities](/knowledge-graph/entities) — follow a company across audio content


# Products
Source: https://docs.particle.pro/companies/products

Three-level product hierarchies with lifecycle status.

Every company has a structured product tree: **segments** contain **product lines**, which contain individual **products**. Each node carries a lifecycle `status` (`active`, `announced`, `discontinued`, `rumored`) and, where available, a canonical `product_url`.

## Hierarchy

| Level          | What it is                    | Example (Nvidia)           |
| -------------- | ----------------------------- | -------------------------- |
| `segment`      | Top-level business segment    | `Compute & Networking`     |
| `product_line` | Product line within a segment | `Data Center Accelerators` |
| `product`      | Individual product or service | `Blackwell GPUs`           |

## Lifecycle statuses

| Status         | Meaning                        |
| -------------- | ------------------------------ |
| `active`       | Currently available            |
| `announced`    | Announced but not yet released |
| `discontinued` | No longer available            |
| `rumored`      | Reported but not confirmed     |

## Get a company's products

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/companies/nvidia/products" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/companies/nvidia/products",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const segments = await res.json();
  ```
</CodeGroup>

The response uses the standard list envelope. `data` is the array of root-level `segment` nodes; each node may contain `children` of the next level down, recursively.

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "6BsVni5re7N3JP5H5BzVjD",
      "name": "Automotive",
      "level": "segment",
      "status": "active",
      "children": [
        {
          "name": "NVIDIA DRIVE",
          "level": "product_line",
          "status": "active",
          "children": [
            { "name": "DRIVE AGX Hardware & OS", "level": "product", "status": "active" },
            { "name": "DRIVE Hyperion Platform", "level": "product", "status": "active" },
            { "name": "DRIVE Software Suite",    "level": "product", "status": "active" }
            // …
          ]
        }
        // …
      ]
    },
    {
      "id": "4P3oLUiJTgz5dcjdwy9iLb",
      "name": "Compute & Networking",
      "level": "segment",
      "status": "active",
      "children": [
        {
          "name": "Data Center Accelerators",
          "level": "product_line",
          "status": "active",
          "children": [
            { "name": "Blackwell GPUs", "level": "product", "status": "active" },
            { "name": "Hopper GPUs",    "level": "product", "status": "active" },
            { "name": "Grace and Vera CPUs", "level": "product", "status": "active" }
            // …
          ]
        }
        // …
      ]
    }
    // …
  ],
  "has_more": false,
  "cursor": null
}
```

## Filtering by status

By default only `active` products are returned. Pass `status` as a comma-separated list to include other lifecycle stages:

```bash theme={"dark"}
# Active and announced
curl "https://api.particle.pro/v1/companies/nvidia/products?status=active,announced" \
  -H "X-API-Key: $PARTICLE_API_KEY"

# Only discontinued
curl "https://api.particle.pro/v1/companies/nvidia/products?status=discontinued" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

<Warning>
  Tree integrity is preserved when filtering: if a parent doesn't match the status filter it's removed along with its children, even if some children individually match. To traverse without parent constraints, request all statuses and filter on your side.
</Warning>

## Common patterns

### Flatten to a list of products

```js theme={"dark"}
function flattenProducts(nodes, out = []) {
  for (const node of nodes) {
    if (node.level === "product") out.push(node);
    if (node.children) flattenProducts(node.children, out);
  }
  return out;
}

const { data: segments } = await fetch(".../v1/companies/nvidia/products", {
  headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
}).then((r) => r.json());

const products = flattenProducts(segments);
```

### Track product launches

Combine `?status=announced` with periodic polling to see when companies announce new products. Combine with `?status=discontinued` to detect end-of-life.

## Related

* [Companies overview](/companies/overview) — resolve any company before fetching products
* [Knowledge graph → entities](/knowledge-graph/entities) — products are linked to entities for cross-content discovery


# Concepts
Source: https://docs.particle.pro/concepts

Cross-cutting conventions: IDs, pagination, errors, pricing weight, and choosing the right endpoint.

This page is the cheat sheet every other guide refers back to. Skim it once, then look up specifics as needed.

## IDs and slugs

Most endpoints with an `{id}` path parameter accept either:

* The canonical opaque ID (e.g. `17PzxG1t12xzno` for Sam Altman, `3CensCwu5G2oKCFgPrNf89` for Nvidia), or
* A human-readable slug (e.g. `sam-altman`, `nvidia`, `pivot`, `the-joe-rogan-experience`).

Use whichever you have. If you receive an entity slug from one response (`entity_slug: "nvidia"`), you can pass it directly to any other endpoint without first looking up the canonical ID.

```bash theme={"dark"}
# Both of these resolve to the same entity:
curl ".../v1/entities/sam-altman"        -H "X-API-Key: $PARTICLE_API_KEY"
curl ".../v1/entities/17PzxG1t12xzno"    -H "X-API-Key: $PARTICLE_API_KEY"
```

Companies are richer: `/v1/companies/{id}` resolves slug, domain, *and* canonical ID directly. To look up by ticker, CIK, or QID, use the corresponding query filter on `GET /v1/companies` (`?ticker=…`, `?cik=…`, `?qid=…`) and pass the returned slug, domain, or ID through the singular endpoint. See [Companies → Identifiers](/companies/overview#identifiers).

## Cursor pagination

List endpoints share a single response envelope:

```json theme={"dark"}
{
  "data": [ /* … */ ],
  "has_more": true,
  "cursor": "r.4gfFC7"
}
```

To fetch the next page, pass the `cursor` value back as a query parameter:

```bash theme={"dark"}
curl ".../v1/podcasts?cursor=r.4gfFC7" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

Cursors are opaque — treat them as strings, do not parse or construct them, and do not assume any ordering of values across versions. The default page size is endpoint-specific (often 25); use `limit` to override (typically up to 100).

## Authentication

Two header forms are accepted; `X-API-Key` is recommended.

```bash theme={"dark"}
# Recommended
curl -H "X-API-Key: $PARTICLE_API_KEY" "https://api.particle.pro/v1/podcasts"

# Equivalent
curl -H "Authorization: Bearer $PARTICLE_API_KEY" "https://api.particle.pro/v1/podcasts"
```

Embed endpoints (`/v1/embed/*`) intentionally do not require authentication so the responses can be used as public iframe payloads.

## Pricing weight

Every endpoint is available on every account — there is no tier lock. Endpoints are *priced* differently, though: heavier endpoints (full transcripts, transcript mentions, advertising analytics, cross-podcast clip search, competitor lookups) consume more credits per call than lighter ones (entity, topic, and podcast metadata; episode lookups and sub-resources; clip listings; embed).

The OpenAPI tag on every operation declares the pricing class — `tier:standard` or `tier:premium`. Treat it as a hint about cost, not a hint about access. Your usage dashboard breaks down spend by endpoint so you can see where credits are going.

## Choosing the right endpoint

The API exposes overlapping ways to find content. Pick by what you actually need.

| You want…                                                       | Use                                                                                     | Notes                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Dialogue matching the *meaning* of a query, paraphrase-tolerant | `GET /v1/podcasts/search?semantic_search=…`                                             | Vector similarity. Express the topic the way you'd describe it; speakers may use different vocabulary. |
| Dialogue containing exact tokens or phrases                     | `GET /v1/podcasts/search?keyword_search=…`                                              | BM25. Use for proper nouns, tickers, drug names, product codes.                                        |
| Every dialogue line where a person or company is mentioned      | `GET /v1/podcasts/mentions?entity_id=…`                                                 | Episode-grouped mention windows with `is_mention` flags. Use for the read-everything-about-X workflow. |
| Combine ranked search with an entity scope                      | `GET /v1/podcasts/search?semantic_search=…&entity_id=…`                                 | Ranked candidates filtered to episodes where the entity appears.                                       |
| Episode-level filtering by entity, topic, language, or date     | `GET /v1/podcasts/episodes?entity_id=…`                                                 | Standard list, supports rich filters. Use when you don't need dialogue.                                |
| All entities mentioned in one episode                           | `GET /v1/podcasts/episodes/{id}/transcript/mentions`                                    | Per-episode rollup with surrounding-context windows.                                                   |
| Salience rollup of an entity across one podcast's episodes      | `GET /v1/podcasts/{id}/mentions`                                                        | Episode-level aggregate within one podcast.                                                            |
| AI-segmented structural sections of an episode                  | `GET /v1/podcasts/episodes/{id}/segments`                                               | Intros, ads, topic discussions, interviews.                                                            |
| Browse highlight clips ranked by engagement                     | `GET /v1/podcasts/clips`                                                                | Curated highlights. Clips matching dialogue content come back inside `/v1/podcasts/search` results.    |
| Who advertises on which podcasts                                | `GET /v1/companies/{id}/podcast/advertising` and `/v1/podcasts/advertising/leaderboard` | Sponsor-side analytics.                                                                                |

[Quickstart](/quickstart) walks through several of these patterns end-to-end.

## Errors

Errors follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (Problem Details for HTTP APIs). Every error response is `application/problem+json` with at minimum `status`, `title`, and `detail`, plus a stable `error_code` for programmatic branching and an optional `resolve` object pointing at how to fix the issue.

See [Errors → Overview](/errors/overview) for the full envelope, the catalog of error codes, and patterns for handling them in UI clients and agents.

## Rate limits

Rate-limited responses return HTTP 429 with `error_code: "rate_limit_exceeded"`. Back off and retry — the response includes guidance in `detail`. See [`rate_limit_exceeded`](/errors/rate_limit_exceeded).


# api_key_required
Source: https://docs.particle.pro/errors/api_key_required

Valid API key required

|                    |                    |
| ------------------ | ------------------ |
| **HTTP status**    | `401 Unauthorized` |
| **Error code**     | `api_key_required` |
| **Resolve action** | `create_api_key`   |

## What happened

The request did not include a valid API key. Content API endpoints (podcasts, entities, etc.) require an API key passed via `X-API-Key` HTTP header, the `Authorization: Bearer` HTTP header, or the `api-key` query parameter.

## How to fix

<Visibility>
  <Steps>
    <Step>
      Create a new API key from the <APIKeysLink>API Keys page</APIKeysLink> in the platform dashboard.
    </Step>

    <Step>
      Include your API key in your request using one of the [authentication mechanisms](/api-reference/introduction#authentication).
    </Step>
  </Steps>
</Visibility>

<Visibility>
  <Steps>
    <Step title="Create a project">
      ```bash theme={"dark"}
      curl -X POST https://api.particle.pro/v1/organizations/{orgId}/projects \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"name": "My Project"}'
      ```
    </Step>

    <Step title="Generate an API key">
      ```bash theme={"dark"}
      curl -X POST https://api.particle.pro/v1/projects/{projectId}/api-keys \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"name": "Production"}'
      ```

      The full key is returned **only in this response** — store it securely.
    </Step>

    <Step title="Use the API key">
      ```bash theme={"dark"}
      curl https://api.particle.pro/v1/podcasts \
        -H "X-API-Key: YOUR_API_KEY"
      ```
    </Step>
  </Steps>
</Visibility>


# auth_required
Source: https://docs.particle.pro/errors/auth_required

Authentication required

|                    |                    |
| ------------------ | ------------------ |
| **HTTP status**    | `401 Unauthorized` |
| **Error code**     | `auth_required`    |
| **Resolve action** | `login`            |

## What happened

The request did not include valid user credentials. This error is returned by Particle Pro platform endpoints that require a logged-in user session (JWT). Content API endpoints use [`api_key_required`](/errors/api_key_required) instead.

## How to fix

<Steps>
  <Step>
    If you are a human user, log in to the platform to obtain a valid session.
  </Step>

  <Step>
    If you are building an integration, use an API key instead. Create one from the <APIKeysLink>API Keys page</APIKeysLink> and authenticate via the `X-API-Key` header or `Authorization: Bearer` header.
  </Step>
</Steps>


# bad_request
Source: https://docs.particle.pro/errors/bad_request

Malformed request

|                 |                   |
| --------------- | ----------------- |
| **HTTP status** | `400 Bad Request` |
| **Error code**  | `bad_request`     |

## What happened

The request was rejected before it reached the handler — typically malformed JSON, an unsupported content type, or a required query/path parameter that could not be parsed.

## How to fix

Inspect `detail` (and `errors` when present) for the exact reason, correct the request, and retry.


# billing_info_required
Source: https://docs.particle.pro/errors/billing_info_required

Billing information is required for paid plans

|                    |                         |
| ------------------ | ----------------------- |
| **HTTP status**    | `402 Payment Required`  |
| **Error code**     | `billing_info_required` |
| **Resolve action** | `setup_billing`         |

## What happened

The organization is trying to select or switch to a paid plan, but no payment method is on file. Free plans do not require billing information.

## How to fix

Visit your organization's <BillingLink>billing page</BillingLink> to add a payment method. Once billing info is on file, retry the plan selection or change request.


# conflict
Source: https://docs.particle.pro/errors/conflict

Request conflicts with current state

|                 |                |
| --------------- | -------------- |
| **HTTP status** | `409 Conflict` |
| **Error code**  | `conflict`     |

## What happened

The request cannot be completed because it conflicts with the current state of the resource — for example, creating something with an identifier or name that already exists.

## How to fix

Reconcile the intended state with the current state (fetch the resource, pick a non-conflicting value, or apply the change to the existing record) and retry.


# credits_depleted
Source: https://docs.particle.pro/errors/credits_depleted

Credit allocation exhausted for this billing period

|                    |                        |
| ------------------ | ---------------------- |
| **HTTP status**    | `402 Payment Required` |
| **Error code**     | `credits_depleted`     |
| **Resolve action** | `upgrade_plan`         |

## What happened

The organization's credit allocation for the current billing period has been fully consumed. API requests are blocked until you upgrade to a higher plan or credits replenish at the start of the next billing period.

## How to fix

#### Option 1: Upgrade to a plan with more credits

<Visibility>
  Visit your <BillingLink>organization's billing settings</BillingLink> to change to a plan with more credits.
</Visibility>

<Visibility>
  ```bash theme={"dark"}
  curl -X PUT https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"plan_id": "HIGHER_TIER_PLAN_ID"}'
  ```
</Visibility>

#### Option 2: Wait for credit replenishment

Credits are replenished at the start of each billing period. The block expires automatically when the new period begins.

Visit your <BillingLink>organization's billing settings</BillingLink> to view your current credit balance and billing period dates.


# email_exists
Source: https://docs.particle.pro/errors/email_exists

Account already exists with this email

|                    |                |
| ------------------ | -------------- |
| **HTTP status**    | `409 Conflict` |
| **Error code**     | `email_exists` |
| **Resolve action** | `login`        |

## What happened

An account with this email address already exists. Each email can only be registered once.

## How to fix

Log in with your existing account via this email. If you own this email address, reset your password if needed.


# email_verification_required
Source: https://docs.particle.pro/errors/email_verification_required

Email verification is required to complete registration

|                    |                               |
| ------------------ | ----------------------------- |
| **HTTP status**    | `200 OK`                      |
| **Error code**     | `email_verification_required` |
| **Resolve action** | `verify_email`                |

## What happened

An email address needs to be verified before it can be used. This error is returned in two contexts:

1. **Account signup** — a verification email has been sent to the registering address; the account is not created until the link is clicked.
2. **Monitor notifications** — a monitor was created or updated with a notification email that has not been verified for the owning organization. The monitor write is rejected so that no monitor silently fails to deliver.

## How to fix

### Account signup

<Steps>
  <Step>
    Check your inbox for an email with the subject "Verify your email address".
  </Step>

  <Step>
    Click the verification link in the email. The link expires in 24 hours.
  </Step>

  <Step>
    After verification, log in with your credentials.
  </Step>
</Steps>

If you did not receive the email, you can request a new one:

<Visibility>
  Try registering again with the same email and password. This will resend the verification email and invalidate any previous verification links.
</Visibility>

<Visibility>
  Call `POST /v1/auth/register` again with the same credentials. This will resend the verification email and invalidate any previous verification links.
</Visibility>

### Monitor notifications

<Steps>
  <Step>
    Start verification for the email address by calling `POST /v1/organizations/{orgId}/notification-emails` with `{"email": "..."}`. A confirmation link is sent to that address.
  </Step>

  <Step>
    Click the link (or `POST /v1/notification-emails/verify` with the token from the link). The link expires in 24 hours.
  </Step>

  <Step>
    Retry the monitor `POST` or `PATCH` — the email is now in the organization's verified pool and the write succeeds.
  </Step>
</Steps>

Monitor notification channels that match the authenticated user's own email address are auto-verified the first time they are used, so no extra step is needed for self-delivery.


# feature_check_failed
Source: https://docs.particle.pro/errors/feature_check_failed

Feature availability check failed

|                 |                             |
| --------------- | --------------------------- |
| **HTTP status** | `500 Internal Server Error` |
| **Error code**  | `feature_check_failed`      |

## What happened

An internal error occurred while verifying feature access. This is a transient server-side issue.

## How to fix

Retry the request after a short delay. If the error persists, contact support at <EmailSupportLink /> or visit the <SupportLink>support page</SupportLink> for direct support.


# forbidden
Source: https://docs.particle.pro/errors/forbidden

Access denied

|                 |                 |
| --------------- | --------------- |
| **HTTP status** | `403 Forbidden` |
| **Error code**  | `forbidden`     |

## What happened

The caller is authenticated but not permitted to perform this action — for example, an API key whose project does not own the requested resource, or a user without the required organization role.

## How to fix

Verify that the authenticated user or API key has access to the target resource. For role-based errors, an owner of the organization can grant the necessary role.


# internal_error
Source: https://docs.particle.pro/errors/internal_error

Unexpected server error

|                 |                             |
| --------------- | --------------------------- |
| **HTTP status** | `500 Internal Server Error` |
| **Error code**  | `internal_error`            |

## What happened

An unexpected server-side error occurred. The request may or may not have been partially processed.

## How to fix

Retry the request after a short delay. If the error persists, check <StatusLink /> for any ongoing incidents, then contact support at <EmailSupportLink /> and include the `X-Trace-ID` response header so we can locate the failure.


# invite_expired
Source: https://docs.particle.pro/errors/invite_expired

Organization invitation has expired

|                    |                  |
| ------------------ | ---------------- |
| **HTTP status**    | `410 Gone`       |
| **Error code**     | `invite_expired` |
| **Resolve action** | `request_invite` |

## What happened

The organization invitation has expired. Invitations are valid for 7 days after being sent.

## How to fix

Ask the organization admin or owner to send a new invitation.

<Visibility>
  They can do this from <BillingLink>your organization's members page</BillingLink>.
</Visibility>

<Visibility>
  An admin can resend the invite via the API. Use the `inviteId` from `GET /v1/organizations/{orgId}/invites`:

  ```bash theme={"dark"}
  curl -X POST https://api.particle.pro/v1/organizations/{orgId}/invites/{inviteId}/resend \
    -H "Authorization: Bearer ADMIN_JWT_TOKEN"
  ```

  Or send a new invitation:

  ```bash theme={"dark"}
  curl -X POST https://api.particle.pro/v1/organizations/{orgId}/invites \
    -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"email": "invitee@example.com", "role": "MEMBER"}'
  ```
</Visibility>

<Note>
  Only organization owners and admins can send invitations.
</Note>


# no_active_plan
Source: https://docs.particle.pro/errors/no_active_plan

No active billing plan

|                    |                        |
| ------------------ | ---------------------- |
| **HTTP status**    | `402 Payment Required` |
| **Error code**     | `no_active_plan`       |
| **Resolve action** | `select_plan`          |

## What happened

The organization does not have an active billing plan. All API requests that require a subscription are blocked until a plan is selected.

This typically occurs when:

* A new organization hasn't selected a plan yet
* The free plan subscription failed during signup and needs to be retried

## How to fix

<Visibility>
  Visit your <BillingLink>organization's billing settings</BillingLink> in the platform UI.
</Visibility>

<Visibility>
  <Steps>
    <Step title="List available plans">
      ```bash theme={"dark"}
      curl https://api.particle.pro/v1/billing/plans \
        -H "Authorization: Bearer YOUR_JWT_TOKEN"
      ```
    </Step>

    <Step title="Select a plan">
      ```bash theme={"dark"}
      curl -X POST https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"plan_id": "PLAN_ID_FROM_STEP_1"}'
      ```

      Requires the **OWNER** role.
    </Step>
  </Steps>
</Visibility>


# no_active_subscription
Source: https://docs.particle.pro/errors/no_active_subscription

No active subscription for spend limit configuration

|                    |                          |
| ------------------ | ------------------------ |
| **HTTP status**    | `400 Bad Request`        |
| **Error code**     | `no_active_subscription` |
| **Resolve action** | `select_plan`            |

## What happened

Spend limits can only be configured on organizations with an active subscription. The organization doesn't have one yet.

## How to fix

<Visibility>
  <Steps>
    <Step>
      Ensure your organization has an active plan.
    </Step>

    <Step>
      Ensure your organization has billing information.
    </Step>
  </Steps>
</Visibility>

<Visibility>
  <Steps>
    <Step title="Select a billing plan">
      ```bash theme={"dark"}
      curl -X POST https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"plan_id": "PLAN_ID"}'
      ```
    </Step>

    <Step title="Configure spend limits">
      ```bash theme={"dark"}
      curl -X PUT https://api.particle.pro/v1/organizations/{orgId}/billing/spend-limits \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"monthly_budget_cents": 10000}'
      ```
    </Step>
  </Steps>
</Visibility>


# not_a_member
Source: https://docs.particle.pro/errors/not_a_member

Not a member of the organization

|                    |                  |
| ------------------ | ---------------- |
| **HTTP status**    | `403 Forbidden`  |
| **Error code**     | `not_a_member`   |
| **Resolve action** | `request_invite` |

## What happened

The authenticated user is not a member of the organization they are trying to access. Organization resources (projects, billing, members, etc.) are only accessible to members.

## How to fix

Ask an organization admin or owner to send you an invitation:

<Visibility>
  1. The admin visits <BillingLink>your organization's members page</BillingLink>.
  2. They send an invite to your email.
  3. You accept the invite from your email and log in successfully.
</Visibility>

<Visibility>
  1. The admin sends an invite:

     ```bash theme={"dark"}
     curl -X POST https://api.particle.pro/v1/organizations/{orgId}/invites \
       -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"email": "invitee@example.com", "role": "MEMBER"}'
     ```

  2. The invitee accepts via the token from the invite email:

     ```bash theme={"dark"}
     curl -X POST https://api.particle.pro/v1/invites/{token}/accept \
       -H "Authorization: Bearer INVITEE_JWT_TOKEN"
     ```
</Visibility>

<Note>
  Invitations expire after 7 days. If your invite has expired, ask the admin to send a new one.
</Note>


# not_found
Source: https://docs.particle.pro/errors/not_found

Resource not found

|                 |                 |
| --------------- | --------------- |
| **HTTP status** | `404 Not Found` |
| **Error code**  | `not_found`     |

## What happened

The requested resource does not exist or is not accessible to the caller. Identifier typos, deleted resources, and cross-tenant access all surface as `not_found`.

## How to fix

Check that the identifier in the URL is correct and that the authenticated caller has access to it.


# notification_email_in_use
Source: https://docs.particle.pro/errors/notification_email_in_use

The notification email is still referenced by one or more monitors

|                    |                              |
| ------------------ | ---------------------------- |
| **HTTP status**    | `409 Conflict`               |
| **Error code**     | `notification_email_in_use`  |
| **Resolve action** | `edit_monitor_notifications` |

## What happened

You tried to delete a notification email that is still listed as a delivery target on one or more monitors in the organization. The system refuses to remove it so monitors don't silently stop delivering.

## How to fix

Monitors are project-scoped, not org-scoped, so locating every monitor that references the email is a two-step traversal: list the org's projects, then list monitors per project.

<Steps>
  <Step>
    List the projects in the organization: `GET /v1/organizations/{orgId}/projects`.
  </Step>

  <Step>
    For each project, list its monitors: `GET /v1/projects/{projectId}/monitors`. Inspect each monitor's `notifications` array for the email you're deleting.
  </Step>

  <Step>
    For each monitor that references the email, `PATCH /v1/monitors/{id}` with a new `notifications` payload that omits it.
  </Step>

  <Step>
    Retry `DELETE /v1/notification-emails/{id}`.
  </Step>
</Steps>

<Visibility>
  Or open the organization's monitor list in the platform UI at `{baseURL}/organizations/{orgId}/monitors` and remove the email from each affected monitor there.
</Visibility>


# Error reference
Source: https://docs.particle.pro/errors/overview

Structured error responses and how to handle them

The Particle API returns structured error responses following [RFC 9457 (Problem Details for HTTP APIs)](https://datatracker.ietf.org/doc/html/rfc9457). Every error includes machine-readable fields for programmatic handling and human-readable fields for display.

## Error response format

```json theme={"dark"}
{
  "type": "https://docs.particle.pro/errors/no_active_plan",
  "title": "Payment Required",
  "status": 402,
  "detail": "No active billing plan.",
  "error_code": "no_active_plan",
  "resolve": {
    "message": "Select a billing plan to continue.",
    "url": "https://platform.particle.pro/organizations/{orgId}/billing",
    "action": "select_plan",
    "method": "POST",
    "endpoint": "/v1/organizations/{orgId}/billing/subscription"
  }
}
```

### Standard fields (RFC 9457)

| Field    | Type    | Description                                                                           |
| -------- | ------- | ------------------------------------------------------------------------------------- |
| `type`   | string  | URI linking to this error's documentation page.                                       |
| `title`  | string  | Short, static summary (e.g. "Payment Required"). Does not change between occurrences. |
| `status` | integer | HTTP status code.                                                                     |
| `detail` | string  | Human-readable explanation of what went wrong.                                        |

### Extension fields

| Field        | Type   | Description                                                               |
| ------------ | ------ | ------------------------------------------------------------------------- |
| `error_code` | string | Stable, machine-readable identifier. Use this for programmatic branching. |
| `resolve`    | object | Actionable resolution guidance. Omitted when no self-service fix exists.  |

### Resolve object

| Field      | Type   | Description                                                                                    |
| ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| `message`  | string | Human-readable call-to-action (e.g. "Select a billing plan to continue.").                     |
| `url`      | string | Deep link into the <DashboardLink>platform UI</DashboardLink> where a human can fix the issue. |
| `action`   | string | Machine-readable action type for agents (e.g. `select_plan`).                                  |
| `method`   | string | HTTP method for the resolution endpoint.                                                       |
| `endpoint` | string | API path an agent can call to fix the issue.                                                   |

## Handling errors

### For UI clients

1. Switch on `error_code` to render the appropriate component or message.
2. Use `resolve.url` to link the user to the relevant platform page.
3. Fall back to displaying `detail` if the `error_code` is unrecognized.

### For agents and SDKs

1. Switch on `error_code` to decide the remediation path.
2. Use `resolve.action` as a semantic intent (e.g. `select_plan`, `contact_support`).
3. Call `resolve.method` + `resolve.endpoint` to fix the issue programmatically.
4. Dereference `type` for documentation on the specific error.

## Error codes by category

### Billing & subscription

<CardGroup>
  <Card title="no_active_plan" icon="credit-card" href="/errors/no_active_plan">
    No billing plan selected.
  </Card>

  <Card title="billing_info_required" icon="credit-card" href="/errors/billing_info_required">
    Payment method needed for paid plans.
  </Card>

  <Card title="plan_required" icon="credit-card" href="/errors/plan_required">
    A plan is required before creating projects.
  </Card>

  <Card title="payment_past_due" icon="clock" href="/errors/payment_past_due">
    Payment is overdue.
  </Card>

  <Card title="subscription_suspended" icon="ban" href="/errors/subscription_suspended">
    Subscription suspended for non-payment.
  </Card>

  <Card title="subscription_inactive" icon="ban" href="/errors/subscription_inactive">
    Subscription is not active.
  </Card>

  <Card title="subscription_not_found" icon="magnifying-glass" href="/errors/subscription_not_found">
    Billing subscription missing.
  </Card>

  <Card title="no_active_subscription" icon="magnifying-glass" href="/errors/no_active_subscription">
    No subscription exists for spend limit configuration.
  </Card>

  <Card title="plan_not_selected" icon="credit-card" href="/errors/plan_not_selected">
    A plan must be selected before performing this action.
  </Card>

  <Card title="plan_does_not_support_overage_usage" icon="gauge-max" href="/errors/plan_does_not_support_overage_usage">
    Current plan does not allow usage beyond included limits.
  </Card>
</CardGroup>

### Usage limits

<CardGroup>
  <Card title="spend_limit_exceeded" icon="gauge-max" href="/errors/spend_limit_exceeded">
    Monthly budget cap reached.
  </Card>

  <Card title="credits_depleted" icon="gauge-max" href="/errors/credits_depleted">
    Credit balance exhausted.
  </Card>

  <Card title="rate_limit_exceeded" icon="gauge-max" href="/errors/rate_limit_exceeded">
    Too many requests — rate limit exceeded.
  </Card>
</CardGroup>

### Authentication & authorization

<CardGroup>
  <Card title="auth_required" icon="lock" href="/errors/auth_required">
    No valid authentication provided.
  </Card>

  <Card title="api_key_required" icon="key" href="/errors/api_key_required">
    No valid API key provided.
  </Card>

  <Card title="pro_required" icon="star" href="/errors/pro_required">
    Pro subscription needed.
  </Card>

  <Card title="not_a_member" icon="user-slash" href="/errors/not_a_member">
    Not a member of the organization.
  </Card>
</CardGroup>

### Account

<CardGroup>
  <Card title="email_exists" icon="envelope" href="/errors/email_exists">
    Account already exists with this email.
  </Card>

  <Card title="token_invalid" icon="link-slash" href="/errors/token_invalid">
    Reset token is invalid.
  </Card>

  <Card title="token_expired" icon="hourglass-end" href="/errors/token_expired">
    Reset token has expired.
  </Card>

  <Card title="social_login_only" icon="google" href="/errors/social_login_only">
    Account uses social login.
  </Card>

  <Card title="invite_expired" icon="envelope-open" href="/errors/invite_expired">
    Organization invite has expired.
  </Card>

  <Card title="email_verification_required" icon="envelope" href="/errors/email_verification_required">
    Email verification required to complete registration.
  </Card>
</CardGroup>

### Generic

These codes are returned when a more specific code does not apply — typically for request validation, missing resources, and unexpected failures.

<CardGroup>
  <Card title="bad_request" icon="circle-exclamation" href="/errors/bad_request">
    Request was malformed or unparseable.
  </Card>

  <Card title="validation_error" icon="circle-exclamation" href="/errors/validation_error">
    Request body or parameters failed schema validation.
  </Card>

  <Card title="not_found" icon="magnifying-glass" href="/errors/not_found">
    Requested resource does not exist or is not accessible.
  </Card>

  <Card title="conflict" icon="code-merge" href="/errors/conflict">
    Request conflicts with the current state of the resource.
  </Card>

  <Card title="forbidden" icon="lock" href="/errors/forbidden">
    Authenticated caller is not permitted to perform this action.
  </Card>

  <Card title="internal_error" icon="server" href="/errors/internal_error">
    Unexpected server error — retry, and contact support if it persists.
  </Card>
</CardGroup>

### Internal

<CardGroup>
  <Card title="feature_check_failed" icon="server" href="/errors/feature_check_failed">
    Feature availability check failed.
  </Card>
</CardGroup>


# payment_past_due
Source: https://docs.particle.pro/errors/payment_past_due

Payment is past due

|                    |                         |
| ------------------ | ----------------------- |
| **HTTP status**    | `402 Payment Required`  |
| **Error code**     | `payment_past_due`      |
| **Resolve action** | `update_payment_method` |

## What happened

The organization's subscription payment has failed. API access is blocked until the payment issue is resolved.

## How to fix

Visit your <BillingLink>organization's billing page</BillingLink> to update the payment method on file. The organization owner can update payment details from there. Once a successful payment is processed, API access is restored automatically.


# plan_does_not_support_overage_usage
Source: https://docs.particle.pro/errors/plan_does_not_support_overage_usage

The current plan does not support overage usage configuration

|                    |                                       |
| ------------------ | ------------------------------------- |
| **HTTP status**    | `409 Conflict`                        |
| **Error code**     | `plan_does_not_support_overage_usage` |
| **Resolve action** | `upgrade_plan`                        |

## What happened

Your current plan does not support overage usage configuration.

## How to fix

Overage usage is only supported on the Growth plan. Other plans cap usage at the plan limit and do not support additional billing beyond that.

If you are on the Growth plan:

<Visibility>
  <Steps>
    <Step>
      Navigate to your <BillingLink>organization's billing page</BillingLink>.
    </Step>

    <Step>
      Enable the "Extra Usage" toggle to allow additional usage.
    </Step>

    <Step>
      Optionally, set an overage limit to stop overage spending at some fixed amount.
    </Step>
  </Steps>
</Visibility>

<Visibility>
  Switch to a plan that supports overage configuration, then enable overage:

  <Steps>
    <Step title="Switch to a plan that supports overage">
      ```bash theme={"dark"}
      curl -X PUT https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"plan_id": "PLAN_ID"}'
      ```
    </Step>

    <Step title="Enable overage">
      ```bash theme={"dark"}
      curl -X PATCH https://api.particle.pro/v1/organizations/{orgId} \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"overage_enabled": true}'
      ```
    </Step>
  </Steps>
</Visibility>


# plan_not_selected
Source: https://docs.particle.pro/errors/plan_not_selected

Organization has no active plan selected

|                    |                     |
| ------------------ | ------------------- |
| **HTTP status**    | `409 Conflict`      |
| **Error code**     | `plan_not_selected` |
| **Resolve action** | `select_plan`       |

## What happened

A plan change was requested but the organization does not have an active plan yet. You must select an initial plan before you can switch to a different one.

## How to fix

<Visibility>
  Navigate to your <BillingLink>organization's billing page</BillingLink> and verify that your organization has an active plan.
</Visibility>

<Visibility>
  Select an initial plan first:

  ```bash theme={"dark"}
  curl -X POST https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"plan_id": "PLAN_ID"}'
  ```

  Then use `PUT /v1/organizations/{orgId}/billing/subscription` to change plans.
</Visibility>


# plan_required
Source: https://docs.particle.pro/errors/plan_required

A billing plan is required to create projects

|                    |                        |
| ------------------ | ---------------------- |
| **HTTP status**    | `402 Payment Required` |
| **Error code**     | `plan_required`        |
| **Resolve action** | `select_plan`          |

## What happened

Project creation requires an active billing plan. Since all organizations are auto-subscribed to the free plan on signup, this error only occurs if the billing subscription failed during registration.

## How to fix

<Visibility>
  Navigate to your <BillingLink>organization's billing page</BillingLink> and verify that your organization has an active plan.
</Visibility>

<Visibility>
  Select a plan (including the free plan) to activate the organization:

  ```bash theme={"dark"}
  curl -X POST https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"plan_id": "PLAN_ID"}'
  ```

  Then retry project creation.
</Visibility>


# pro_required
Source: https://docs.particle.pro/errors/pro_required

Pro subscription required

|                    |                 |
| ------------------ | --------------- |
| **HTTP status**    | `403 Forbidden` |
| **Error code**     | `pro_required`  |
| **Resolve action** | `select_plan`   |

## What happened

The authenticated user does not have access to Particle API features. This endpoint requires an active Pro subscription.

## How to fix

<Visibility>
  Navigate to your <BillingLink>organization's billing page</BillingLink> and verify that your organization has an active Pro subscription.
</Visibility>

<Visibility>
  <Steps>
    <Step title="List available plans">
      ```bash theme={"dark"}
      curl https://api.particle.pro/v1/billing/plans \
        -H "Authorization: Bearer YOUR_JWT_TOKEN"
      ```
    </Step>

    <Step title="Select a Pro plan">
      ```bash theme={"dark"}
      curl -X POST https://api.particle.pro/v1/organizations/{orgId}/billing/subscription \
        -H "Authorization: Bearer YOUR_JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"plan_id": "PLAN_ID"}'
      ```
    </Step>
  </Steps>
</Visibility>

Requires the **OWNER** role on the organization.


# rate_limit_exceeded
Source: https://docs.particle.pro/errors/rate_limit_exceeded

API rate limit exceeded

|                    |                                 |
| ------------------ | ------------------------------- |
| **HTTP status**    | `429 Too Many Requests`         |
| **Error code**     | `rate_limit_exceeded`           |
| **Resolve action** | `upgrade_plan` (free tier only) |

## What happened

The organization has exceeded the allowed number of API requests per minute. Rate limits are enforced per organization and vary by plan:

| Plan | Limit                  |
| ---- | ---------------------- |
| Free | 1,000 requests/minute  |
| Paid | 10,000 requests/minute |

## Response headers

Responses for API-key-authenticated requests include rate limit headers so clients can track their usage:

| Header                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests allowed per minute                     |
| `X-RateLimit-Remaining` | Requests remaining in the current window                |
| `X-RateLimit-Reset`     | Seconds until the rate limit window resets              |
| `Retry-After`           | Seconds to wait before retrying (only on 429 responses) |

## How to fix

Wait for the rate limit window to reset. The `Retry-After` response header indicates how many seconds to wait before retrying. Reduce your request rate or implement exponential backoff to avoid hitting the limit repeatedly.


# social_login_only
Source: https://docs.particle.pro/errors/social_login_only

Account uses social login

|                    |                            |
| ------------------ | -------------------------- |
| **HTTP status**    | `422 Unprocessable Entity` |
| **Error code**     | `social_login_only`        |
| **Resolve action** | `login`                    |

## What happened

The account was created using Google sign-in and does not have a password set. Password reset is not available for social login accounts.

## How to fix

Visit the <LoginLink>login page</LoginLink> and click "Sign in with Google".


# spend_limit_exceeded
Source: https://docs.particle.pro/errors/spend_limit_exceeded

Monthly spend limit exceeded

|                    |                        |
| ------------------ | ---------------------- |
| **HTTP status**    | `402 Payment Required` |
| **Error code**     | `spend_limit_exceeded` |
| **Resolve action** | `update_spend_limits`  |

## What happened

The organization's API usage has reached the configured monthly budget cap. All API requests are blocked until the spend limit is increased or the next billing period begins.

## How to fix

Increase the spend limit:

<Visibility>
  <Steps>
    <Step>
      Navigate to your <BillingLink>organization's billing page</BillingLink>.
    </Step>

    <Step>
      Increase your organization's spend limit to a higher amount.
    </Step>
  </Steps>
</Visibility>

<Visibility>
  Increase the limit:

  ```bash theme={"dark"}
  curl -X PUT https://api.particle.pro/v1/organizations/{orgId}/billing/spend-limits \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"monthly_budget_cents": 50000}'
  ```

  Or remove the limit entirely:

  ```bash theme={"dark"}
  curl -X DELETE https://api.particle.pro/v1/organizations/{orgId}/billing/spend-limits \
    -H "Authorization: Bearer YOUR_JWT_TOKEN"
  ```

  Both actions immediately unblock the organization if the new limit exceeds current spend.
</Visibility>

Requires the **OWNER** role.

Alternatively, wait for the next billing period — the block expires automatically at the end of the current period.


# subscription_already_canceled
Source: https://docs.particle.pro/errors/subscription_already_canceled

Subscription is already canceled

|                 |                                 |
| --------------- | ------------------------------- |
| **HTTP status** | `409 Conflict`                  |
| **Error code**  | `subscription_already_canceled` |

## What happened

The organization's subscription is already in the canceled state. A subsequent cancel-plan or change-plan request was rejected because there is no active subscription to modify.

## How to fix

Cancellation is terminal — selecting a new plan or changing plans on a canceled organization is not supported. Wait for the cancellation to take effect (see the `canceled_at` field on the organization), then either delete the organization once it is fully elapsed or contact support if the cancellation was made by mistake.


# subscription_canceled
Source: https://docs.particle.pro/errors/subscription_canceled

Subscription has been canceled

|                    |                                                                      |
| ------------------ | -------------------------------------------------------------------- |
| **HTTP status**    | `402 Payment Required` (data API) / `403 Forbidden` (org management) |
| **Error code**     | `subscription_canceled`                                              |
| **Resolve action** | `contact_support`                                                    |

## What happened

The organization's subscription has been canceled. PAYG cancellations take effect immediately; fixed-price cancellations take effect at the end of the current billing period. Once the cancellation is in effect, API access is blocked and most org-management mutations (creating projects, API keys, invites, spend limits) are disabled.

Canceled organizations remain readable — usage history, members, billing summary, and invoices stay accessible. Once the cancellation has fully elapsed, the organization can be deleted.

## How to fix

Cancellation is terminal — selecting a new plan or changing plans on a canceled organization will return [`subscription_already_canceled`](/errors/subscription_already_canceled).

If you canceled by mistake, <SupportLink>contact support</SupportLink> before the cancellation takes effect. After the effective date, create a new organization to start fresh.


# subscription_inactive
Source: https://docs.particle.pro/errors/subscription_inactive

Subscription is not active

|                    |                         |
| ------------------ | ----------------------- |
| **HTTP status**    | `402 Payment Required`  |
| **Error code**     | `subscription_inactive` |
| **Resolve action** | `contact_support`       |

## What happened

The organization's subscription is in an inactive state. This can occur due to cancellation, administrative action, or an unrecognized subscription lifecycle state.

## How to fix

Contact support at <EmailSupportLink /> or visit the <SupportLink>support page</SupportLink> to restore your subscription.


# subscription_not_found
Source: https://docs.particle.pro/errors/subscription_not_found

Billing subscription not found

|                    |                           |
| ------------------ | ------------------------- |
| **HTTP status**    | `503 Service Unavailable` |
| **Error code**     | `subscription_not_found`  |
| **Resolve action** | `contact_support`         |

## What happened

The organization has a plan set locally but no matching subscription could be found in the billing provider. This is an unexpected state that requires manual intervention.

## How to fix

Contact support at <EmailSupportLink /> or visit the <SupportLink>support page</SupportLink> to resolve your billing state.


# subscription_suspended
Source: https://docs.particle.pro/errors/subscription_suspended

Subscription suspended due to non-payment

|                    |                          |
| ------------------ | ------------------------ |
| **HTTP status**    | `402 Payment Required`   |
| **Error code**     | `subscription_suspended` |
| **Resolve action** | `contact_support`        |

## What happened

The organization's subscription has been suspended after repeated payment failures. API access is fully blocked.

## How to fix

Contact support at <EmailSupportLink /> or visit the <SupportLink>support page</SupportLink> to restore your subscription.


# token_expired
Source: https://docs.particle.pro/errors/token_expired

Reset token has expired or already been used

|                    |                          |
| ------------------ | ------------------------ |
| **HTTP status**    | `410 Gone`               |
| **Error code**     | `token_expired`          |
| **Resolve action** | `request_password_reset` |

## What happened

The password reset token has expired (tokens are valid for 1 hour) or has already been used to reset the password.

## How to fix

<ForgotPasswordLink>Request a new password reset link</ForgotPasswordLink> to receive a fresh reset link in your email.


# token_invalid
Source: https://docs.particle.pro/errors/token_invalid

Invalid or expired reset token

|                    |                          |
| ------------------ | ------------------------ |
| **HTTP status**    | `404 Not Found`          |
| **Error code**     | `token_invalid`          |
| **Resolve action** | `request_password_reset` |

## What happened

The password reset token is not recognized. It may have been mistyped, truncated, or belongs to a different environment.

## How to fix

<ForgotPasswordLink>Request a new password reset link</ForgotPasswordLink> to receive a fresh reset link in your email.

<Note>
  Reset tokens expire after 1 hour and can only be used once.
</Note>


# validation_error
Source: https://docs.particle.pro/errors/validation_error

Request body or parameters failed validation

|                 |                            |
| --------------- | -------------------------- |
| **HTTP status** | `422 Unprocessable Entity` |
| **Error code**  | `validation_error`         |

## What happened

The request was well-formed but failed schema validation. One or more fields violated type, format, range, or presence constraints.

The `errors` array contains one entry per field. Each includes a `location` (e.g. `body.items[3].name`) and a `message` describing the violation.

## How to fix

Inspect the `errors` array, fix the offending fields, and retry.


# Particle API
Source: https://docs.particle.pro/index

Inside every podcast: transcripts, speakers, entities, sponsors, and a knowledge graph that connects people and companies across episodes.

Particle API gives you what's inside the audio. Every episode is transcribed and diarized, broken into structural segments, distilled into engagement-scored clips, and linked to a knowledge graph of people, organizations, and companies. The same identifiers connect a guest on one podcast to a company's full profile, its product hierarchy, and the sponsors funding the shows where it's discussed.

Use it to track what people are saying, find the most quotable moments on any subject, monitor how companies show up across audio, or build research tools that read audio the way they read text.

<CardGroup>
  <Card title="Quickstart" icon="rocket" href="/quickstart">
    Make your first call and trace one entity across podcasts, dialogue, and companies in five minutes.
  </Card>

  <Card title="Podcasts" icon="microphone" href="/podcasts/overview">
    Episodes, transcripts, segments, clips, and the bias analysis behind every show.
  </Card>

  <Card title="Companies" icon="building" href="/companies/overview">
    Cross-referenced identifiers (CIK, ticker, domain, QID, entity slug) and full product hierarchies.
  </Card>

  <Card title="Knowledge graph" icon="users" href="/knowledge-graph/entities">
    People, organizations, and places — the connective tissue between audio and structured data.
  </Card>

  <Card title="Podcast advertising" icon="bullhorn" href="/podcasts/advertising">
    Sponsor breakdowns, leaderboards, co-occurrence, and per-company ad presence.
  </Card>

  <Card title="API reference" icon="terminal" href="/api-reference/introduction">
    Every endpoint, request, and response schema.
  </Card>
</CardGroup>


# Entities
Source: https://docs.particle.pro/knowledge-graph/entities

People, organizations, places, and concepts — the connective tissue across audio and structured data.

Entities are the knowledge-graph layer that connects everything else. The same entity (Sam Altman, Nvidia, Federal Reserve) appears as a speaker on episodes, as a mention in transcripts, as a sponsor in advertising data, and as the linked identity on a company profile. Resolve once, then follow the entity across the platform.

Each entity has a stable `slug` (e.g. `sam-altman`, `nvidia`, `kara-swisher`) and a canonical `id`. Either is accepted anywhere an entity reference is needed.

<Note>Available to MCP agents as [`entities/resolve_entity`](/mcp/tools/entities/resolve-entity).</Note>

## Search entities

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/entities?q=Sam+Altman&limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/entities?q=Sam+Altman&limit=3",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/entities",
      params={"q": "Sam Altman", "limit": 3},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "17PzxG1t12xzno",
      "slug": "sam-altman",
      "name": "Sam Altman",
      "description": "CEO of OpenAI",
      "wikipedia_url": "https://en.wikipedia.org/wiki/Sam_Altman"
    }
  ],
  "has_more": false
}
```

### Filter parameters

| Parameter    | Description                                          |
| ------------ | ---------------------------------------------------- |
| `q`          | Name search (case-insensitive)                       |
| `podcast_id` | Restrict to entities appearing in a specific podcast |

## Get a single entity

```bash theme={"dark"}
# Either of these resolves to Sam Altman
curl "https://api.particle.pro/v1/entities/sam-altman" \
  -H "X-API-Key: $PARTICLE_API_KEY"
curl "https://api.particle.pro/v1/entities/17PzxG1t12xzno" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response theme={"dark"}
{
  "id": "17PzxG1t12xzno",
  "slug": "sam-altman",
  "name": "Sam Altman",
  "description": "CEO of OpenAI",
  "wikipedia_url": "https://en.wikipedia.org/wiki/Sam_Altman",
  "image_url": "https://cdn.particle.pro/url/media/kge/m/02kx06l/…"
}
```

## Podcast appearances

To find every podcast episode where an entity has been featured or discussed across the catalog, use [`list-episodes`](/podcasts/episodes#list-episodes) with an `entity_id` filter. Add a `role` filter to narrow to `guest`, `host`, `panelist`, `correspondent`, or `mention`.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes?entity_id=sam-altman&limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "78cgekLUjCJBUZbj3s5K8Y",
      "title": "WHCD Shooting Aftermath, Musk and Altman Face-Off, Spirit Airlines Bailout",
      "podcast": { "id": "QpMz7GYKfSNuUa6zKXA4Q", "title": "Pivot" },
      "published_at": "2026-04-28T10:00:00Z",
      "duration_seconds": 4206,
      "has_transcript": true,
      "segment_count": 21,
      "clip_count": 8,
      "entity_count": 146,
      "speakers": [ /* … */ ]
    }
    // …
  ],
  "has_more": true,
  "cursor": "…"
}
```

Add `role=guest` to limit results to episodes where the entity was actually a guest, rather than every episode that happens to mention them.

## A typical cross-referencing flow

<Steps>
  <Step title="Resolve the entity">
    Look up by name (`?q=`) or use a slug you already have.

    ```bash theme={"dark"}
    curl ".../v1/entities/sam-altman"
    ```
  </Step>

  <Step title="Find episodes">
    Use the slug as `entity_id` on episodes or clips.

    ```bash theme={"dark"}
    curl ".../v1/podcasts/episodes?entity_id=sam-altman&limit=10"
    ```
  </Step>

  <Step title="Drill into one episode">
    Pull the dialogue lines around mentions, or the highlight clips.

    ```bash theme={"dark"}
    curl ".../v1/podcasts/episodes/{id}/transcript/mentions?entity_id=sam-altman"
    curl ".../v1/podcasts/episodes/{id}/clips"
    ```
  </Step>

  <Step title="Cross to companies">
    Many entities are also linked to companies. Lookup by `entity_id` on the companies endpoint.

    ```bash theme={"dark"}
    curl ".../v1/companies?entity_id=nvidia"
    ```
  </Step>
</Steps>

The [Quickstart](/quickstart) walks the full flow end-to-end.

## Related

* [Topics](/knowledge-graph/topics) — taxonomy companion to entities
* [Companies → Overview](/companies/overview) — entities linked to company records
* [Transcripts → Mentions](/podcasts/transcripts#transcript-mentions) — dialogue around entity mentions
* [Concepts → IDs and slugs](/concepts#ids-and-slugs) — slug resolution rules


# Topics
Source: https://docs.particle.pro/knowledge-graph/topics

Hierarchical topic taxonomy used to classify episodes.

Topics form a tree. Broad categories like `Politics` and `Business` contain subtopics like `politics/elections` and `business/technology`. Episodes are classified into topics automatically — fetch the taxonomy to power category navigation, route episodes to topic-specific feeds, or filter content by interest.

<Note>Available to MCP agents as [`entities/browse_topics`](/mcp/tools/entities/browse-topics).</Note>

## Browse the taxonomy

Top-level topics:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/topics?limit=10" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch("https://api.particle.pro/v1/topics?limit=10", {
    headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
  });
  const { data } = await res.json();
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    { "id": "FMABRApV", "name": "Society",     "slug": "society",     "ancestry_path": "E-sJ7" },
    { "id": "4FZ5KFM",  "name": "Government",  "slug": "government",  "ancestry_path": "Qcqm_" },
    { "id": "4FaC4H9",  "name": "Business",    "slug": "business",    "ancestry_path": "gWDfW" },
    { "id": "4FZ4EFh",  "name": "Politics",    "slug": "politics",    "ancestry_path": "GtizK" },
    { "id": "4K6dD5X",  "name": "Media",       "slug": "media",       "ancestry_path": "cbYxV" }
    // …
  ]
}
```

The `ancestry_path` is an opaque hash-based path used for programmatic ancestor filtering. Slugs follow a `parent/child` convention for subtopics (e.g. `politics/elections`).

## Navigate the tree

Get direct children of a topic by passing `parent_id`:

```bash theme={"dark"}
# Subtopics under Politics
curl "https://api.particle.pro/v1/topics?parent_id=4FZ4EFh" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    { "id": "4FZ4EFi",  "name": "International Relations", "slug": "politics/international-relations", "ancestry": "Politics" },
    { "id": "4FZ53X4",  "name": "Elections",               "slug": "politics/elections",               "ancestry": "Politics" },
    { "id": "FMEs52mJ", "name": "Political Parties",       "slug": "politics/political-parties",       "ancestry": "Politics" },
    { "id": "GIO2VHkb", "name": "Political Figures",       "slug": "politics/political-figures",       "ancestry": "Politics" }
    // …
  ]
}
```

## Get a single topic

```bash theme={"dark"}
curl "https://api.particle.pro/v1/topics/4FZ4EFh" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```json Response theme={"dark"}
{
  "id": "4FZ4EFh",
  "name": "Politics",
  "slug": "politics",
  "ancestry_path": "GtizK"
}
```

For non-root topics the response also includes `ancestors` (an array of topic names from root to parent) and `ancestry` (a single human-readable breadcrumb string). Use `ancestors` to render breadcrumb UI.

## Topics for an episode

Podcast episodes are classified into topics automatically. Fetch the topics for any episode:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/{episode_id}/topics" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

See [Episodes → Topics](/podcasts/episodes#topics) for the integrated discovery flow.

## Related

* [Entities](/knowledge-graph/entities) — the people, organizations, and places counterpart to topics
* [Episodes](/podcasts/episodes) — filter by topic, then drill into transcripts and clips


# Authentication
Source: https://docs.particle.pro/mcp/authentication

OAuth 2.1 end-to-end — discovery, dynamic client registration, authorization code with PKCE, refresh, revocation, and the audience-binding rules the resource server enforces.

The Particle Pro MCP server is an OAuth 2.1 protected resource. There are no API keys, no shared secrets, and no static bearer tokens — every request carries a short-lived JWT minted by the Particle Pro Authorization Server and bound to the MCP resource via its `aud` claim.

This page is for client implementers. If you are using a stock MCP client (Claude Code, Cursor, VS Code, Claude Desktop) the OAuth flow is automatic — see the [Quickstart](/mcp/quickstart).

## At a glance

|                          |                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **Protected resource**   | `https://mcp.particle.pro`                                                            |
| **Resource metadata**    | `https://mcp.particle.pro/.well-known/oauth-protected-resource` (and `/mcp` sub-path) |
| **Authorization Server** | `https://api.particle.pro`                                                            |
| **AS metadata**          | `https://api.particle.pro/.well-known/oauth-authorization-server`                     |
| **JWKS**                 | `https://api.particle.pro/.well-known/jwks.json`                                      |
| **Grant types**          | `authorization_code`, `refresh_token`                                                 |
| **PKCE**                 | Required, `code_challenge_method=S256` only                                           |
| **Auth methods**         | `none` (public clients), `client_secret_basic`, `client_secret_post`                  |
| **Scopes**               | `mcp:read`, `mcp:write`                                                               |
| **Access token TTL**     | 15 minutes                                                                            |
| **Refresh token TTL**    | 30 days, rotated on every use                                                         |

## Discovery

Start from the resource. Fetch the protected-resource metadata document:

```http theme={"dark"}
GET /.well-known/oauth-protected-resource HTTP/1.1
Host: mcp.particle.pro
```

```json theme={"dark"}
{
  "resource": "https://mcp.particle.pro",
  "authorization_servers": ["https://api.particle.pro"],
  "bearer_methods_supported": ["header"],
  "scopes_supported": ["mcp:read", "mcp:write"],
  "resource_documentation": "https://docs.particle.pro/mcp"
}
```

Then fetch the Authorization Server metadata from the URL in `authorization_servers`:

```http theme={"dark"}
GET /.well-known/oauth-authorization-server HTTP/1.1
Host: api.particle.pro
```

```json theme={"dark"}
{
  "issuer": "https://api.particle.pro",
  "authorization_endpoint": "https://api.particle.pro/oauth/authorize",
  "token_endpoint": "https://api.particle.pro/oauth/token",
  "registration_endpoint": "https://api.particle.pro/oauth/register",
  "revocation_endpoint": "https://api.particle.pro/oauth/revoke",
  "jwks_uri": "https://api.particle.pro/.well-known/jwks.json",
  "scopes_supported": ["mcp:read", "mcp:write"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
  "subject_types_supported": ["public"],
  "client_id_metadata_document_supported": true,
  "service_documentation": "https://docs.particle.pro/mcp/oauth"
}
```

If a request to the MCP endpoint comes in unauthenticated, the server returns `401` with a `WWW-Authenticate` header pointing at the resource-metadata document, so a client that doesn't pre-fetch metadata still discovers the AS:

```http theme={"dark"}
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp", error="invalid_token", resource_metadata="https://mcp.particle.pro/.well-known/oauth-protected-resource"
```

The human-readable description (e.g. `bearer token required`, `grant revoked or unknown`) is in the response body, not the header.

## Client registration

You have two ways to register a client.

### Dynamic Client Registration (RFC 7591)

The simplest path. POST to the registration endpoint with at least `client_name` and `redirect_uris`:

```http theme={"dark"}
POST /oauth/register HTTP/1.1
Host: api.particle.pro
Content-Type: application/json

{
  "client_name": "Acme Research Agent",
  "client_uri": "https://acme.example",
  "logo_uri": "https://acme.example/logo.png",
  "redirect_uris": ["http://localhost:43217/callback"],
  "token_endpoint_auth_method": "none"
}
```

Response (RFC 7591 § 3.2):

```json theme={"dark"}
{
  "client_id": "c_abc123…",
  "client_name": "Acme Research Agent",
  "redirect_uris": ["http://localhost:43217/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

Defaults applied when omitted:

* `token_endpoint_auth_method`: `none` (i.e. public client, PKCE-only)
* `grant_types`: `["authorization_code", "refresh_token"]`
* `response_types`: `["code"]`

For confidential clients (any `token_endpoint_auth_method` other than `none`) the response includes `client_secret` exactly once — store it securely, the AS does not return it again.

### Client ID Metadata Document (CIMD)

Agents that already publish a metadata document at an HTTPS URL can skip DCR entirely and pass the URL itself as `client_id` to `/oauth/authorize`. The AS fetches the document, validates it, and caches it. The CIMD spec is `draft-ietf-oauth-client-id-metadata-document`.

Use this when your agent runs in many places (you don't want to register N clients) but has a stable identity (your domain).

## Authorization code with PKCE

Generate a high-entropy `code_verifier`, then derive its S256 challenge:

```bash theme={"dark"}
code_verifier=$(openssl rand -base64 64 | tr -d '\n' | tr '+/' '-_' | tr -d '=' | cut -c1-128)
code_challenge=$(printf "%s" "$code_verifier" | openssl dgst -sha256 -binary | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')
```

Open the authorization URL in a browser:

```
https://api.particle.pro/oauth/authorize?
  response_type=code&
  client_id=c_abc123…&
  redirect_uri=http%3A%2F%2Flocalhost%3A43217%2Fcallback&
  scope=mcp%3Aread%20mcp%3Awrite&
  state=<random>&
  code_challenge=<code_challenge>&
  code_challenge_method=S256&
  resource=https%3A%2F%2Fmcp.particle.pro
```

Required parameters:

* `response_type=code` (only flow supported)
* `client_id` — from registration or CIMD URL
* `redirect_uri` — must match a value the client registered
* `code_challenge` + `code_challenge_method=S256` — PKCE is mandatory
* `resource=https://mcp.particle.pro` — RFC 8707 audience binding; the AS rejects any other value

`scope` is optional. If omitted the AS issues `mcp:read mcp:write` by default. Naming an unknown scope is rejected (the AS will redirect with `error=invalid_scope` rather than silently up-scoping).

The user signs in (if not already), picks a project, and approves the requested scopes. The AS redirects back to your `redirect_uri`:

```
http://localhost:43217/callback?code=auth_xyz…&state=<your-state>
```

Exchange the code for tokens:

```http theme={"dark"}
POST /oauth/token HTTP/1.1
Host: api.particle.pro
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=auth_xyz…&
redirect_uri=http%3A%2F%2Flocalhost%3A43217%2Fcallback&
code_verifier=<your-code_verifier>&
client_id=c_abc123…&
resource=https%3A%2F%2Fmcp.particle.pro
```

For confidential clients, authenticate one of two ways:

* **`client_secret_basic`** — drop `client_id` from the form body and send `client_id:client_secret` URL-form-encoded in an HTTP Basic `Authorization` header.
* **`client_secret_post`** — keep `client_id` in the form body and add a `client_secret` field alongside it.

Public clients (`token_endpoint_auth_method=none`) keep `client_id` in the form body and send no secret.

Response:

```json theme={"dark"}
{
  "access_token": "eyJhbGciOiJSUzI1NiIs…",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "rt_…",
  "scope": "mcp:read mcp:write"
}
```

## Calling the MCP endpoint

Send the access token as a bearer in the `Authorization` header. The MCP server only accepts header-borne tokens (`bearer_methods_supported: ["header"]`) — no query-string tokens, no form-body tokens.

```http theme={"dark"}
POST /mcp HTTP/1.1
Host: mcp.particle.pro
Authorization: Bearer eyJhbGciOiJSUzI1NiIs…
Content-Type: application/json

{ "jsonrpc": "2.0", "method": "tools/list", "id": 1 }
```

The resource server validates the token in this order:

1. Verify the JWT signature against the rotating JWKS at `https://api.particle.pro/.well-known/jwks.json`.
2. Confirm `iss=https://api.particle.pro`, `aud=https://mcp.particle.pro`, and `exp` is in the future.
3. Look up the `grant_id` claim — the grant must still be active (not revoked, not user-disabled).
4. Confirm the token's `sub`, `client_id`, and `project_id` claims match the grant row (defense in depth against a buggy or compromised signer).

Any failure returns `401` with a `WWW-Authenticate` challenge.

## Refresh and rotation

When the access token nears expiry, exchange the refresh token:

```http theme={"dark"}
POST /oauth/token HTTP/1.1
Host: api.particle.pro
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=rt_…&
client_id=c_abc123…&
resource=https%3A%2F%2Fmcp.particle.pro
```

Refresh tokens **rotate** on every use — the response carries a *new* refresh token; the old one is consumed. If the AS sees the same refresh token presented twice (replay) or two refreshes race for the same token, it revokes the entire grant chain immediately. Store the latest refresh token atomically; never retry a refresh request with the same token.

## Revocation

Either side can revoke a grant:

```http theme={"dark"}
POST /oauth/revoke HTTP/1.1
Host: api.particle.pro
Content-Type: application/x-www-form-urlencoded

token=rt_…&
client_id=c_abc123…
```

Users can also revoke connections from `https://platform.particle.pro` → Connected Applications. Once a grant is revoked, all access tokens issued from it stop validating immediately at the resource server (the grant lookup fails) and the refresh token can no longer be exchanged.

## Audience binding (RFC 8707)

Every authorization request and every token request must include `resource=https://mcp.particle.pro`. The AS rejects mismatches with `error=invalid_target`. The minted access token carries `aud=https://mcp.particle.pro`, and the MCP server rejects any token with a different `aud` — even a valid token issued for some hypothetical other Particle resource would not work here. This is the standard "confused deputy" safeguard.

## Scopes

Two scopes today; finer-grained scopes can be added as the surface grows:

| Scope       | Granted access                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp:read`  | Read your Particle Pro data via MCP tools.                                                                                                     |
| `mcp:write` | Take actions on your behalf in Particle Pro via MCP tools. (All current tools are read-only — `mcp:write` is reserved for future write tools.) |

Today every tool advertises `readOnlyHint: true`; `mcp:write` is requested by default but does not unlock additional surface yet.

## Key rotation

The AS uses RS256 with a rotating JWKS. The signer publishes the "next" key well before promoting it to "active" and keeps "retired" keys live long enough for outstanding tokens to expire (15-minute access-token TTL). Validators cache the JWKS for up to 5 minutes — a fresh `kid` will be picked up within that window.

## See also

* [Quickstart](/mcp/quickstart) — install snippets for stock MCP clients.
* [Errors](/mcp/errors) — how tool errors surface (different from REST `application/problem+json`).
* [`auth_required`](/errors/auth_required) — REST-side auth error code.


# Errors
Source: https://docs.particle.pro/mcp/errors

How tool errors surface in MCP responses, and how the REST error catalog maps onto them.

The MCP server surfaces three distinct kinds of failures, each with a different shape. This page explains how to recognize and react to each one.

## 1. Authentication / authorization failures (HTTP)

If the bearer token is missing, malformed, expired, or revoked, the MCP endpoint returns an HTTP `401 Unauthorized` *before* the request reaches the tool layer. The response carries an RFC 9728 `WWW-Authenticate` challenge:

```http theme={"dark"}
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="mcp", error="invalid_token", resource_metadata="https://mcp.particle.pro/.well-known/oauth-protected-resource"
Content-Type: text/plain

grant revoked or unknown
```

The human-readable explanation lives in the response body. The header carries only the structured fields (`realm`, `error`, optional `scope`, `resource_metadata`).

Reactions:

* Re-run the OAuth flow. The `resource_metadata` URL is the authoritative pointer to the AS — do not hard-code the token endpoint.
* For revoked grants, the user must reconnect from `https://platform.particle.pro` → Connected Applications.

See [Authentication](/mcp/authentication) for the full validation pipeline.

## 2. Subscription / rate-limit failures (HTTP)

Requests that pass authentication but hit a subscription block or per-org rate limit return RFC 9457 `application/problem+json` bodies — the same shape as the REST API. The response is HTTP, not an MCP tool result, because the request never reached a tool.

```http theme={"dark"}
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json

{
  "type": "https://docs.particle.pro/errors/spend_limit_exceeded",
  "title": "Payment Required",
  "status": 402,
  "detail": "Spend limit reached for the current billing period.",
  "error_code": "spend_limit_exceeded",
  "resolve": {
    "message": "Increase the spend limit or upgrade the plan to continue.",
    "url": "https://platform.particle.pro/organizations/<orgId>/billing",
    "action": "update_spend_limits",
    "method": "POST",
    "endpoint": "/v1/organizations/<orgId>/billing/spend-limits"
  }
}
```

The full set of codes is documented in [REST → Errors](/errors/overview). The ones an MCP client is most likely to see at this layer:

* [`spend_limit_exceeded`](/errors/spend_limit_exceeded), [`credits_depleted`](/errors/credits_depleted), [`rate_limit_exceeded`](/errors/rate_limit_exceeded)
* [`subscription_suspended`](/errors/subscription_suspended), [`payment_past_due`](/errors/payment_past_due), [`subscription_inactive`](/errors/subscription_inactive)
* [`pro_required`](/errors/pro_required), [`not_a_member`](/errors/not_a_member)

Branch on `error_code`; surface `resolve.message` and `resolve.url` to the user. Agents that can take action programmatically should use `resolve.action`, `resolve.method`, and `resolve.endpoint`.

## 3. Tool-level failures (MCP `isError: true`)

When a request reaches a tool but the tool itself fails (missing required parameter, slug not found, invalid date, downstream handler error), the MCP server returns a `200 OK` HTTP response carrying an MCP `CallToolResult` with `isError: true` and a single text content block:

```json theme={"dark"}
{
  "jsonrpc": "2.0",
  "id": 17,
  "result": {
    "isError": true,
    "content": [
      { "type": "text", "text": "tool resolve_entity requires parameter `query` (e.g. query=\"sam altman\")" }
    ]
  }
}
```

The text comes from the underlying handler — typically a structured `huma.StatusError` (validation, 404 not found, conflict) translated by `asActionableError` into a tool-friendly message. The original REST `error_code` and `resolve` are not surfaced here; the message text is the only signal.

Reactions:

* For `MissingParameterError`-style messages, the text includes a usage hint (e.g. `query="sam altman"`) — fix the call and retry.
* For "not found" or "no rows" messages on a slug, the agent should call the corresponding `resolve_*` tool first to get a canonical slug, then retry.
* For unexpected tool errors, surface the message to the user and avoid retry loops — the resource server logs the underlying error with full structure for support follow-up.

## Why three layers?

* **HTTP 401** is the only path that's defined by RFC 6750 / RFC 9728 — MCP clients that follow the OAuth spec already handle it. Putting auth errors anywhere else would break the discovery loop.
* **HTTP 402/403/429** with RFC 9457 bodies stays consistent with the REST API: the same billing or rate-limit middleware runs in front of both surfaces, so the same problem-details shape comes out.
* **`isError: true` MCP results** are how the spec recommends per-tool failures be returned — a `200 OK` JSON-RPC response with the structured error in the result envelope, so the agent can keep the session open and fix the call.

## See also

* [REST → Errors](/errors/overview) — the canonical catalog of `error_code` values and resolution actions.
* [Authentication](/mcp/authentication) — how 401s arise and what `WWW-Authenticate` carries.
* [Tool reference](/mcp/tools/overview) — every tool documents its required parameters and the failure modes it can raise.


# Particle Pro MCP server
Source: https://docs.particle.pro/mcp/overview

An OAuth-secured MCP server that exposes Particle's podcast, knowledge graph, company, and advertising surfaces as tool calls for AI agents.

The Particle Pro [MCP](https://modelcontextprotocol.io) server lives at **`https://mcp.particle.pro`** and lets AI agents — Claude Code, Claude Desktop, Cursor, ChatGPT Desktop, and any other MCP-aware client — call Particle's podcast, knowledge-graph, company, and advertising tools directly. Setup is a one-time browser approval; everything else is automated by the agent.

## Connect your agent

<CodeGroup>
  ```bash Claude Code theme={"dark"}
  claude mcp add --transport http particle-pro https://mcp.particle.pro
  ```

  ```json Claude Desktop theme={"dark"}
  // ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
  // %APPDATA%\Claude\claude_desktop_config.json (Windows)
  //
  // Claude Desktop's claude_desktop_config.json doesn't accept a bare `url`.
  // Bridge the remote server through `mcp-remote`, which opens a browser
  // for OAuth and proxies stdio ↔ Streamable HTTP. Restart Claude Desktop
  // after editing.
  {
    "mcpServers": {
      "particle-pro": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.particle.pro"]
      }
    }
  }
  ```

  ```json Cursor theme={"dark"}
  // ~/.cursor/mcp.json
  {
    "mcpServers": {
      "particle-pro": {
        "url": "https://mcp.particle.pro"
      }
    }
  }
  ```

  ```json VS Code theme={"dark"}
  // .vscode/mcp.json
  {
    "servers": {
      "particle-pro": {
        "type": "http",
        "url": "https://mcp.particle.pro"
      }
    }
  }
  ```

  ```bash mcp-remote (any stdio-only client) theme={"dark"}
  # Bridges a stdio MCP client to a remote OAuth-secured Streamable HTTP server.
  npx -y mcp-remote https://mcp.particle.pro
  ```
</CodeGroup>

<Note>
  **Claude Desktop UI alternative:** Settings → Connectors → **Add custom connector**, paste `https://mcp.particle.pro`, complete OAuth in the browser. Easier than editing JSON and avoids the `mcp-remote` bridge.
</Note>

The first tool call triggers an OAuth flow: your client opens the authorize URL in a browser, you sign in to Particle Pro and pick the project the agent should act as, and your client exchanges the resulting code for a token automatically. See the [Quickstart](/mcp/quickstart) for a step-by-step walk-through and a sanity-check call, or [Authentication](/mcp/authentication) for the full OAuth 2.1 spec.

## What's in the box

13 tools across four namespaces:

<CardGroup>
  <Card title="Entities" icon="user-group" href="/mcp/tools/overview#entities">
    Resolve people, organizations, and places to canonical slugs; navigate the topic taxonomy.
  </Card>

  <Card title="Companies" icon="building" href="/mcp/tools/overview#companies">
    Resolve and inspect companies — products, competitors, identifiers (slug, ticker, domain, CIK, QID).
  </Card>

  <Card title="Podcasts" icon="microphone" href="/mcp/tools/overview#podcasts">
    Search dialogue, list episodes and clips, pull entity mentions, and bundle full episode overviews.
  </Card>

  <Card title="Advertising" icon="bullhorn" href="/mcp/tools/overview#advertising">
    Sponsor analytics — per-company ad presence, per-podcast sponsor lists, cross-catalog leaderboard.
  </Card>
</CardGroup>

|                    |                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Endpoint**       | `https://mcp.particle.pro`                                                                                   |
| **Transport**      | [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) |
| **Authentication** | OAuth 2.1 — see [Authentication](/mcp/authentication)                                                        |
| **Tool count**     | 13 across 4 namespaces                                                                                       |
| **Read/write**     | Read-only (every tool advertises `readOnlyHint: true`)                                                       |

## How it differs from the REST API

The REST API and the MCP server share a single backing process and the same handlers. The differences:

* **Shape.** Each MCP tool returns one markdown text content block. The REST API returns JSON. If you need typed JSON for programmatic use, hit the underlying REST endpoint linked from each tool page.
* **Bundling.** Some MCP tools roll up multiple REST calls (e.g. `podcasts/get_episode` can also fetch top entities, segments, and the transcript when the matching `include_*` flags are set). REST endpoints are single-resource.
* **Identifiers.** MCP tools always accept the agent-facing slug (`entity_slug`, `company_slug`, `podcast_slug`, `episode_slug`). The REST API accepts the same slugs alongside encoded canonical IDs.
* **Auth.** MCP requires an OAuth 2.1 access token bound to `https://mcp.particle.pro` as its `aud` claim. The REST API accepts API keys or platform JWTs. See [Authentication](/mcp/authentication).
* **Errors.** MCP tools surface errors as `isError: true` results with a human-readable message rather than HTTP problem-details bodies. See [Errors](/mcp/errors).

## When to use which surface

* Building an **agent** (Claude Code, Cursor, Claude Desktop, custom MCP client)? Use the MCP server. The bundled tool responses, slug-first inputs, and markdown rendering are designed for agent loops.
* Building a **service** (server-to-server, scheduled job, frontend)? Use the REST API. Fine-grained control, OpenAPI schema, predictable payloads.
* Both surfaces talk to the same database, the same search ranking, and the same billing meter, so mixing them within one organization is fine.

## Discovery

Agents that follow the MCP / OAuth specs discover everything they need from the resource:

* `https://mcp.particle.pro/.well-known/oauth-protected-resource` — RFC 9728 protected-resource metadata pointing at the AS.
* A 401 from the MCP endpoint carries `WWW-Authenticate: Bearer realm="mcp", error="...", resource_metadata="..."` so unauthenticated clients can bootstrap.

The Authorization Server's metadata document at `https://api.particle.pro/.well-known/oauth-authorization-server` carries the rest (token endpoint, registration endpoint, supported scopes, JWKS URI).

## Next steps

<CardGroup>
  <Card title="Quickstart" icon="rocket" href="/mcp/quickstart">
    Step-by-step setup with troubleshooting for each client.
  </Card>

  <Card title="Authentication" icon="lock" href="/mcp/authentication">
    OAuth 2.1 end-to-end: discovery, registration, PKCE, refresh, revocation.
  </Card>

  <Card title="Tool reference" icon="list-tree" href="/mcp/tools/overview">
    Every tool, every input, every output.
  </Card>

  <Card title="Errors" icon="triangle-exclamation" href="/mcp/errors">
    How tool errors surface and how agents should react.
  </Card>
</CardGroup>


# Quickstart
Source: https://docs.particle.pro/mcp/quickstart

Connect the Particle Pro MCP server to Claude Code, Claude Desktop, Cursor, VS Code, or a custom MCP client.

The Particle Pro MCP server runs at **`https://mcp.particle.pro`** over Streamable HTTP. Point any modern MCP client at the URL and the client handles the OAuth handshake automatically.

## Install

<CodeGroup>
  ```bash Claude Code theme={"dark"}
  claude mcp add --transport http particle-pro https://mcp.particle.pro
  ```

  ```json Claude Desktop theme={"dark"}
  // ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
  // %APPDATA%\Claude\claude_desktop_config.json (Windows)
  //
  // Claude Desktop's claude_desktop_config.json does not accept a bare
  // `url` for remote MCP servers — only stdio `command`/`args` entries.
  // Bridge the remote server through `mcp-remote`, which opens a browser
  // for OAuth and proxies stdio ↔ Streamable HTTP. Restart Claude Desktop
  // after editing.
  {
    "mcpServers": {
      "particle-pro": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.particle.pro"]
      }
    }
  }
  ```

  ```json Cursor theme={"dark"}
  // ~/.cursor/mcp.json
  {
    "mcpServers": {
      "particle-pro": {
        "url": "https://mcp.particle.pro"
      }
    }
  }
  ```

  ```json VS Code theme={"dark"}
  // .vscode/mcp.json
  {
    "servers": {
      "particle-pro": {
        "type": "http",
        "url": "https://mcp.particle.pro"
      }
    }
  }
  ```

  ```bash mcp-remote (any stdio-only client) theme={"dark"}
  # Bridges a stdio MCP client to a remote OAuth-secured Streamable HTTP server.
  npx -y mcp-remote https://mcp.particle.pro
  ```
</CodeGroup>

<Note>
  **Claude Desktop alternative — UI flow:** Settings → Connectors → **Add custom connector**, paste `https://mcp.particle.pro`, complete OAuth in the browser. Easier than editing JSON and avoids the `mcp-remote` bridge entirely.
</Note>

You'll need a Particle Pro account with an active project. If you don't have one, [sign up at platform.particle.pro](https://platform.particle.pro) first.

## OAuth flow

The first tool call triggers an OAuth flow:

1. Your client opens `https://api.particle.pro/oauth/authorize?...` in a browser.
2. You sign in to Particle Pro (if not already), then approve the requested scopes (`mcp:read`, `mcp:write` by default) and pick which project the agent should act on.
3. The browser redirects back to your client's local callback. The client exchanges the authorization code for tokens, stores them, and re-issues the original tool call.

Subsequent calls reuse the cached tokens. Refresh happens automatically — see [Authentication](/mcp/authentication) for the full flow and the dynamic-client-registration details.

## Sanity check

Once connected, ask the agent to call a low-cost read tool. A good first call:

```text theme={"dark"}
Use particle-pro entities/resolve_entity to look up "Marc Andreessen".
```

Expected response (every tool returns a single markdown text block — verbatim from a live call):

```markdown theme={"dark"}
## Entity matches for "Marc Andreessen" (1)

### Marc Andreessen

- **Slug:** marc-andreessen
- **Description:** General partner of Andreessen Horowitz
- **Wikipedia:** https://en.wikipedia.org/wiki/Marc_Andreessen
```

The string after `- **Slug:**` is what every other tool that takes an `entity_slug` parameter expects — `marc-andreessen` here. Feed it into `podcasts/get_entity_mentions`, `podcasts/search_dialogue`, `podcasts/list_episodes`, or `podcasts/list_clips`.

(Company entities additionally get `- **Ticker:**` / `- **Domain:**` rows; people don't.)

## A short agent loop

A typical research workflow chains a small number of tools:

1. **Resolve names to slugs** — `entities/resolve_entity` for people, `companies/resolve_company` for orgs by ticker/domain, `podcasts/resolve_podcast` for shows.
2. **Discover episodes or dialogue** — `podcasts/search_dialogue` for topic-based ranking, `podcasts/get_entity_mentions` for "every line about X", `podcasts/list_episodes` for filter-driven discovery.
3. **Drill in** — `podcasts/get_episode` with `include_full_segments=true` and `include_transcript=true` for the full picture, `podcasts/list_clips` for engagement-ranked highlight moments.
4. **Pivot to ads** — `advertising/get_company_ad_presence` ("where does company X show up as a sponsor"), `advertising/get_podcast_sponsors` ("who sponsors podcast Y"), `advertising/sponsor_leaderboard` (catalog-wide ranking).

Every output is a single markdown text block. Agents read the bolded KV labels to extract identifiers and chain them into the next call. Two shapes appear: top-level summary lines under `## Heading` use flat `**Key:** value`, while per-item field rows under `### Item title` use `- **Key:** value` bullets. Either way, the bold-key prefix (e.g. `**Slug:**`, `**Episode slug:**`) is what to grep for.

## Troubleshooting

* **"server requires authentication"** — your client hit the MCP endpoint without a bearer token, or the token failed verification. Re-run the OAuth flow; if you persist tokens to disk, delete the cache for `mcp.particle.pro`.
* **Browser callback hangs** — confirm the client's `redirect_uri` matches one it registered. Most desktop MCP clients use `http://localhost:<port>/callback`; the AS allows localhost redirects without prior approval.
* **403 on a tool call after a successful connection** — the OAuth grant is for the wrong project. Revoke the connection from `https://platform.particle.pro` → Connected Applications and reconnect, picking the correct project at the consent screen.
* **Specific tool errors** — see the [Errors](/mcp/errors) page for how tool failures surface as MCP `isError: true` results and how to react to each kind.

## Next steps

<CardGroup>
  <Card title="Authentication" icon="lock" href="/mcp/authentication">
    OAuth 2.1 end-to-end — useful when wiring up a custom client.
  </Card>

  <Card title="Tool reference" icon="list-tree" href="/mcp/tools/overview">
    Every input, output, and example for every tool.
  </Card>
</CardGroup>


# advertising/get_company_ad_presence
Source: https://docs.particle.pro/mcp/tools/advertising/get-company-ad-presence

Sponsor-side ad analytics for one company — totals, podcast/episode reach, host-read vs pre-recorded, and recent placements.

Sponsor-side ad analytics for one company: total ads, distinct podcasts and episodes reached, host-read vs pre-recorded breakdown, and the most recent ad placements with podcast attribution.

This is the "where does company X show up as a sponsor" view. For "who sponsors podcast Y" use [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors). For top advertisers across the catalog use [`advertising/sponsor_leaderboard`](/mcp/tools/advertising/sponsor-leaderboard).

## Inputs

| Field          | Type   | Required | Default | Description                                                                                                                                                                                                 |
| -------------- | ------ | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company_slug` | string | yes      | —       | Company identifier — accepts slug (e.g. `"nvidia"`), domain (e.g. `"nvidia.com"`), or canonical ID. If you already know the domain you can call this tool directly without first running `resolve_company`. |

## Output

A markdown document with `## Ad presence for <company_id>` and KV lines for `**Total ads:**`, `**Podcast reach:**` (distinct podcasts), `**Episode reach:**` (distinct episodes), `**Read mix:**` (host-read vs pre-recorded counts). When recent placements exist, a `### Recent placements` section follows with bullets formatted `Sponsor — Product on Podcast (podcast_slug) [HOST_READ|PRE_RECORDED]`.

Sample (`company_slug="shopify"`):

```markdown theme={"dark"}
## Ad presence for shopify.com

**Total ads:** 11269
**Podcast reach:** 959
**Episode reach:** 9860
**Read mix:** 8205 host-read, 3064 pre-recorded
### Recent placements

- Shopify — Commerce platform for building online stores on The Ben Shapiro Show (the-ben-shapiro-show) [HOST_READ]
- Shopify — e-commerce platform on The Ben Shapiro Show (the-ben-shapiro-show) [HOST_READ]
- Shopify — Shopify commerce platform on The Ben Shapiro Show (the-ben-shapiro-show) [HOST_READ]
```

## Example

```text theme={"dark"}
Agent calls: advertising/get_company_ad_presence { "company_slug": "nvidia" }
```

## Related

* REST equivalent: [`GET /v1/companies/{id}/podcast/advertising`](/podcasts/advertising).
* Inverse view: [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors).
* Cross-catalog ranking: [`advertising/sponsor_leaderboard`](/mcp/tools/advertising/sponsor-leaderboard).


# advertising/get_podcast_sponsors
Source: https://docs.particle.pro/mcp/tools/advertising/get-podcast-sponsors

Top sponsors for a single podcast plus aggregate ad stats — totals, unique sponsors, episodes with ads, host-read vs pre-recorded.

Top sponsors for a single podcast plus aggregate ad stats: total ads, unique sponsors, episodes with ads, average ads per episode, and host-read vs pre-recorded breakdown.

This is the "who sponsors podcast Y" view. For "where does company X sponsor" use [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence). For top advertisers across the catalog use [`advertising/sponsor_leaderboard`](/mcp/tools/advertising/sponsor-leaderboard).

## Inputs

| Field          | Type   | Required | Default | Description                   |
| -------------- | ------ | -------- | ------- | ----------------------------- |
| `podcast_slug` | string | yes      | —       | Podcast slug or canonical ID. |

## Output

A markdown document with `## Sponsors of <podcast_id>` and KV lines for `**Total ads:**`, `**Unique sponsors:**`, `**Episodes with ads:**`, `**Avg ads/episode:**` (two decimals), `**Read mix:**` (host-read vs pre-recorded counts). A `### Top sponsors` section follows with bullets formatted `Sponsor (company_id) — N ads across M episodes` (the parenthesized company\_id appears only when the sponsor resolved to a known company).

Sample (`podcast_slug="all-in"`):

```markdown theme={"dark"}
## Sponsors of 4t9PU1WkzOroEXfBl6ia7r

**Total ads:** 55
**Unique sponsors:** 30
**Episodes with ads:** 23
**Avg ads/episode:** 2.39
**Read mix:** 55 host-read, 0 pre-recorded
### Top sponsors

- OKX (okx.com) — 7 ads across 7 episodes
- Circle (circle.com) — 5 ads across 5 episodes
- Solana (solanalabs.com) — 4 ads across 4 episodes
- BVNK (bvnk.com) — 3 ads across 3 episodes
- Polymarket (polymarket.com) — 3 ads across 3 episodes
```

## Example

```text theme={"dark"}
Agent calls: advertising/get_podcast_sponsors { "podcast_slug": "all-in" }
```

## Related

* REST equivalent: [`GET /v1/podcasts/{id}/advertising`](/podcasts/advertising).
* Inverse view: [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence).
* Cross-catalog ranking: [`advertising/sponsor_leaderboard`](/mcp/tools/advertising/sponsor-leaderboard).


# advertising/sponsor_leaderboard
Source: https://docs.particle.pro/mcp/tools/advertising/sponsor-leaderboard

Ranked list of the most-active sponsors across the podcast catalog, by ad count, podcast reach, or episode reach.

Ranked list of the most-active sponsors across the podcast catalog, by ad count (default), podcast reach, or episode reach. Optionally constrain to a time window or to one company's brand family.

For per-company analytics use [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence); for per-podcast use [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors).

## Inputs

| Field          | Type           | Required | Default    | Description                                                             |
| -------------- | -------------- | -------- | ---------- | ----------------------------------------------------------------------- |
| `metric`       | string         | no       | `ad_count` | Ranking metric. One of: `ad_count`, `podcast_reach`, `episode_reach`.   |
| `since`        | string         | no       | —          | Only count ads created on or after this ISO 8601 date.                  |
| `until`        | string         | no       | —          | Only count ads created on or before this ISO 8601 date.                 |
| `company_slug` | string         | no       | —          | Constrain to one sponsor's brand family by company slug, domain, or ID. |
| `limit`        | integer (1–50) | no       | 10         | Sponsors per page.                                                      |
| `cursor`       | string         | no       | —          | Opaque pagination cursor.                                               |

## Output

A markdown document with `## Sponsor leaderboard by <metric> (N)` and a flat bullet list — one bullet per ranked sponsor, formatted `#<rank> <name> (<company_id>) — N ads, N podcasts, N episodes`. The parenthesized `company_id` appears only when the sponsor resolved to a known company. When more pages exist, a horizontal rule and a `**Cursor:** <value>` line are appended; pass that value back as `cursor` to fetch the next page.

Sample (`limit=3`, default `metric=ad_count`):

```markdown theme={"dark"}
## Sponsor leaderboard by ad_count (3)

- #1 Grainger (grainger.com) — 14880 ads, 655 podcasts, 10219 episodes
- #2 Mint Mobile (mintmobile.com) — 11637 ads, 912 podcasts, 10322 episodes
- #3 Shopify (shopify.com) — 11256 ads, 959 podcasts, 9854 episodes
---

**Cursor:** r.4gfFC7
```

The value in parentheses is the `company_id` for that sponsor — feed it into [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence) as `company_slug` (which accepts knowledge-graph slug, domain, or canonical ID interchangeably) for a deeper view of any sponsor on the leaderboard.

## Example

```text theme={"dark"}
Agent calls: advertising/sponsor_leaderboard {
  "metric": "podcast_reach",
  "since": "2025-01-01",
  "limit": 25
}
```

## Related

* REST equivalent: [`GET /v1/advertising/leaderboard`](/podcasts/advertising).
* Per-company analytics: [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence).
* Per-podcast analytics: [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors).


# companies/get_company
Source: https://docs.particle.pro/mcp/tools/companies/get-company

Bundled profile for one company — identifiers, optional product hierarchy, optional competitor list.

Return a bundled profile for one company: identifiers (slug, ticker, domain, CIK, QID, linked entity), name, and description.

The default response is lean — flip `include_products` and `include_competitors` when you need the heavier sub-resources. For sponsor/advertising analytics on this company, use [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence) instead.

## Inputs

| Field                 | Type    | Required | Default    | Description                                                                                                                                                                                                 |
| --------------------- | ------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `company_slug`        | string  | yes      | —          | Company identifier — accepts slug (e.g. `"nvidia"`), domain (e.g. `"nvidia.com"`), or canonical ID. If you already know the domain you can call this tool directly without first running `resolve_company`. |
| `include_products`    | boolean | no       | `false`    | Include the three-level product hierarchy (segments → product lines → products).                                                                                                                            |
| `product_status`      | string  | no       | `"active"` | Comma-separated lifecycle filter when `include_products=true`. Allowed values: `active`, `announced`, `discontinued`, `rumored`.                                                                            |
| `include_competitors` | boolean | no       | `false`    | Include the competitor list (paginated to 25 by default).                                                                                                                                                   |

## Output

A markdown document with the company name as an H2, identifier KV lines (`**Slug:**`, `**Ticker:**`, `**Domain:**`, `**CIK:**`, `**QID:**` — only those that have values), then a paragraph with the description. With `include_products=true`, a `### Products` section follows containing an indented bullet hierarchy `- **Name** (level, status)` (segment → product\_line → product). With `include_competitors=true`, a `### Competitors` section follows with one bullet per competitor: `- Name (handles) — competitive_basis`.

Sample (`company_slug="nvidia", include_products=true, include_competitors=true`, truncated):

```markdown theme={"dark"}
## Nvidia

**Slug:** nvidia
**Ticker:** NVDA
**Domain:** nvidia.com
**CIK:** 0001045810
**QID:** Q182477
Nvidia is a leading developer of graphics processing units. …

### Products

- **Automotive** (segment, active)
  - **NVIDIA DRIVE** (product_line, active)
    - **DRIVE Hyperion Platform** (product, active)
- **Compute & Networking** (segment, active)
  - **Data Center Accelerators** (product_line, active)
    - **Blackwell GPUs** (product, active)

### Competitors

- Raspberry Pi Holdings plc (uetersen, raspberrypi.com) — NVIDIA competes with Raspberry Pi in edge AI and robotics segments through its Jetson series of embedded AI computing platforms…
```

## Example

```text theme={"dark"}
Agent calls: companies/get_company {
  "company_slug": "nvidia",
  "include_products": true,
  "product_status": "active,announced",
  "include_competitors": true
}
```

## Related

* REST equivalent: [`GET /v1/companies/{id}`](/companies/overview), with sub-resources for products and competitors.
* For sponsor analytics, use [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence).
* For dialogue mentioning the company, use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) with `company_slug`.


# companies/resolve_company
Source: https://docs.particle.pro/mcp/tools/companies/resolve-company

Resolve a company by free-text name, ticker, SEC CIK, Wikidata QID, or domain.

Resolve a company by free-text name, ticker, SEC CIK, Wikidata QID, or domain. Returns candidates with the agent-facing identifier (`slug`, falling back to `domain` or `id`) you can pass to other company-aware tools.

At least one identifier is required. Multiple are ANDed together — useful for disambiguating (e.g. ticker plus a name hint). For people or other knowledge-graph entities (not companies) use [`entities/resolve_entity`](/mcp/tools/entities/resolve-entity) instead.

## Inputs

At least one of `query`, `ticker`, `domain`, `cik`, or `qid` is required.

| Field    | Type           | Required | Default | Description                                                                             |
| -------- | -------------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `query`  | string         | one of   | —       | Free-text company name (case-insensitive). Use for human-typed names.                   |
| `ticker` | string         | one of   | —       | Stock ticker symbol (e.g. `"NVDA"`, `"AAPL"`). Comma-separated for multi-ticker lookup. |
| `domain` | string         | one of   | —       | Company website domain (e.g. `"apple.com"`). Comma-separated for bulk.                  |
| `cik`    | string         | one of   | —       | SEC Central Index Key (e.g. `"0000320193"`). Comma-separated for bulk.                  |
| `qid`    | string         | one of   | —       | Wikidata QID (e.g. `"Q312"`). Comma-separated for bulk.                                 |
| `limit`  | integer (1–25) | no       | 5       | Maximum candidates to return.                                                           |

## Output

A markdown document with `## Company matches (N)` and one `### Name` section per result. Each section carries bulleted KV rows: `- **Slug:**`, `- **ID:**`, `- **Description:**`, `- **Ticker:**`, `- **Domain:**`, `- **CIK:**`, `- **QID:**` — only those that have values appear. The `- **Slug:**` row is omitted when the slug equals the domain or the ID (to avoid duplication).

Sample (`ticker="NVDA"`):

```markdown theme={"dark"}
## Company matches (1)

### Nvidia

- **Slug:** nvidia
- **ID:** 3CensCwu5G2oKCFgPrNf89
- **Description:** Nvidia is a leading developer of graphics processing units. …
- **Ticker:** NVDA
- **Domain:** nvidia.com
- **CIK:** 0001045810
- **QID:** Q182477
```

The string after `- **Slug:**` (or `- **Domain:**` if no slug row is present, or `- **ID:**` as a final fallback) is what you pass to other tools as `company_slug` — every tool that takes `company_slug` accepts knowledge-graph slug, domain, or encoded ID interchangeably.

## Example

```text theme={"dark"}
Agent calls: companies/resolve_company { "ticker": "NVDA" }
            → reads "- **Slug:**" row → "nvidia"

Agent calls: advertising/get_company_ad_presence { "company_slug": "nvidia" }
```

## Related

* REST equivalent: [`GET /v1/companies`](/companies/overview).
* For a richer single-company view (products, competitors), use [`companies/get_company`](/mcp/tools/companies/get-company).
* For sponsor analytics, use [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence).


# entities/browse_topics
Source: https://docs.particle.pro/mcp/tools/entities/browse-topics

Navigate the topic taxonomy — without `parent_slug` returns top-level roots; with it returns direct children.

Navigate the topic taxonomy. Without `parent_slug`, returns the top-level roots (Politics, Business, Technology, etc.). With `parent_slug` set, returns the direct children of that topic.

Topic slugs use a `parent/child` convention (e.g. `politics/elections`) and let agents browse the hierarchy to find well-named categories.

## Inputs

| Field         | Type            | Required | Default | Description                                                                            |
| ------------- | --------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| `parent_slug` | string          | no       | —       | Topic slug or ID. Returns the direct children of this topic. Omit for top-level roots. |
| `limit`       | integer (1–100) | no       | 50      | Topics per page.                                                                       |
| `cursor`      | string          | no       | —       | Opaque pagination cursor from a previous response.                                     |

## Output

A markdown document with an `## Topics (N)` heading and a flat bullet list — one bullet per topic, formatted `**Name** — slug: <slug>` (with ` — <ancestry>` appended when an ancestry path is available). When more pages exist, a horizontal rule and a `**Cursor:** <value>` line are appended; pass that cursor value back as the `cursor` input.

Sample (`limit=5`):

```markdown theme={"dark"}
## Topics (5)

- **Society** — slug: society
- **Government** — slug: government
- **Business** — slug: business
- **Politics** — slug: politics
- **Media** — slug: media
---

**Cursor:** r.4gfFC9
```

The string after `slug:` is what you pass back as `parent_slug` to drill into a topic's children.

## Example

```text theme={"dark"}
Agent calls: entities/browse_topics {}
            → reads "slug: politics" → "politics"

Agent calls: entities/browse_topics { "parent_slug": "politics" }
            → returns child topics like "politics/elections"
```

## Related

* REST equivalent: [`GET /v1/topics`](/knowledge-graph/topics).


# entities/resolve_entity
Source: https://docs.particle.pro/mcp/tools/entities/resolve-entity

Resolve a person, organization, place, or company by free-text name to its canonical slug.

Resolve a person, organization, place, or company by free-text name. Returns ranked candidates with the canonical `slug` you should feed into entity-aware tools.

Use this first whenever you only have a human name. The slug is the stable handle — once resolved, downstream tools that take `entity_slug` accept it directly without re-resolving.

For bulk resolution, pass a comma-separated `query` — each name is resolved independently in a single call and `limit` applies per query.

For companies that you can identify by ticker, domain, CIK, or QID, prefer [`companies/resolve_company`](/mcp/tools/companies/resolve-company) — it has more identifier surface.

## Inputs

| Field   | Type           | Required | Default | Description                                                                                                            |
| ------- | -------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `query` | string         | yes      | —       | Free-text name (e.g. `"sam altman"`, `"nvidia"`, `"kara swisher"`). Case-insensitive. Comma-separated for bulk lookup. |
| `limit` | integer (1–10) | no       | 5       | Maximum candidates per query.                                                                                          |

## Output

A markdown document with one section per input query, separated by horizontal rules in multi-query responses.

* **Queries with matches** render as a `## Entity matches for "<query>" (N)` heading followed by one `### Name` section per result, each carrying bulleted KV rows: `- **Slug:**`, `- **Description:**`, `- **Wikipedia:**` (when present), and — for companies — `- **Ticker:**` / `- **Domain:**`.
* **Queries with no matches** render as a single `No entities matched "<query>". ...` paragraph (no H2 heading), so the caller can see which input failed without losing the rest.

Sample (`query="Marc Andreessen", limit=2`):

```markdown theme={"dark"}
## Entity matches for "Marc Andreessen" (2)

### Marc Andreessen

- **Slug:** marc-andreessen
- **Description:** General partner of Andreessen Horowitz
- **Wikipedia:** https://en.wikipedia.org/wiki/Marc_Andreessen

### Laura Arrillaga-Andreessen

- **Slug:** laura-arrillaga-andreessen
- **Description:** American educator ‧ Marc Andreessen's wife
- **Wikipedia:** https://en.wikipedia.org/wiki/Laura_Arrillaga-Andreessen
```

Sample (`query="sam altman, kara swisher", limit=1`):

```markdown theme={"dark"}
## Entity matches for "sam altman" (1)

### Sam Altman

- **Slug:** sam-altman
- **Description:** CEO of OpenAI
- **Wikipedia:** https://en.wikipedia.org/wiki/Sam_Altman

---

## Entity matches for "kara swisher" (1)

### Kara Swisher

- **Slug:** kara-swisher
- **Description:** American journalist
- **Wikipedia:** https://en.wikipedia.org/wiki/Kara_Swisher
```

The first result in each block is usually the one you want for unambiguous queries. For ambiguous names (common surnames, multiple people with the same name) read the `- **Description:**` and `- **Wikipedia:**` rows to disambiguate. The string after `- **Slug:**` is what every other tool that takes an `entity_slug` parameter expects.

## Example

```text theme={"dark"}
User: Find every recent podcast where Marc Andreessen is mentioned.

Agent calls: entities/resolve_entity { "query": "Marc Andreessen" }
            → reads "- **Slug:**" row → "marc-andreessen"

Agent calls: podcasts/get_entity_mentions { "entity_slug": "marc-andreessen", "limit": 10 }
```

### Bulk resolution

```text theme={"dark"}
User: Pull mentions for Sam Altman, Kara Swisher, and Marc Andreessen.

Agent calls: entities/resolve_entity { "query": "Sam Altman, Kara Swisher, Marc Andreessen" }
            → reads each block's "- **Slug:**" row → ["sam-altman", "kara-swisher", "marc-andreessen"]

Agent calls: podcasts/get_entity_mentions { "entity_slug": "sam-altman", ... }
            (etc., one call per resolved slug)
```

## Related

* REST equivalent: [`GET /v1/entities`](/knowledge-graph/entities).
* Use the returned `slug` with [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions), [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue), [`podcasts/list_episodes`](/mcp/tools/podcasts/list-episodes), or [`podcasts/list_clips`](/mcp/tools/podcasts/list-clips).
* For company-specific identifiers, use [`companies/resolve_company`](/mcp/tools/companies/resolve-company) instead.


# Tool reference
Source: https://docs.particle.pro/mcp/tools/overview

Every tool the Particle Pro MCP server exposes, grouped by namespace.

The Particle Pro MCP server exposes 13 tools across 4 namespaces. Each tool wraps an existing REST handler — the per-tool pages link to the analogous REST endpoint when one exists.

Every tool advertises `readOnlyHint: true`. Inputs use snake\_case JSON; outputs include both structured JSON (via MCP `structuredContent`) and a markdown rendering (via `content[].text`).

## Entities

Resolve people, organizations, and places to canonical slugs you can feed into other tools.

<CardGroup>
  <Card title="entities/resolve_entity" icon="user-magnifying-glass" href="/mcp/tools/entities/resolve-entity">
    Resolve a person, organization, place, or company by free-text name.
  </Card>

  <Card title="entities/browse_topics" icon="folder-tree" href="/mcp/tools/entities/browse-topics">
    Navigate the topic taxonomy — roots and direct children.
  </Card>
</CardGroup>

## Companies

Resolve companies by ticker, domain, CIK, or QID, and pull bundled profiles with products and competitors.

<CardGroup>
  <Card title="companies/resolve_company" icon="building-magnifying-glass" href="/mcp/tools/companies/resolve-company">
    Resolve a company by name, ticker, domain, CIK, or QID.
  </Card>

  <Card title="companies/get_company" icon="building" href="/mcp/tools/companies/get-company">
    Bundled company profile — identifiers, products, competitors.
  </Card>
</CardGroup>

## Podcasts

The richest namespace: search dialogue, list episodes and clips, pull entity mentions, and bundle full episode overviews.

<CardGroup>
  <Card title="podcasts/resolve_podcast" icon="podcast" href="/mcp/tools/podcasts/resolve-podcast">
    Find a podcast by free-text title or exact slug.
  </Card>

  <Card title="podcasts/get_episode" icon="play" href="/mcp/tools/podcasts/get-episode">
    Bundled overview of one episode — speakers, entities, segments, transcript.
  </Card>

  <Card title="podcasts/get_entity_mentions" icon="quote-left" href="/mcp/tools/podcasts/get-entity-mentions">
    Every dialogue line where a person or company is named.
  </Card>

  <Card title="podcasts/search_dialogue" icon="magnifying-glass" href="/mcp/tools/podcasts/search-dialogue">
    Semantic, keyword, or hybrid search over podcast dialogue.
  </Card>

  <Card title="podcasts/list_episodes" icon="list" href="/mcp/tools/podcasts/list-episodes">
    Filter-driven episode discovery across the catalog.
  </Card>

  <Card title="podcasts/list_clips" icon="scissors" href="/mcp/tools/podcasts/list-clips">
    Engagement-ranked highlight clips with audio URLs.
  </Card>
</CardGroup>

## Advertising

Sponsor analytics — per-company, per-podcast, and across the catalog.

<CardGroup>
  <Card title="advertising/get_company_ad_presence" icon="bullhorn" href="/mcp/tools/advertising/get-company-ad-presence">
    Where company X shows up as a sponsor.
  </Card>

  <Card title="advertising/get_podcast_sponsors" icon="handshake" href="/mcp/tools/advertising/get-podcast-sponsors">
    Who sponsors podcast Y, plus aggregate stats.
  </Card>

  <Card title="advertising/sponsor_leaderboard" icon="ranking-star" href="/mcp/tools/advertising/sponsor-leaderboard">
    Top advertisers across the catalog.
  </Card>
</CardGroup>

## Choosing the right tool

| I want…                                         | Use this                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| To turn a person's name into a slug             | [`entities/resolve_entity`](/mcp/tools/entities/resolve-entity)                         |
| To turn a ticker, domain, or CIK into a company | [`companies/resolve_company`](/mcp/tools/companies/resolve-company)                     |
| Every line where a person or company is named   | [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions)               |
| Dialogue *about* a topic (paraphrase or exact)  | [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue)                       |
| Episode-level discovery with rich filters       | [`podcasts/list_episodes`](/mcp/tools/podcasts/list-episodes)                           |
| A full episode overview with transcript         | [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode)                               |
| Highlight clips ranked by engagement            | [`podcasts/list_clips`](/mcp/tools/podcasts/list-clips)                                 |
| "Where does company X advertise"                | [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence) |
| "Who sponsors podcast Y"                        | [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors)       |
| Catalog-wide top advertisers                    | [`advertising/sponsor_leaderboard`](/mcp/tools/advertising/sponsor-leaderboard)         |


# podcasts/get_entity_mentions
Source: https://docs.particle.pro/mcp/tools/podcasts/get-entity-mentions

Find dialogue lines where a specific person or company is named in podcast transcripts.

Find dialogue lines where a specific person or company is named in podcast transcripts.

Use this for the "every line about X" workflow. For dialogue that *discusses* a topic (paraphrase-tolerant or BM25), use [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue) instead — that one ranks segments by relevance to a free-text query, not by who's named.

## Two response modes

**`format="summary"` (default — wide scan).** Returns up to `limit` episodes (reverse-chronological), each with metadata plus the first 10 mention-only lines (just the lines naming the entity, no surrounding dialogue). Use this to see *what's been said across episodes* and decide which episodes are worth reading in full. Paginate older episodes with `cursor`.

**`format="detail"` (narrow drill-in).** Requires `episode_slug`. Returns the full mention windows with `context_lines` of surrounding dialogue around each mention. Pass one slug for a single episode, or up to **10 comma-separated** slugs (e.g. `episode_slug="all-in-200,all-in-201,all-in-202"`) to multi-get several episodes in one call. `limit`/`cursor` don't apply.

### Workflow

* **No specific episode in mind:** call `format="summary"` first to scan, then call `format="detail"` with the slug(s) of the episodes worth reading in full. For most questions (sentiment, recurring themes, who said what when), summary alone has enough signal and the second call isn't needed.
* **Already have the episode slug** (e.g. user mentioned the episode by name, or you got it from `get_episode` / `search_dialogue`): skip summary entirely and call `format="detail"` with `episode_slug` directly.

## Inputs

One of `entity_slug` or `company_slug` is required. Resolve a name to a slug first with [`entities/resolve_entity`](/mcp/tools/entities/resolve-entity) or [`companies/resolve_company`](/mcp/tools/companies/resolve-company).

| Field           | Type                      | Required         | Default     | Description                                                                                                                                                  |
| --------------- | ------------------------- | ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entity_slug`   | string                    | one of           | —           | Entity slug (e.g. `"sam-altman"`) or canonical ID.                                                                                                           |
| `company_slug`  | string                    | one of           | —           | Company slug, domain, or canonical ID (e.g. `"nvidia"` or `"nvidia.com"`). Resolves to the company's linked entity.                                          |
| `format`        | `"summary"` \| `"detail"` | no               | `"summary"` | Response shape. See "Two response modes" above.                                                                                                              |
| `episode_slug`  | string                    | yes for `detail` | —           | One slug for single drill-in, or up to 10 comma-separated slugs for a multi-episode drill-in in one call. In `summary` mode, optional filter to one episode. |
| `podcast_slug`  | string                    | no               | —           | Restrict mentions to a single podcast by slug or ID.                                                                                                         |
| `role`          | enum                      | no               | —           | Constrain how the entity participates. One of: `guest`, `host`, `panelist`, `correspondent`, `mention`.                                                      |
| `since`         | string                    | no               | —           | Only episodes published on or after this ISO 8601 date (e.g. `2025-01-01`).                                                                                  |
| `until`         | string                    | no               | —           | Only episodes published on or before this ISO 8601 date.                                                                                                     |
| `context_lines` | integer (1–20)            | no               | 2           | Surrounding dialogue lines around each mention. **Detail mode only** — ignored in summary.                                                                   |
| `limit`         | integer (1–50)            | no               | 10          | Episodes per page. **Summary mode only** — detail returns the requested episodes regardless.                                                                 |
| `cursor`        | string                    | no               | —           | Opaque pagination cursor. **Summary mode only**.                                                                                                             |

## Output

A markdown document with `## Mentions of <Name> (N episodes, format=<summary|detail>)` and one `### Episode title` section per episode. Each section carries bulleted KV rows: `- **Podcast:**`, `- **Published:**`, `- **Episode slug:**`, `- **Mentions:**`.

In **summary** mode, each episode is followed by a flat bullet list — one bullet per mention, formatted `@ <seconds>s **Speaker:** text`. When more pages exist, a horizontal rule and a `**Cursor:** <value>` line are appended; pass that value back as `cursor` to fetch the next page.

In **detail** mode, each episode is followed by one bullet per mention window (`Segment title (TYPE) @ start–end`), then indented dialogue lines underneath. The line that actually names the entity has the entire `Speaker: text` wrapped in bold; surrounding context lines render as `**Speaker:** text` (speaker label bold, text plain).

Sample (summary, `entity_slug="marc-andreessen", limit=2`):

```markdown theme={"dark"}
## Mentions of Marc Andreessen (2 episodes, format=summary)

### The Sunday Interview: Governing Without Accountability …

- **Podcast:** Straight White American Jesus
- **Published:** 2026-05-03T13:15:00Z
- **Episode slug:** the-sunday-interview-governing-without-accountability-silicon-valleys-ideology
- **Mentions:** 5
- @ 719s **Annika Brockschmidt:** And one of the people who really likes to claim that, … Marc Andreessen-
- @ 1098s **Annika Brockschmidt:** I f- I especially find the stuff that Marc Andreessen says out loud into microphones …
- @ 1443s **Adrian Daub:** But, like, I don't think that was Marc Andreessen, if I can be quite honest with you.

### Why Most of What You're Hearing About AI Is Wrong

- **Podcast:** DarrenDaily On-Demand
- **Published:** 2026-05-01T10:00:00Z
- **Episode slug:** why-most-of-what-youre-hearing-about-ai-is-wrong
- **Mentions:** 1
- @ 155s **Darren Hardy:** Marc Andreessen calls it the silver bullet excuse for layoffs driven by pandemic over-hiring.
---

**Cursor:** s.1hwwoMp2yqmPExv6N5kGy5OYdb8kKihxYYWJ
```

Sample (detail, drilling into one of those episodes):

```markdown theme={"dark"}
## Mentions of Marc Andreessen (1 episodes, format=detail)

### Why Most of What You're Hearing About AI Is Wrong

- **Podcast:** DarrenDaily On-Demand
- **Published:** 2026-05-01T10:00:00Z
- **Episode slug:** why-most-of-what-youre-hearing-about-ai-is-wrong
- **Mentions:** 1
- AI as layoff scapegoat and market incentives (TOPIC_DISCUSSION) @ 140s–183s
    **Darren Hardy:** When Elon Musk bought it, he gutted 80% of the staff …
    **Darren Hardy:** Well, the rest of the corporate market took notice …
    **Darren Hardy: Marc Andreessen calls it the silver bullet excuse for layoffs driven by pandemic over-hiring.**
    **Darren Hardy:** Salesforce Marc Benioff said, "Blaming AI is the lazy way out for CEOs." …
    **Darren Hardy:** So let me be clear about this, okay? AI is not what's killing the job market, yet at least.
```

## Example

```text theme={"dark"}
# Wide scan, then drill in.
Agent calls: podcasts/get_entity_mentions {
  "company_slug": "openai", "podcast_slug": "all-in",
  "since": "2025-11-01", "limit": 20
}
            → reads "- **Episode slug:**" rows for episodes worth reading in full
            → e.g. "all-in-200", "all-in-201"

Agent calls: podcasts/get_entity_mentions {
  "format": "detail",
  "company_slug": "openai",
  "episode_slug": "all-in-200,all-in-201"
}
            → returns full mention windows with context for both episodes in one call
```

## Related

* REST equivalent: [`GET /v1/podcasts/mentions`](/podcasts/mentions).
* For ranked dialogue *about* a topic (not just lines naming a person), use [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue).
* For episode-level discovery without dialogue, use [`podcasts/list_episodes`](/mcp/tools/podcasts/list-episodes).


# podcasts/get_episode
Source: https://docs.particle.pro/mcp/tools/podcasts/get-episode

Bundled overview of one episode — speakers, top entities, topics, segment counts, and optional transcript.

Return a bundled overview of one podcast episode: title, podcast, speakers (with entity slugs), top mentioned entities, topics, and segment/clip counts.

By default the response is lean — counts plus the top mentioned entities. Set `include_full_segments=true` for the structural outline with timestamps, `include_full_entities=true` for the complete entity list, or `include_transcript=true` for the dialogue transcript (optionally filtered by speaker or time range).

For "every line about X in this episode" use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) with `episode_slug` instead — that returns the dialogue around each mention with `is_mention` flags.

## Inputs

| Field                   | Type    | Required | Default | Description                                                                                     |
| ----------------------- | ------- | -------- | ------- | ----------------------------------------------------------------------------------------------- |
| `episode_slug`          | string  | yes      | —       | Episode slug or canonical ID.                                                                   |
| `include_transcript`    | boolean | no       | `false` | Include the dialogue transcript. Off by default — large for long episodes.                      |
| `transcript_format`     | string  | no       | `text`  | Transcript format when `include_transcript=true`. One of: `dialogue`, `text`, `srt`.            |
| `transcript_speaker`    | string  | no       | —       | Filter the transcript to one speaker (name or entity slug).                                     |
| `transcript_start`      | number  | no       | —       | Transcript start clip in seconds.                                                               |
| `transcript_end`        | number  | no       | —       | Transcript end clip in seconds.                                                                 |
| `include_full_segments` | boolean | no       | `false` | Include the full segment list with start/end timestamps. The lean overview returns only counts. |
| `include_full_entities` | boolean | no       | `false` | Include all mentioned entities ranked by salience. The lean overview returns only the top 20.   |

## Output

A markdown document with the episode title as an H2, then KV lines (`**Podcast:**` as `Title (slug)`, `**Published:**`, `**Episode slug:**`, `**Duration:**`, `**Counts:**` summarising segments/clips/entities), then a paragraph description. The following H3 sections appear when the underlying data is present:

* `### Speakers` — bullets of `Name (role)` (slug appended as `— slug: <entity_slug>` when linked).
* `### Top entities` — bullets of `Name (slug) — salience X.XXX, N occurrences`. Capped at 20 unless `include_full_entities=true`.
* `### Topics` — bullets, one topic per line.
* `### Segments` — only when `include_full_segments=true`. Bullets formatted `#N TYPE — Title @ Xs–Ys`.
* `### Transcript (<format>)` — only when `include_transcript=true`. Body is the raw transcript text/SRT, or for `dialogue` format a series of `**Speaker:** text` lines (speaker label bold, text plain).

Sample (`episode_slug="why-are-we-all-so-stressed", include_full_segments=true`, truncated):

```markdown theme={"dark"}
## Why are we all so stressed?

**Podcast:** 6 Minute English (6-minute-english)
**Published:** 2026-04-23
**Episode slug:** why-are-we-all-so-stressed
**Duration:** 402s
**Counts:** 9 segments, 0 clips, 4 entities
Worrying about exams, work or climate change in the news. …

### Speakers

- Neil (HOST)
- Becca (HOST)

### Top entities

- Claudia Hammond (claudia-hammond) — salience 0.875, 15 occurrences
- English (english) — salience 0.375, 11 occurrences

### Topics

- Mental Health
- Stress Management

### Segments

- #1 INTRO — Show and series introduction @ 0s–41s
- #2 PERSONAL_BANTER — Hosts share what makes them stressed @ 42s–94s
- #3 TOPIC_DISCUSSION — Defining overwhelm and burnout @ 95s–150s
```

## Example

```text theme={"dark"}
Agent calls: podcasts/get_episode {
  "episode_slug": "whcd-shooting-aftermath-musk-and-altman-face-off",
  "include_full_segments": true,
  "include_transcript": true,
  "transcript_format": "dialogue",
  "transcript_speaker": "kara-swisher"
}
```

## Related

* REST equivalents: [`GET /v1/podcasts/episodes/{id}`](/podcasts/episodes), [`/transcript`](/podcasts/transcripts), [`/segments`](/podcasts/segments-and-clips), [`/entities`](/podcasts/episodes#entities).
* For dialogue around a specific entity in this episode, use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) with `episode_slug`.
* For ranked dialogue across the catalog, use [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue).


# podcasts/list_clips
Source: https://docs.particle.pro/mcp/tools/podcasts/list-clips

Engagement-ranked highlight clips across the catalog with direct MP3 URLs.

List engagement-ranked highlight clips across the catalog. Filter by episode, podcast, clip type, or engagement score. Each clip includes a direct MP3 audio URL and the parent episode/podcast slugs.

For clip discovery driven by *what is said* (semantic or keyword), use [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue) instead — overlapping clips come back inside each ranked match.

## Inputs

| Field            | Type            | Required | Default | Description                                                                                                                                                                                         |
| ---------------- | --------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `episode_slug`   | string          | no       | —       | Filter to a specific episode by slug or ID.                                                                                                                                                         |
| `podcast_slug`   | string          | no       | —       | Filter to a specific podcast by slug or ID.                                                                                                                                                         |
| `clip_type`      | string          | no       | —       | One of: `SPICY`, `CONTROVERSIAL`, `EMOTIONAL`, `FUNNY`, `SHOCKING`, `INSIGHTFUL`, `INFORMATIVE`, `EDUCATIONAL`, `PHILOSOPHICAL`, `AHA_MOMENT`, `NOTABLE_LINE`, `BEST_STORY`, `DEBATE_DISAGREEMENT`. |
| `min_engagement` | integer (0–100) | no       | —       | Minimum engagement score. Values above 70 are typical for a strong clip.                                                                                                                            |
| `limit`          | integer (1–50)  | no       | 10      | Clips per page.                                                                                                                                                                                     |
| `cursor`         | string          | no       | —       | Opaque pagination cursor.                                                                                                                                                                           |

## Output

A markdown document with `## Clips (N)` and one `### Clip title` section per clip. Each section carries bulleted KV rows: `- **Type:**`, `- **Engagement:**` (0–100), `- **Duration:**`, `- **Speaker:**` (with entity slug appended as `Name (entity_slug)` when linked), `- **Episode:**`, `- **Podcast:**`, and `- **Audio:**` (direct MP3 URL), then a paragraph with the clip's intro statement (ready-to-share copy). When more pages exist, a horizontal rule and a `**Cursor:** <value>` line are appended; pass that value back as `cursor` to fetch the next page.

Sample (`podcast_slug="6-minute-english", limit=2`):

```markdown theme={"dark"}
## Clips (2)

### Debunking Wellness Quick-Fire

- **Type:** INSIGHTFUL
- **Engagement:** 78
- **Duration:** 36s
- **Speaker:** Georgie
- **Episode:** Can we boost the immune system?
- **Podcast:** 6 Minute English
- **Audio:** https://storage.googleapis.com/uploads.mongoosehq.com/podcast/episode/b1f22a91-…/clip/audio/e8342676-….mp3

Let's test trendy immune boosters fast.

### Do Saunas Extend Life?

- **Type:** INFORMATIVE
- **Engagement:** 78
- **Duration:** 62s
- **Speaker:** Damian Bailey
- **Episode:** Are saunas good for you?
- **Podcast:** 6 Minute English
- **Audio:** https://storage.googleapis.com/uploads.mongoosehq.com/podcast/episode/ef983ead-…/clip/audio/dfe2db33-….mp3

So, are sauna benefits actually real?
```

The URL after `- **Audio:**` is the direct MP3 — usable as an `<audio>` source or for downstream transcription.

## Example

```text theme={"dark"}
Agent calls: podcasts/list_clips {
  "podcast_slug": "all-in",
  "clip_type": "DEBATE_DISAGREEMENT",
  "min_engagement": 80,
  "limit": 5
}
```

## Related

* REST equivalent: [`GET /v1/podcasts/clips`](/podcasts/segments-and-clips).
* For dialogue-content-driven clip discovery, use [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue) — `overlapping_clips` is set on each ranked match.


# podcasts/list_episodes
Source: https://docs.particle.pro/mcp/tools/podcasts/list-episodes

Filter-driven episode discovery across the catalog — by podcast, entity, company, language, date range, duration, or transcript availability.

List episodes across the catalog with rich filters: by podcast, entity, company, language, date range, duration, or transcript availability.

Use this for episode-level discovery when you only need metadata (title, duration, speakers, counts). For dialogue around an entity in any episode, use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions). For ranked retrieval by topic, use [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue).

## Inputs

| Field              | Type           | Required | Default | Description                                                                                                                                                                                                                                                                   |
| ------------------ | -------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `podcast_slug`     | string         | no       | —       | Podcast slug or ID. Restrict to one podcast.                                                                                                                                                                                                                                  |
| `entity_slug`      | string         | no       | —       | Entity slug or ID. Episodes featuring or mentioning the entity.                                                                                                                                                                                                               |
| `company_slug`     | string         | no       | —       | Company slug, domain, or ID. Resolves to the linked entity.                                                                                                                                                                                                                   |
| `role`             | string         | no       | —       | Entity role filter when `entity_slug` or `company_slug` is set. One of: `guest`, `host`, `panelist`, `correspondent`, `mention`.                                                                                                                                              |
| `published_after`  | string         | no       | —       | ISO 8601 date or date-time.                                                                                                                                                                                                                                                   |
| `published_before` | string         | no       | —       | ISO 8601 date or date-time.                                                                                                                                                                                                                                                   |
| `language`         | string         | no       | —       | ISO 639-1 language code (e.g. `"en"`).                                                                                                                                                                                                                                        |
| `has_transcript`   | boolean        | no       | `false` | When `true`, return only episodes with a completed transcript. `false` or omitted means no transcript filter — both transcribed and untranscribed episodes are included. (To find untranscribed episodes specifically, post-filter on the response's `has_transcript` field.) |
| `min_duration`     | integer (≥0)   | no       | —       | Minimum episode duration in seconds.                                                                                                                                                                                                                                          |
| `max_duration`     | integer (≥0)   | no       | —       | Maximum episode duration in seconds.                                                                                                                                                                                                                                          |
| `limit`            | integer (1–50) | no       | 10      | Episodes per page.                                                                                                                                                                                                                                                            |
| `cursor`           | string         | no       | —       | Opaque pagination cursor.                                                                                                                                                                                                                                                     |

## Output

A markdown document with `## Episodes (N)` and one `### Episode title` section per episode. Each section carries bulleted KV rows: `- **Podcast:**`, `- **Published:**`, `- **Episode slug:**`, `- **Duration:**`, `- **Counts:**` (segments / clips / entities), and `- **Speakers:**`. The Speakers row is a comma-separated list with up to 6 names; entries with linked entities render as `Name (entity_slug)`. When more pages exist, a horizontal rule and a `**Cursor:** <value>` line are appended; pass that value back as `cursor` to fetch the next page.

Sample (`podcast_slug="6-minute-english", limit=2`):

```markdown theme={"dark"}
## Episodes (2)

### Should we eat ultra-processed food?

- **Podcast:** 6 Minute English
- **Published:** 2026-04-30
- **Episode slug:** should-we-eat-ultra-processed-food
- **Duration:** 402s
- **Counts:** 12 segments, 0 clips, 5 entities
- **Speakers:** Hannah Gelbart (hannah-gelbart), Pippa, speaker_2, speaker_3, Phil, Annabel Rackham (annabel-rackham)

### Why are we all so stressed?

- **Podcast:** 6 Minute English
- **Published:** 2026-04-23
- **Episode slug:** why-are-we-all-so-stressed
- **Duration:** 402s
- **Counts:** 9 segments, 0 clips, 4 entities
- **Speakers:** Iqra Farooq, Neil, Becca, Claudia Hammond (claudia-hammond)
---

**Cursor:** r.4gfFC6
```

The string after `- **Episode slug:**` is what you pass back as `episode_slug` to [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode) or [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions).

## Example

```text theme={"dark"}
Agent calls: podcasts/list_episodes {
  "entity_slug": "marc-andreessen",
  "role": "guest",
  "published_after": "2025-01-01",
  "has_transcript": true,
  "limit": 20
}
```

## Related

* REST equivalent: [`GET /v1/podcasts/episodes`](/podcasts/episodes).
* For per-episode dialogue, drill into [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode) or [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) with the returned `episode_slug`.


# podcasts/resolve_podcast
Source: https://docs.particle.pro/mcp/tools/podcasts/resolve-podcast

Find a podcast by free-text title or exact slug; returns slug, episode count, bias, recurring speakers, and optional external platform links and recent episodes.

Find a podcast by free-text title or exact slug. Returns slug, title, episode count, bias, and the top recurring speakers (with entity slugs). Use the slug as the agent-facing handle to feed into other podcast tools.

With both `query` and `slug` omitted, returns the most recently updated podcasts — useful for browsing the catalog when you don't have a name in mind.

Optional hydrations attach extra data to each result in the same call:

* `include: ["external_links"]`: third-party platform presences (Apple Podcasts, Spotify, YouTube, X, publisher website, etc.) with resolved URLs and audience metrics.
* `include: ["suitability"]`: per-category brand-suitability breakdown (12 [IAB Tech Lab Brand Safety & Suitability categories](/podcasts/suitability) with prevalence, treatment, derived risk level, reasoning, and evidence excerpts). The high-level `suitability_tier` enum (`SAFE` / `LIMITED` / `SENSITIVE` / `UNSAFE`) is rendered on every result without opt-in.
* `recent_episodes: N`: inline this many of each result's most recent episodes (slug, title, published\_at, duration) — skip the follow-up `list_episodes` call when you only need the most recent tail.

## Inputs

| Field             | Type           | Required | Default | Description                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | -------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`           | string         | no       | —       | Free-text search across podcast titles and descriptions (case-insensitive partial match).                                                                                                                                                                                                                                                                                                                                                             |
| `slug`            | string         | no       | —       | Exact slug match for a known handle (e.g. `"all-in"`).                                                                                                                                                                                                                                                                                                                                                                                                |
| `limit`           | integer (1–25) | no       | 5       | Maximum candidates to return.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `include`         | array of enums | no       | `[]`    | Optional non-parameterized hydrations to attach to each result. `external_links` adds third-party platform presences (directories, social profiles, video channels, publisher websites). `suitability` adds the per-category brand-suitability breakdown (12 categories with prevalence, treatment, risk level, reasoning, and evidence excerpts). The high-level `suitability_tier` enum is rendered on every result without opt-in. Off by default. |
| `recent_episodes` | integer (0–25) | no       | `0`     | Inline this many of each result's most recent episodes (slug, title, published\_at, duration). `0` (default) means none — call `list_episodes` if you need more than the inline tail.                                                                                                                                                                                                                                                                 |

## Output

A markdown document with `## Podcast matches (N)` and one `### Title` section per podcast. Each section carries bulleted KV rows: `- **Slug:**`, `- **Episodes:**`, `- **Bias:**` (when rated; values: `EXTREME_LEFT`, `LEANS_LEFT`, `LEFT`, `CENTER`, `RIGHT`, `LEANS_RIGHT`, `EXTREME_RIGHT`), `- **Suitability tier:**` (when assessed; values: `SAFE`, `LIMITED`, `SENSITIVE`, `UNSAFE`), `- **Language:**` (only those with values), then a paragraph description, then a `Top speakers:` heading followed by up to 8 bullets — each formatted `Name (entity_slug) — role` (entity\_slug omitted if not linked, role omitted if absent).

When `include` contains `suitability` and the podcast has been assessed, a `Suitability breakdown:` line follows with `Confidence`, `Episodes analyzed`, `Window`, the summary paragraph, and one bullet per category whose prevalence is above `NONE`, formatted `**code** — prevalence=…, treatment=…, risk=…` followed by the reasoning paragraph and any cited evidence excerpts. Categories at `NONE` are omitted from the breakdown to keep the rendering compact (the dedicated REST endpoint at [GET /v1/podcasts//suitability](/podcasts/suitability) returns all 12 entries unconditionally).

When `include` contains `external_links` and at least one platform resolved to a usable URL or identifier, an `External links:` line follows the speakers list with one bullet per platform, formatted `Platform: <url>` (or `Platform: <identifier>` when no URL is available — useful for handle-only platforms like `X (Twitter): @hardfork`). Platforms with neither a URL nor an identifier are skipped silently; if every platform for a podcast is skipped, the `External links:` header is omitted entirely.

When `recent_episodes` is greater than 0, a `Recent episodes:` line follows with up to that many bullets per podcast, formatted `YYYY-MM-DD · episode-slug — Episode title (~Nm)` (date or duration segments are omitted when the underlying value is missing). The `episode-slug` is the same handle accepted by [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode) and the `episode_slug` argument on other tools.

Sample (`slug="all-in"`):

```markdown theme={"dark"}
## Podcast matches (1)

### All-In with Chamath, Jason, Sacks & Friedberg

- **Slug:** all-in
- **Episodes:** 201
- **Bias:** LEANS_RIGHT
- **Language:** en

Industry veterans, degenerate gamblers & besties Chamath Palihapitiya, Jason Calacanis, David Sacks & David Friedberg cover all things economic, tech, political, social & poker.

Top speakers:
- Jason Calacanis (jason-calacanis) — HOST
- Chamath Palihapitiya (chamath-palihapitiya) — HOST
- David Friedberg (david-friedberg) — HOST
- David O. Sacks (david-o-sacks) — HOST
```

The string after `- **Slug:**` is the podcast handle to feed back as `podcast_slug` to other tools. Each speaker bullet's parenthesized `(entity_slug)` (when present) is the knowledge-graph handle for that person — feed it into [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) or [`podcasts/list_episodes`](/mcp/tools/podcasts/list-episodes) to follow them across the catalog.

Sample with external links (`slug="hard-fork", include=["external_links"]`, abridged):

```markdown theme={"dark"}
## Podcast matches (1)

### Hard Fork

- **Slug:** hard-fork
- **Episodes:** 142
- **Language:** en

…

External links:
- Apple Podcasts: https://podcasts.apple.com/hard-fork
- Spotify: https://open.spotify.com/show/hard-fork
- X (Twitter): @hardfork
```

Sample with recent episodes (`slug="all-in", recent_episodes=3`, abridged):

```markdown theme={"dark"}
## Podcast matches (1)

### All-In with Chamath, Jason, Sacks & Friedberg

**Slug:** all-in
**Episodes:** 201
…
Recent episodes:
- 2026-04-30 · all-in-201 — The AI hardware reset (~68m)
- 2026-04-23 · all-in-200 — Bestie roundtable: 200th episode (~92m)
- 2026-04-16 · all-in-199 — Spring earnings season recap (~71m)
```

## Example

```text theme={"dark"}
Agent calls: podcasts/resolve_podcast { "query": "all in" }
            → reads "- **Slug:**" row → "all-in"

Agent calls: advertising/get_podcast_sponsors { "podcast_slug": "all-in" }
```

Pulling subscription URLs for a known podcast:

```text theme={"dark"}
Agent calls: podcasts/resolve_podcast {
  "slug": "hard-fork",
  "include": ["external_links"]
}
            → reads "External links:" bullets for each platform
```

Answering "what are the most recent episodes of All-In?" in a single call:

```text theme={"dark"}
Agent calls: podcasts/resolve_podcast {
  "slug": "all-in",
  "recent_episodes": 5
}
            → reads "Recent episodes:" bullets for each result
```

## Related

* REST equivalent: [`GET /v1/podcasts`](/podcasts/overview).
* For sponsor analytics on a single podcast, use [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors).


# podcasts/search_dialogue
Source: https://docs.particle.pro/mcp/tools/podcasts/search-dialogue

Semantic, keyword, or hybrid search over podcast dialogue with bounded transcript windows and overlapping clips.

Search the podcast catalog by what is said in episodes — by meaning (`semantic_search`), by exact phrase (`keyword_search`), or both at once (hybrid ranking). Each result is one segment of one episode with bounded transcript windows pinpointing the highest-relevance lines and any highlight clips that overlap the segment.

Use this for "find dialogue *about* a topic". For "every line *naming* a person or company" use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) instead — `entity_slug` and `company_slug` here narrow ranked results, they don't drive the ranking.

## Inputs

At least one of `semantic_search` or `keyword_search` is required.

| Field             | Type           | Required | Default     | Description                                                                                                                                                                     |
| ----------------- | -------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `semantic_search` | string         | one of   | —           | Vector-similarity search by meaning. Express the query the way you'd describe the topic to a colleague — paraphrase tolerant. Combine with `keyword_search` for hybrid ranking. |
| `keyword_search`  | string         | one of   | —           | BM25 lexical search over dialogue. Use when an exact token must appear (tickers, drug names, model numbers).                                                                    |
| `entity_slug`     | string         | no       | —           | Entity slug or ID. Filters results to episodes featuring this entity.                                                                                                           |
| `company_slug`    | string         | no       | —           | Company slug, domain, or ID. Resolves to the company's linked entity and applies as a filter.                                                                                   |
| `podcast_slug`    | string         | no       | —           | Podcast slug or ID.                                                                                                                                                             |
| `episode_slug`    | string         | no       | —           | Filter to a specific episode by slug or ID.                                                                                                                                     |
| `segment_type`    | string         | no       | —           | Segment type filter. One of: `INTRO`, `PERSONAL_BANTER`, `TOPIC_DISCUSSION`, `INTERVIEW`, `TRANSITION`, `AD`, `OUTRO`.                                                          |
| `role`            | string         | no       | —           | Speaker/mention role filter on the entity\_slug or company\_slug filter. One of: `guest`, `host`, `panelist`, `correspondent`, `mention`.                                       |
| `since`           | string         | no       | —           | Only segments from episodes published on or after this ISO 8601 date.                                                                                                           |
| `until`           | string         | no       | —           | Only segments from episodes published on or before this ISO 8601 date.                                                                                                          |
| `sort`            | string         | no       | `relevance` | Sort order. One of: `relevance`, `recency`.                                                                                                                                     |
| `limit`           | integer (1–50) | no       | 10          | Results per page.                                                                                                                                                               |
| `cursor`          | string         | no       | —           | Opaque pagination cursor.                                                                                                                                                       |

## Output

A markdown document with `## Dialogue matches (N)` and one `### Segment title` section per match. Each section carries bulleted KV rows: `- **Episode:**`, `- **Podcast:**`, `- **Published:**`, `- **Episode slug:**`, `- **Segment type:**`, `- **Match:**` (the source: `semantic`, `keyword`, or `hybrid`), then one or more bullets formatted `Window @ start–end` (or `Preview @ …` for truncated windows) followed by indented dialogue lines. The line that ranked highest for the query is rendered with the entire `Speaker: text` wrapped in bold; surrounding context renders as `**Speaker:** text` (speaker label bold, text plain). When highlight clips overlap the segment, they appear under an `Overlapping clips:` line as bullets. When more pages exist, a horizontal rule and a `**Cursor:** <value>` line are appended; pass that value back as `cursor` to fetch the next page.

The bolded line means "this is the highest-ranked line for the current query". This is a different signal from the bolded line in [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions), which means "this line names the resolved entity" — they answer different questions and can both be true within the same episode for different reasons.

Sample (`semantic_search="how AI affects the labor market", limit=2`):

```markdown theme={"dark"}
## Dialogue matches (2)

### Labor Market Transformation from AI

- **Episode:** Where Investment Themes Intersect and Beat Markets
- **Podcast:** Thoughts on the Market
- **Published:** 2026-04-20
- **Episode slug:** where-investment-themes-intersect-and-beat-markets
- **Segment type:** TOPIC_DISCUSSION
- **Match:** semantic
- Window @ 108s–143s
    **Stephen Byrd: Now, at the same time, AI is reshaping the labor market.**
    **Stephen Byrd: We estimate that automation or augmentation will impact ninety percent of occupations…**
    **Stephen Byrd:** And on net, we see a four percent job loss driven by eleven percent of outright elimination…

### Goldman Sachs Report on AI and Job Displacement

- **Episode:** TNB Tech Minute: Thrive Capital and Andreesen Horowitz Co-lead …
- **Podcast:** WSJ Tech News Briefing
- **Published:** 2026-03-03
- **Episode slug:** tnb-tech-minute-thrive-capital-and-andreesen-horowitz-co-lead-multibillion
- **Segment type:** TOPIC_DISCUSSION
- **Match:** semantic
- Window @ 43s–67s
    **Danny Lewis: Speaking of AI, a new research report by Goldman Sachs is predicting the technology will eventually displace eleven million jobs…**
---

**Cursor:** r.4gfFC6
```

The string after `- **Episode slug:**` is what you can feed into [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode) for the full transcript or into [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions) (`format=detail`, `episode_slug`) for mention windows around a specific person.

## Example

```text theme={"dark"}
Agent calls: podcasts/search_dialogue {
  "semantic_search": "how AI affects the labor market",
  "podcast_slug": "all-in",
  "since": "2024-01-01",
  "limit": 5
}
```

For hybrid ranking, populate both `semantic_search` and `keyword_search`:

```text theme={"dark"}
Agent calls: podcasts/search_dialogue {
  "semantic_search": "what investors think of GPT-5",
  "keyword_search": "GPT-5",
  "limit": 10
}
```

## Related

* REST equivalent: [`GET /v1/podcasts/search`](/podcasts/search).
* For "every line naming X" use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions).
* For metadata-only episode discovery (no dialogue), use [`podcasts/list_episodes`](/mcp/tools/podcasts/list-episodes).


# Advertising
Source: https://docs.particle.pro/podcasts/advertising

Sponsor analytics across the podcast catalog: leaderboards, per-company presence, and co-occurrence.

Particle API extracts every sponsor read from every transcribed episode, attributes them to a company in the [knowledge graph](/knowledge-graph/entities), and aggregates the result. You get sponsor-side analytics — who advertises where, how often, with what read style — without scraping audio yourself.

<Note>Available to MCP agents as [`advertising/get_company_ad_presence`](/mcp/tools/advertising/get-company-ad-presence), [`advertising/get_podcast_sponsors`](/mcp/tools/advertising/get-podcast-sponsors), and [`advertising/sponsor_leaderboard`](/mcp/tools/advertising/sponsor-leaderboard).</Note>

## Per-company advertising

The fastest way to see how a single company shows up as a sponsor:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/companies/nvidia/podcast/advertising" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/companies/nvidia/podcast/advertising",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const summary = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/companies/nvidia/podcast/advertising",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  summary = res.json()
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "company_id": "nvidia.com",
  "total_ads": 13,
  "podcast_reach": 3,
  "episode_reach": 10,
  "read_type_breakdown": { "host_read": 12, "pre_recorded": 1 },
  "recent_ads": [
    {
      "sponsor_name": "NVIDIA Studio",
      "read_type": "HOST_READ",
      "placement_type": "PRE_ROLL",
      "start_seconds": 14.2,
      "end_seconds": 78.6,
      "duration_seconds": 64.4,
      "podcast": { "title": "Giant Bombcast", "slug": "giant-bombcast" },
      "created_at": "2026-03-26T02:22:26Z"
    },
    {
      "sponsor_name": "NVIDIA",
      "product": "Arc Raiders",
      "read_type": "HOST_READ",
      "placement_type": "PRE_ROLL",
      "podcast": { "title": "Kinda Funny Gamescast", "slug": "kinda-funny-gamescast" }
    }
    // …
  ]
}
```

`read_type_breakdown` distinguishes host-reads from pre-recorded spots. `placement_type` distinguishes `PRE_ROLL` / `MID_ROLL` / `POST_ROLL`. `recent_ads` includes per-product attribution where the read called out a specific product line, plus segment timing within the episode — see [Per-episode ads](#per-episode-ads) below for details.

## Per-podcast advertising summary

Same idea, inverted — for a single podcast, who's sponsoring it?

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/all-in/advertising" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "total_ads": 47,
  "top_sponsors": [
    { "sponsor_name": "OKX",        "company_id": "okx.com",        "ad_count": 7, "episode_count": 7 },
    { "sponsor_name": "Circle",     "company_id": "circle.com",     "ad_count": 5, "episode_count": 5 },
    { "sponsor_name": "Solana",     "company_id": "solanalabs.com", "ad_count": 4, "episode_count": 4 },
    { "sponsor_name": "Polymarket", "company_id": "polymarket.com", "ad_count": 3, "episode_count": 3 }
    // …
  ]
}
```

A useful proxy for category fit — crypto-native sponsors dominate All-In, for example.

## Per-episode ads

When you already have an episode in hand — for example, drilling in after `list-episodes` or after a transcript-based search — fetch the individual ad reads detected in that episode:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/ads" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/ads",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/ads",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "5n8KqRrPmTyVxWzAbCdEf2",
      "sponsor_name": "OKX",
      "product": "OKX Wallet",
      "offer_description": "Sign up at okx.com/allin",
      "sponsor_url": "https://www.okx.com/allin",
      "read_type": "HOST_READ",
      "placement_type": "MID_ROLL",
      "start_seconds": 2110.3,
      "end_seconds": 2246.5,
      "duration_seconds": 136.2,
      "company": { "id": "okx.com", "name": "OKX" },
      "podcast": { "title": "All-In with Chamath, Jason, Sacks & Friedberg", "slug": "all-in" },
      "created_at": "2026-04-12T14:08:31Z"
    },
    {
      "sponsor_name": "Polymarket",
      "read_type": "HOST_READ",
      "placement_type": "PRE_ROLL",
      "start_seconds": 12.0,
      "end_seconds": 47.8,
      "duration_seconds": 35.8,
      "company": { "id": "polymarket.com", "name": "Polymarket" },
      "podcast": { "title": "All-In with Chamath, Jason, Sacks & Friedberg", "slug": "all-in" }
    }
    // …
  ],
  "has_more": false
}
```

`company` resolves the sponsor read to a knowledge-graph company so you can join against [company endpoints](/companies/overview). Network promos (cross-promotion of other shows in the same network) are filtered out. For rolled-up views across episodes, see [Per-podcast advertising summary](#per-podcast-advertising-summary) and the [Sponsor leaderboard](#sponsor-leaderboard) below.

Each ad carries the segment timing — `start_seconds`, `end_seconds`, `duration_seconds` — measured against the episode timeline. That's enough to align ads with the transcript, measure read length, or join with the raw audio offset for downstream analysis.

## Sponsor leaderboard

The most-active sponsors across the catalog:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/advertising/leaderboard?limit=5" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    { "rank": 1, "sponsor": { "name": "Grainger",    "company": { "id": "grainger.com",    "name": "W. W. Grainger" } },        "ad_count": 14055, "podcast_reach": 538, "episode_reach": 9621 },
    { "rank": 2, "sponsor": { "name": "Mint Mobile", "company": { "id": "mintmobile.com",  "name": "Mint Mobile" } },           "ad_count": 9935,  "podcast_reach": 610, "episode_reach": 8809 },
    { "rank": 3, "sponsor": { "name": "Shopify",     "company": { "id": "shopify.com",     "name": "Shopify" } },               "ad_count": 9288,  "podcast_reach": 576, "episode_reach": 8237 },
    { "rank": 4, "sponsor": { "name": "Progressive", "company": { "id": "progressive.com", "name": "Progressive Corporation" } }, "ad_count": 8216, "podcast_reach": 607, "episode_reach": 5604 },
    { "rank": 5, "sponsor": { "name": "FanDuel",     "company": { "id": "fanduel.com",     "name": "FanDuel" } },               "ad_count": 7298,  "podcast_reach": 279, "episode_reach": 5394 }
    // …
  ]
}
```

Filter by `metric` (`ad_count`, `podcast_reach`, or `episode_reach`) to change the ranking dimension; by `since` / `until` to scope to a time window; or by `company_id` to constrain results to one sponsor's brand family.

## Sponsor co-occurrence

Which sponsors run alongside each other on the same episodes — a useful signal for media-buying overlap, attribution analysis, or competitive positioning:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/advertising/co-occurrence?limit=5" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "sponsor_a": { "name": "Indeed",   "company": { "id": "indeed.com",   "name": "Indeed" } },
      "sponsor_b": { "name": "FanDuel",  "company": { "id": "fanduel.com",  "name": "FanDuel" } },
      "shared_episodes": 1172
    },
    {
      "sponsor_a": { "name": "Shopify",     "company": { "id": "shopify.com",    "name": "Shopify" } },
      "sponsor_b": { "name": "Mint Mobile", "company": { "id": "mintmobile.com", "name": "Mint Mobile" } },
      "shared_episodes": 1072
    }
    // …
  ]
}
```

## Sponsor lookup

Resolve a sponsor by domain, slug, or canonical ID, then list the podcasts they sponsor:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/advertising/sponsors/grainger.com" \
  -H "X-API-Key: $PARTICLE_API_KEY"

curl "https://api.particle.pro/v1/podcasts/advertising/sponsors/grainger.com/podcasts?limit=10" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Related

* [Companies → Overview](/companies/overview) — resolve any company by ticker, domain, or CIK before pulling its ad presence
* [Concepts → Pricing weight](/concepts#pricing-weight) — advertising endpoints are priced higher per call
* [Knowledge graph → Entities](/knowledge-graph/entities) — sponsors map to entities for cross-content tracking


# Episodes
Source: https://docs.particle.pro/podcasts/episodes

Discover and filter episodes across the catalog, with rich per-episode sub-resources.

The cross-podcast episode endpoint is the primary discovery tool. Filter by podcast, entity, company, language, date range, or duration. Every episode comes with sub-resources for transcripts, segments, clips, speakers, entities, and topics.

<Note>Available to MCP agents as [`podcasts/list_episodes`](/mcp/tools/podcasts/list-episodes) and (per-episode) [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode).</Note>

## List episodes

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes?entity_id=sam-altman&limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const url = new URL("https://api.particle.pro/v1/podcasts/episodes");
  url.searchParams.set("entity_id", "sam-altman");
  url.searchParams.set("limit", "3");
  const res = await fetch(url, {
    headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
  });
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/episodes",
      params={"entity_id": "sam-altman", "limit": 3},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "78cgekLUjCJBUZbj3s5K8Y",
      "title": "WHCD Shooting Aftermath, Musk and Altman Face-Off, Spirit Airlines Bailout",
      "podcast": { "id": "QpMz7GYKfSNuUa6zKXA4Q", "title": "Pivot" },
      "published_at": "2026-04-28T10:00:00Z",
      "duration_seconds": 4206,
      "has_transcript": true,
      "segment_count": 21,
      "clip_count": 8,
      "entity_count": 146,
      "speakers": [ /* … */ ]
    }
    // …
  ],
  "has_more": true,
  "cursor": "…"
}
```

The `has_transcript`, `segment_count`, `clip_count`, and `entity_count` fields tell you what enrichment data is available before you fetch any sub-resource.

## Filter parameters

| Parameter                       | Description                                             | Example                                  |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `podcast_id`                    | Slug or ID; restrict to one podcast                     | `?podcast_id=pivot`                      |
| `entity_id`                     | Slug or ID; episodes featuring or mentioning the entity | `?entity_id=sam-altman`                  |
| `company_id`                    | Slug, domain, or ID; episodes featuring a company       | `?company_id=nvidia`                     |
| `language`                      | ISO 639-1 code                                          | `?language=en`                           |
| `published_after`               | ISO 8601 timestamp                                      | `?published_after=2026-04-01T00:00:00Z`  |
| `published_before`              | ISO 8601 timestamp                                      | `?published_before=2026-04-30T00:00:00Z` |
| `has_transcript`                | Limit to transcribed episodes                           | `?has_transcript=true`                   |
| `min_duration` / `max_duration` | Bounds in seconds                                       | `?min_duration=1800&max_duration=7200`   |

Combine freely — for long-form transcribed Sam Altman episodes from this month, for example:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes?\
entity_id=sam-altman&\
has_transcript=true&\
min_duration=1800&\
published_after=2026-04-01T00:00:00Z&\
limit=10" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Get a single episode

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

The full Episode response is documented in the [API reference](/api-reference/introduction).

## Episodes for a specific podcast

A convenience shape of `list-episodes` filtered by podcast:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/pivot/episodes?limit=10" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Sub-resources

Every episode exposes its enrichment data as sub-resources:

| Endpoint                                    | Returns                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `GET .../episodes/{id}/transcript`          | Diarized dialogue (full transcript)                  |
| `GET .../episodes/{id}/transcript/words`    | Word-level timestamps                                |
| `GET .../episodes/{id}/transcript/mentions` | Lines around mentions of an entity                   |
| `GET .../episodes/{id}/segments`            | Structural sections (intros, ads, topic discussions) |
| `GET .../episodes/{id}/clips`               | Highlight clips                                      |
| `GET .../episodes/{id}/speakers`            | Identified speakers with speaking duration           |
| `GET .../episodes/{id}/entities`            | Mentioned entities ranked by salience                |
| `GET .../episodes/{id}/topics`              | Topic classifications                                |

## Speakers

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/speakers" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "name": "Kara Swisher",
      "role": "HOST",
      "speaking_duration_seconds": 1955.12,
      "entity_slug": "kara-swisher"
    },
    {
      "name": "Scott Galloway",
      "role": "HOST",
      "speaking_duration_seconds": 1986.09,
      "entity_slug": "scott-galloway"
    },
    {
      "name": "Elie Honig",
      "role": "SOUNDBITE_SPEAKER",
      "speaking_duration_seconds": 50.30,
      "entity_slug": "elie-honig"
    }
    // …
  ]
}
```

Roles include `HOST`, `CO_HOST`, `GUEST`, `PANELIST`, `CORRESPONDENT`, `SOUNDBITE_SPEAKER`, and `ADVERTISER`. Filter by role on your side if you only want hosts and guests. The `entity_slug` (when present) bridges to the [knowledge graph](/knowledge-graph/entities).

## Entities

Returns people, organizations, places, products, and concepts mentioned in the episode, ranked by **salience** — a relative relevance score for that episode where higher values indicate the entity is more central to the discussion.

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/entities" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "entity": { "id": "1GmOP1C2UZtpnHKPoc", "slug": "openai", "name": "OpenAI" },
      "salience": 0.0061,
      "occurrences": 11
    },
    {
      "entity": { "id": "1GmOP1C3KLh", "slug": "anthropic", "name": "Anthropic" },
      "salience": 0.00024,
      "occurrences": 10
    },
    {
      "entity": { "id": "17PzxG1t12xzno", "slug": "sam-altman", "name": "Sam Altman" },
      "salience": 0.00016,
      "occurrences": 5
    }
    // …
  ]
}
```

For the actual dialogue around mentions, see [transcripts → mentions](/podcasts/transcripts#transcript-mentions).

## Topics

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/topics" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

Topics are drawn from the hierarchical [topics taxonomy](/knowledge-graph/topics) — useful for routing episodes to category-specific feeds.

## Related

* [Transcripts](/podcasts/transcripts) — dialogue, words, mentions, SRT
* [Segments & clips](/podcasts/segments-and-clips) — structural breakdown and highlights
* [Knowledge graph → entities](/knowledge-graph/entities) — follow speakers and topics across the catalog


# External links
Source: https://docs.particle.pro/podcasts/external-links

Every third-party platform on which a podcast has a presence — directories, social profiles, video channels, websites — with resolved URLs and per-platform metadata.

A podcast lives in many places: it's on Apple Podcasts and Spotify, the host posts to X, the publisher runs a YouTube channel, and there's a marketing site on its own domain. The **external-links** endpoint returns every one of those presences in a single, normalized shape — with the platform-native identifier, a ready-to-use web URL, and a list of optional per-platform attributes (subscribers, followers, handle, etc.).

Use this endpoint when you want to:

* Build a "follow this podcast on…" UI without hard-coding per-platform URL templates.
* Compare audience size across platforms (Spotify followers vs. YouTube subscribers vs. Castbox subscribers).
* Pull the publisher's website and social handles for outreach or research.
* Reconcile a podcast across third-party catalogs (Apple ID ↔ Spotify show ID ↔ Podchaser ID).

## List external links for a podcast

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/hard-fork/external-links" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/hard-fork/external-links",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/hard-fork/external-links",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

The path parameter accepts either a slug (`hard-fork`, `all-in`) or a base62-encoded podcast ID — same as every other podcast sub-resource.

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "platform": {
        "name": "apple",
        "display_name": "Apple Podcasts",
        "type": "podcast_directory"
      },
      "identifier": "1528594034",
      "url": "https://podcasts.apple.com/podcast/id1528594034"
    },
    {
      "platform": {
        "name": "spotify",
        "display_name": "Spotify",
        "type": "music_service"
      },
      "identifier": "44fllCS2FTFr2x2kjP9xeT",
      "url": "https://open.spotify.com/show/44fllCS2FTFr2x2kjP9xeT",
      "attributes": [
        {
          "name": "followers",
          "category": "audience_size",
          "value": 3902,
          "observed_at": "2026-04-22T11:00:00Z"
        }
      ]
    },
    {
      "platform": {
        "name": "youtube",
        "display_name": "YouTube",
        "type": "video_channel"
      },
      "identifier": "UCZcR2SVWaGWNlMqPxvQS3vw",
      "url": "https://www.youtube.com/channel/UCZcR2SVWaGWNlMqPxvQS3vw",
      "attributes": [
        { "name": "handle",      "category": "profile",       "value": "hardfork" },
        { "name": "subscribers", "category": "audience_size", "value": 245000 },
        { "name": "videos",      "category": "content",       "value": 200 },
        { "name": "views",       "category": "audience_size", "value": 12345678 }
      ]
    },
    {
      "platform": { "name": "tiktok", "display_name": "TikTok", "type": "social_profile" },
      "identifier": "hardfork",
      "url": "https://www.tiktok.com/@hardfork"
    },
    {
      "platform": { "name": "twitter", "display_name": "X (Twitter)", "type": "social_profile" },
      "identifier": "HardFork",
      "url": "https://twitter.com/HardFork"
    },
    {
      "platform": { "name": "website", "display_name": "Website", "type": "website" },
      "url": "https://www.nytimes.com/column/hard-fork"
    }
    // …
  ],
  "has_more": false
}
```

Per-podcast cardinality is bounded — at most one entry per platform — so the endpoint returns the full set in a single response by default. Pass `?limit=` and `?cursor=` if you specifically want to page through results.

## Anatomy of an entry

Every entry has the same shape regardless of platform. Optional fields are omitted when no data is available.

| Field                   | Description                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform.name`         | Stable machine name (e.g. `spotify`, `youtube`). Suitable for filtering, routing, or persistence.                                                    |
| `platform.display_name` | Human-readable name suitable for UI display (`Apple Podcasts`, `X (Twitter)`).                                                                       |
| `platform.type`         | Broad category. Use this to group presences in a UI rather than enumerating every name.                                                              |
| `identifier`            | Platform-native value (numeric id, slug, handle, or URL). Omitted entirely for the `website` platform — the JSON key is absent, not an empty string. |
| `url`                   | Canonical web URL for this presence. Built from a per-platform template, or passed through for `website`.                                            |
| `attributes`            | Optional per-platform metadata (audience size, profile fields, etc.). May be absent or empty.                                                        |

### Platform types

`platform.type` lets clients render related platforms with a shared treatment without knowing the full list of names:

| Type                | What it covers                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `podcast_directory` | Apple Podcasts, Spotify-as-podcast-directory replicas, Castbox, Podchaser, Player FM, Podcast Addict, Podbean, Podcast Republic, Goodpods, The Podcast App, TuneIn, iHeartRadio. |
| `music_service`     | Spotify, Apple Music–adjacent stores, Audible, Amazon Music — services whose primary brand is audio playback.                                                                    |
| `social_profile`    | X (Twitter), Instagram, Threads, TikTok, Facebook, LinkedIn — handle-based identity.                                                                                             |
| `video_channel`     | YouTube channel for the podcast (and any future video-first platforms).                                                                                                          |
| `community`         | Reddit, Discord, Patreon — where listeners gather around the show.                                                                                                               |
| `website`           | The publisher's own marketing site for the podcast. The `identifier` is omitted; `url` carries the destination.                                                                  |
| `other`             | Reserved for future platforms that don't fit the above. Treat as opaque.                                                                                                         |

### Attributes

Each entry's `attributes` is a list of typed records. The set of attribute names that may appear varies per platform — and grows over time as upstream sources expose richer metadata. Clients should treat unknown attribute names additively rather than enumerating them.

| Field         | Description                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Platform-native attribute name (`subscribers`, `followers`, `handle`, etc.).                                                                        |
| `category`    | Broad grouping. Use this to render unfamiliar attributes without recognising the exact name.                                                        |
| `value`       | The attribute value. JSON type matches the category — numbers for audience/content tallies, strings for profile/account fields, booleans for flags. |
| `observed_at` | ISO 8601 timestamp of when the attribute was last observed from the upstream source. Omitted when unavailable.                                      |

#### Attribute categories

| Category         | Typical names                                        | Value type                                   |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- |
| `audience_size`  | `subscribers`, `followers`, `views`                  | integer                                      |
| `content`        | `videos`                                             | integer                                      |
| `profile`        | `handle`, `display_name`, `thumbnail_url`, `founded` | string (or RFC 3339 timestamp for `founded`) |
| `account_status` | `verified` (forthcoming)                             | boolean                                      |

## Platform reference

The full list of platforms surfaced today, with the URL templates the API uses to build the `url` field. New platforms may be added without notice; existing platform names are stable.

| `name`         | `display_name`   | `type`              | URL pattern                                                                                                                                 |
| -------------- | ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `amazon_music` | Amazon Music     | `music_service`     | `https://music.amazon.com/podcasts/{id}`                                                                                                    |
| `apple`        | Apple Podcasts   | `podcast_directory` | `https://podcasts.apple.com/podcast/id{id}`                                                                                                 |
| `audible`      | Audible          | `music_service`     | `https://www.audible.com/pd/{id}`                                                                                                           |
| `castbox`      | Castbox          | `podcast_directory` | `https://castbox.fm/channel/id{id}`                                                                                                         |
| `discord`      | Discord          | `community`         | `https://discord.gg/{id}`                                                                                                                   |
| `facebook`     | Facebook         | `social_profile`    | `https://www.facebook.com/{id}`                                                                                                             |
| `goodpods`     | Goodpods         | `podcast_directory` | `https://www.goodpods.com/podcasts/{id}`                                                                                                    |
| `iheartradio`  | iHeartRadio      | `podcast_directory` | `https://www.iheart.com/podcast/{id}/`                                                                                                      |
| `instagram`    | Instagram        | `social_profile`    | `https://www.instagram.com/{id}/`                                                                                                           |
| `itunes`       | iTunes           | `podcast_directory` | `https://podcasts.apple.com/podcast/id{id}`                                                                                                 |
| `linkedin`     | LinkedIn         | `social_profile`    | `https://www.linkedin.com/company/{id}/`                                                                                                    |
| `patreon`      | Patreon          | `community`         | `https://www.patreon.com/{id}`                                                                                                              |
| `playerfm`     | Player FM        | `podcast_directory` | `https://player.fm/series/{id}`                                                                                                             |
| `podaddict`    | Podcast Addict   | `podcast_directory` | `https://podcastaddict.com/podcast/{id}`                                                                                                    |
| `podbean`      | Podbean          | `podcast_directory` | `https://www.podbean.com/podcast-detail/{id}`                                                                                               |
| `podchaser`    | Podchaser        | `podcast_directory` | `https://www.podchaser.com/podcasts/{id}`                                                                                                   |
| `podrepublic`  | Podcast Republic | `podcast_directory` | `https://www.podcastrepublic.net/podcast/{id}`                                                                                              |
| `reddit`       | Reddit           | `community`         | `https://www.reddit.com/r/{id}/`                                                                                                            |
| `spotify`      | Spotify          | `music_service`     | `https://open.spotify.com/show/{id}`                                                                                                        |
| `threads`      | Threads          | `social_profile`    | `https://www.threads.net/@{id}`                                                                                                             |
| `tiktok`       | TikTok           | `social_profile`    | `https://www.tiktok.com/@{id}`                                                                                                              |
| `tpa`          | The Podcast App  | `podcast_directory` | `https://thepodcastapp.com/p/{id}`                                                                                                          |
| `tunein`       | TuneIn           | `podcast_directory` | `https://tunein.com/podcasts/{id}/`                                                                                                         |
| `twitter`      | X (Twitter)      | `social_profile`    | `https://twitter.com/{id}`                                                                                                                  |
| `website`      | Website          | `website`           | URL only; no separate `identifier` field                                                                                                    |
| `youtube`      | YouTube          | `video_channel`     | `https://www.youtube.com/channel/{id}` for channel-ID identifiers (`UC` + 22 chars), `https://www.youtube.com/@{id}` for handle identifiers |

## YouTube: richer attributes

YouTube is currently the most heavily-enriched platform. A YouTube entry can carry up to four attributes today:

```jsonc theme={"dark"}
{
  "platform": { "name": "youtube", "display_name": "YouTube", "type": "video_channel" },
  "identifier": "UCZcR2SVWaGWNlMqPxvQS3vw",
  "url": "https://www.youtube.com/channel/UCZcR2SVWaGWNlMqPxvQS3vw",
  "attributes": [
    { "name": "handle",       "category": "profile",       "value": "hardfork" },
    { "name": "subscribers",  "category": "audience_size", "value": 245000 },
    { "name": "videos",       "category": "content",       "value": 200 },
    { "name": "views",        "category": "audience_size", "value": 12345678 }
  ]
}
```

The `display_name`, `thumbnail_url`, and `founded` attributes may also appear when known.

## Notes and gotchas

### `apple` and `itunes` are usually duplicates

Apple Podcasts uses a single numeric ID across both its modern and iTunes-era surfaces. Most podcasts therefore have **two** entries — `apple` and `itunes` — with the same `identifier` and the same resolved `url`. This faithfully reflects what upstream catalog sources report; clients that want a single Apple entry can de-duplicate by `(type, identifier)`.

### Attributes are forward-compatible

Both `attributes[].name` and `attributes[].category` are open enumerations. New names (e.g. a future `engagement_rate` for Instagram) and new categories will be added without a versioning event. Always render unknown attributes additively — match on `category` for grouping when the name isn't recognized.

### `observed_at` is best-effort

Some attributes don't have a known observation timestamp; the field is then omitted. When present, the timestamp reflects the last time the value was refreshed from the upstream source — not the last time the *podcast* itself was updated.

### Identifier formats vary

The `identifier` is whatever the platform natively uses. Examples:

| Platform             | Sample identifier          | Shape                                          |
| -------------------- | -------------------------- | ---------------------------------------------- |
| `apple` / `itunes`   | `1528594034`               | Numeric Apple Podcasts ID                      |
| `spotify`            | `44fllCS2FTFr2x2kjP9xeT`   | Spotify show ID                                |
| `youtube`            | `UCZcR2SVWaGWNlMqPxvQS3vw` | Channel ID (or short handle for some podcasts) |
| `twitter` / `tiktok` | `HardFork` / `hardfork`    | Account handle (no `@`)                        |
| `podbean`            | `dir2423160,nrwgx`         | Podbean-internal pair (don't try to parse)     |

The `website` platform is the exception: there's no separate identifier — the entry omits `identifier` entirely and only carries `url`.

If you need a clickable link, prefer the resolved `url` over building one yourself; URL templates change.

## Choosing the right endpoint

| You want to…                                                                             | Use this                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Show a "find this podcast on …" list of platforms                                        | `external-links`                                                   |
| Compare audience size (followers / subscribers) across platforms                         | `external-links` (filter by `attributes[].category=audience_size`) |
| Get the podcast's own metadata (title, publisher, description, RSS feed, episode counts) | [`GET /v1/podcasts/{id}`](/podcasts/overview)                      |
| List episodes for a podcast                                                              | [`GET /v1/podcasts/{id}/episodes`](/podcasts/episodes)             |
| Sponsor / advertising profile                                                            | [`GET /v1/podcasts/{id}/advertising`](/podcasts/advertising)       |
| Political bias analysis                                                                  | [`GET /v1/podcasts/{id}/bias`](/podcasts/overview#bias-analysis)   |

## Related

* [Podcasts overview](/podcasts/overview) — full Podcast object and other sub-resources.
* [Episodes](/podcasts/episodes) — drill from a podcast into its individual episodes.
* [Knowledge graph → entities](/knowledge-graph/entities) — the canonical record for the podcast's hosts, guests, and topics.


# Mentions
Source: https://docs.particle.pro/podcasts/mentions

Every line of dialogue where a person or company is named, grouped by episode. The right endpoint for read-everything-about-X workflows.

`GET /v1/podcasts/mentions` returns every line of dialogue across the catalog where a resolved entity is named, grouped by episode and ordered by recency. Each item in `data` is one episode plus all of its mention windows. A *mention window* is a contiguous range of dialogue around a name, with `is_mention` flagged on the lines that actually contain it.

This is the right endpoint when the answer doesn't depend on the wording of your query — only on **who** is being named.

<Note>Available to MCP agents as [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions).</Note>

## When to use Mentions vs Search

| You want…                                                         | Use this                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Every line where a person or company is mentioned**             | [`/v1/podcasts/mentions?entity_id=…`](/podcasts/mentions)              |
| Episodes featuring an entity, restricted to one podcast           | [`/v1/podcasts/mentions?entity_id=…&podcast_id=…`](/podcasts/mentions) |
| Mentions filtered by participation (host vs guest vs mention)     | [`/v1/podcasts/mentions?entity_id=…&role=guest`](/podcasts/mentions)   |
| Dialogue *about a topic* across the catalog (paraphrase tolerant) | [`/v1/podcasts/search?semantic_search=…`](/podcasts/search)            |
| Dialogue containing exact tokens or phrases                       | [`/v1/podcasts/search?keyword_search=…`](/podcasts/search)             |

## Examples

```bash theme={"dark"}
# Every line about Sam Altman across the catalog, with 2 lines of context.
curl --get "https://api.particle.pro/v1/podcasts/mentions" \
  --data-urlencode "entity_id=sam-altman" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```bash theme={"dark"}
# Only lines where Sam Altman appears as a guest.
curl --get "https://api.particle.pro/v1/podcasts/mentions" \
  --data-urlencode "entity_id=sam-altman" \
  --data-urlencode "role=guest" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```bash theme={"dark"}
# Mentions of OpenAI inside a single podcast.
curl --get "https://api.particle.pro/v1/podcasts/mentions" \
  --data-urlencode "company_id=openai" \
  --data-urlencode "podcast_id=all-in" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Response

```json theme={"dark"}
{
  "entity": {"id": "…", "slug": "sam-altman", "name": "Sam Altman"},
  "data": [
    {
      "episode": {
        "id": "…",
        "title": "…",
        "published_at": "2026-04-28T10:00:00Z",
        "podcast": {"id": "…", "title": "All-In"}
      },
      "mention_count": 8,
      "mention_variants": ["Sam Altman", "Altman"],
      "windows": [
        {
          "segment": {"id": "…", "type": "INTERVIEW", "title": "…"},
          "start_seconds": 942.0,
          "end_seconds": 988.5,
          "lines": [
            {"number": 137, "speaker": "Kara Swisher",   "role": "HOST",  "start_seconds": 942.0, "end_seconds": 948.2, "text": "…"},
            {"number": 138, "speaker": "Scott Galloway", "role": "HOST",  "start_seconds": 948.5, "end_seconds": 955.1, "text": "…", "is_mention": true},
            {"number": 139, "speaker": "Kara Swisher",   "role": "HOST",  "start_seconds": 955.5, "end_seconds": 988.5, "text": "…"}
          ]
        }
      ]
    }
  ],
  "has_more": true,
  "cursor": "s.AbCd…"
}
```

One episode = one item in `data`. `windows[]` is ordered by time within the episode. `mention_count` is the number of lines that triggered `is_mention=true`. `mention_variants` is the distinct strings observed for the entity (e.g., `["Sam Altman", "Altman"]`) — useful for UI labels.

If an episode mentions the entity more than 50 times, the page surfaces the first 50 windows and sets `truncated: true` on the episode. The next-page cursor still advances to a different episode — windows never split across pages.

## Filters

| Param             | Notes                                                         |
| ----------------- | ------------------------------------------------------------- |
| `entity_id`       | Slug or ID. Required when `company_id` is unset.              |
| `company_id`      | Slug, domain, or ID. Resolves to the company's linked entity. |
| `podcast_id`      | Restrict to mentions in one podcast.                          |
| `episode_id`      | Restrict to a single episode.                                 |
| `role`            | `guest`, `host`, `panelist`, `correspondent`, `mention`.      |
| `since` / `until` | Episode `published_at` window. ISO date.                      |
| `context_lines`   | 0–20, default 2. Lines of surrounding dialogue per window.    |

## Pagination

Standard `limit` (1–100, default 25) + opaque `cursor`. **The unit of pagination is the episode** — a single episode never splits across pages, so a page may return fewer total dialogue lines than another with the same limit. Pass the `cursor` from the previous response back as `?cursor=…` for the next page.

## Related

* [Search](/podcasts/search) — find dialogue by topic or phrase.
* [Transcripts → mentions in one episode](/podcasts/transcripts#transcript-mentions) — every entity mentioned in one episode (the inverse view).
* [Podcast → mentions rollup](/podcasts/overview#mentions-across-a-podcasts-episodes) — episode-level salience aggregated across one podcast.


# Podcasts
Source: https://docs.particle.pro/podcasts/overview

What's inside every episode — transcripts, speakers, segments, clips, sponsors, and bias.

Most podcast APIs give you metadata — titles, descriptions, RSS feeds. Particle API gives you what's *in* the audio. Every episode is transcribed and diarized, broken into structural segments (intros, ads, topic discussions, interviews), distilled into engagement-scored clips, and linked to a knowledge graph of speakers, entities, and topics. The shows themselves are scored for political bias with structured evidence.

## What you can build

* **Entity tracking** — Find every episode, segment, and dialogue line where a person or company is discussed.
* **Highlight reels** — Pull engagement-scored clips with ready-to-share `intro_statement` copy and direct MP3 URLs.
* **Sponsor analytics** — See which podcasts a competitor advertises on, who co-sponsors with whom, and host-read vs pre-recorded breakdowns.
* **Research tools** — Search transcripts with timestamps, exports as JSON or SRT, scoped by speaker or time range.
* **Bias analysis** — Audit a show's leaning with structured `transcript_evidence` and `web_research_evidence`.

## Resource hierarchy

```mermaid theme={"dark"}
graph TD
  Pub[Publisher] --> P[Podcast]
  P --> E[Episodes]
  P --> B[Bias]
  P --> Adv[Advertising summary]
  P --> M[Mentions]
  E --> T[Transcript]
  E --> Seg[Segments]
  E --> Cl[Clips]
  E --> Sp[Speakers]
  E --> En[Entities]
  E --> To[Topics]
  E --> TM[Transcript mentions]
  Seg --> SegT[Transcript]
  Cl --> ClT[Transcript]
```

Every resource is reachable both scoped to its parent (e.g., segments for a specific episode) and across the catalog (e.g., all segments matching a filter). Heavier endpoints — full transcripts, transcript mentions, cross-catalog segments and clip search, and advertising analytics — are priced higher per call than light metadata lookups; see [Concepts → Pricing weight](/concepts#pricing-weight).

<CardGroup>
  <Card title="Episodes" icon="play" href="/podcasts/episodes">
    Cross-podcast discovery, filtering, and per-episode sub-resources.
  </Card>

  <Card title="Transcripts" icon="closed-captioning" href="/podcasts/transcripts">
    Diarized dialogue, word-level timestamps, SRT export, and entity mentions in context.
  </Card>

  <Card title="Segments & clips" icon="scissors" href="/podcasts/segments-and-clips">
    AI-identified structural sections and engagement-scored highlight moments.
  </Card>

  <Card title="Advertising" icon="bullhorn" href="/podcasts/advertising">
    Sponsors, leaderboards, co-occurrence, and per-company ad presence.
  </Card>

  <Card title="External links" icon="link" href="/podcasts/external-links">
    Every directory, social profile, video channel, and website the podcast lives on — with resolved URLs and audience metrics.
  </Card>

  <Card title="Publishers" icon="building" href="/podcasts/publishers">
    Browse the organizations behind the catalog and pivot from a publisher to its full lineup of podcasts.
  </Card>
</CardGroup>

## Get a podcast

Resolve by slug or canonical ID:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/pivot" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch("https://api.particle.pro/v1/podcasts/pivot", {
    headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
  });
  const podcast = await res.json();
  ```
</CodeGroup>

```json Response (truncated) theme={"dark"}
{
  "id": "QpMz7GYKfSNuUa6zKXA4Q",
  "title": "Pivot",
  "slug": "pivot",
  "language": "en",
  "episode_count": 167,
  "bias": "LEANS_LEFT",
  "political_context": "US",
  "speakers": [
    { "name": "Kara Swisher", "role": "HOST", "occurrences": 164, "entity_slug": "kara-swisher" },
    { "name": "Scott Galloway", "role": "HOST", "occurrences": 136, "entity_slug": "scott-galloway" }
  ]
}
```

The `speakers` array is the recurring cast aggregated across episodes. Each `entity_slug` is a knowledge-graph handle you can pass to [entities endpoints](/knowledge-graph/entities) or to [`GET /v1/podcasts/episodes?entity_id=…`](/podcasts/episodes#list-episodes) to follow that speaker across the whole catalog.

## Bias analysis

Every podcast carries a quick `bias` enum (`LEANS_LEFT`, `LEANS_RIGHT`, `CENTER`, `MIXED`, `UNCLEAR`) on the podcast resource. The bias endpoint returns the underlying analysis: structured reasoning, transcript-level evidence, web-research evidence, and the sample episodes that drove the conclusion.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/pivot/bias" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

```json Response (truncated) theme={"dark"}
{
  "result": "LEANS_LEFT",
  "political_context": "US",
  "confidence": "MEDIUM",
  "reasoning": "…",
  "transcript_evidence": "…",
  "web_research_evidence": "…",
  "sample_episode_ids": ["…", "…"],
  "episodes_analyzed": 15,
  "evaluated_at": "2026-04-09T17:31:06Z"
}
```

Use the result for filtering or tagging; surface the `reasoning` and `transcript_evidence` fields when users want to know *why*.

## Mentions across a podcast's episodes

To find every episode of a single podcast where an entity comes up — without iterating episodes yourself — use the podcast-scoped mentions endpoint:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/pivot/mentions?entity_id=sam-altman&limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

```json Response (truncated) theme={"dark"}
{
  "data": [
    {
      "episode": {
        "id": "78cgekLUjCJBUZbj3s5K8Y",
        "title": "WHCD Shooting Aftermath, Musk and Altman Face-Off, Spirit Airlines Bailout",
        "published_at": "2026-04-28T10:00:00Z",
        "has_transcript": true,
        "segment_count": 21,
        "clip_count": 8
      },
      "salience": 0.003,
      "occurrences": 8
    }
  ],
  "has_more": true,
  "cursor": "…"
}
```

For the dialogue lines around each mention, drill into one episode with [transcript mentions](/podcasts/transcripts#transcript-mentions).

## Choosing the right endpoint

| I want to…                                                    | Use this                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find dialogue that *means* something — paraphrase-tolerant    | [`GET /v1/podcasts/search?semantic_search=…`](/podcasts/search)                                                                                           |
| Find dialogue containing exact tokens or phrases (BM25)       | [`GET /v1/podcasts/search?keyword_search=…`](/podcasts/search)                                                                                            |
| Find **every line about a person or company**                 | [`GET /v1/podcasts/mentions?entity_id=…`](/podcasts/mentions)                                                                                             |
| Combine: ranked dialogue scoped to a person or company        | [`GET /v1/podcasts/search?semantic_search=…&entity_id=…`](/podcasts/search)                                                                               |
| List every entity mentioned inside one episode                | [`GET /v1/podcasts/episodes/{id}/transcript/mentions`](/podcasts/transcripts#transcript-mentions)                                                         |
| Salience rollup of an entity across one podcast's episodes    | [`GET /v1/podcasts/{id}/mentions?entity_id=…`](#mentions-across-a-podcasts-episodes)                                                                      |
| Episode-level recall by entity (metadata only, no dialogue)   | [`GET /v1/podcasts/episodes?entity_id=…`](/podcasts/episodes)                                                                                             |
| Browse highlight clips ranked by engagement                   | [`GET /v1/podcasts/clips`](/podcasts/segments-and-clips) — for clips that match dialogue content, use `/v1/podcasts/search` and read them off the result. |
| Browse publishers, or list every podcast a publisher produces | [`GET /v1/podcasts/publishers`](/podcasts/publishers)                                                                                                     |

The split between **Search** and **Mentions** is deliberate: Search ranks dialogue by relevance to a query (similarity, BM25, or hybrid). Mentions returns episodes containing a named entity, ordered by recency, with every dialogue line where that name appears. Different shapes for genuinely different questions — see the [Search](/podcasts/search) and [Mentions](/podcasts/mentions) pages for full guidance.

## Related

* [Search](/podcasts/search) — find dialogue by topic or exact phrase (semantic, keyword, hybrid)
* [Mentions](/podcasts/mentions) — every line where a person or company is named
* [Episodes](/podcasts/episodes) — discovery, filtering, sub-resources
* [Transcripts](/podcasts/transcripts) — dialogue, words, mentions, SRT
* [Segments & clips](/podcasts/segments-and-clips) — structural breakdown and highlight moments
* [Advertising](/podcasts/advertising) — sponsor analytics
* [External links](/podcasts/external-links) — directories, social profiles, websites with resolved URLs and audience metrics
* [Publishers](/podcasts/publishers) — browse organizations and pivot from a publisher to its catalog


# Publishers
Source: https://docs.particle.pro/podcasts/publishers

Browse the organizations behind the podcasts — Goalhanger, iHeartPodcasts, BBC Radio 4 — and pivot from a publisher to its full catalog.

A **publisher** is the organization that produces and distributes a podcast — Goalhanger, iHeartPodcasts, BBC Radio 4, Wondery, NPR. The publisher endpoints let you browse the full set of publishers in the catalog, look one up by a stable slug, and pivot from a publisher to every podcast attributed to it.

The same publisher record also appears embedded as a `publisher` object on the podcast detail response (`GET /v1/podcasts/{id}`), so you usually don't need a separate lookup to display a podcast's publisher — these endpoints exist for browsing and reverse navigation.

Use these endpoints when you want to:

* Build a "browse by publisher" view of the catalog.
* Resolve a publisher slug from a URL into its podcasts.
* Rank publishers by catalog size, or list them alphabetically.
* Cross-reference a podcast's publisher with the rest of its catalog.

## Identifying a publisher

Every publisher endpoint that takes an `{id}` path parameter accepts either form:

* **Slug** (recommended): a stable, human-readable identifier — `goalhanger`, `iheartpodcasts`, `bbc-radio-4`. Slugs are populated for the vast majority of publishers and returned on every publisher response.
* **ID**: the base62-encoded publisher ID. Always works as a fallback for the small number of publishers whose name doesn't slugify (e.g. names that aren't representable as ASCII URL slugs).

Slugs and IDs are interchangeable in the URL — pick whichever you have.

## List publishers

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/publishers?sort=podcast_count&limit=10" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/publishers?sort=podcast_count&limit=10",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data, has_more, cursor } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/publishers",
      params={"sort": "podcast_count", "limit": 10},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  body = res.json()
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "0RZ7y1ABC",
      "slug": "iheartpodcasts",
      "name": "iHeartPodcasts",
      "podcast_count": 612
    },
    {
      "id": "0RZ7y1DEF",
      "slug": "wondery",
      "name": "Wondery",
      "podcast_count": 184
    },
    {
      "id": "0RZ7y1GHI",
      "slug": "bbc-radio-4",
      "name": "BBC Radio 4",
      "podcast_count": 142
    }
    // …
  ],
  "has_more": true,
  "cursor": "eyJvIjoxMH0="
}
```

### Query parameters

| Parameter | Default         | Description                                                                                   |
| --------- | --------------- | --------------------------------------------------------------------------------------------- |
| `sort`    | `podcast_count` | `podcast_count` ranks publishers by catalog size, largest first. `name` sorts alphabetically. |
| `limit`   | `25`            | Page size, 1–100.                                                                             |
| `cursor`  | —               | Opaque cursor from the previous response's `cursor` field.                                    |

## Get a publisher

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/publishers/goalhanger" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/publishers/goalhanger",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const publisher = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/publishers/goalhanger",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  publisher = res.json()
  ```
</CodeGroup>

```jsonc Response theme={"dark"}
{
  "id": "0RZ7y1XYZ",
  "slug": "goalhanger",
  "name": "Goalhanger",
  "podcast_count": 14
}
```

Returns 404 when no publisher matches the supplied slug or ID.

## List podcasts for a publisher

Pivot from a publisher to its full catalog, ordered by popularity:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/publishers/goalhanger/podcasts?limit=5" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/publishers/goalhanger/podcasts?limit=5",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data, has_more, cursor } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/publishers/goalhanger/podcasts",
      params={"limit": 5},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  body = res.json()
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "0RZ7y1AAA",
      "slug": "the-rest-is-history",
      "title": "The Rest Is History",
      "language": "en",
      // …other Podcast fields
    },
    {
      "id": "0RZ7y1BBB",
      "slug": "the-rest-is-politics",
      "title": "The Rest Is Politics",
      "language": "en"
      // …
    }
    // …
  ],
  "has_more": false
}
```

Returns 404 when no publisher matches the supplied slug or ID. The response contains the same `Podcast` objects returned by `GET /v1/podcasts` — see the [podcasts overview](/podcasts/overview) for the full field reference.

## Anatomy of a publisher

| Field           | Description                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `id`            | Stable base62-encoded publisher identifier. Always present.                                       |
| `slug`          | Human-readable identifier. Recommended in URLs. Omitted on publishers whose name doesn't slugify. |
| `name`          | Publisher's display name.                                                                         |
| `podcast_count` | Number of podcasts in the catalog attributed to this publisher.                                   |

The same publisher also appears in compact form (`id`, `slug`, `name` only) as the `publisher` field on the podcast detail response — you do not need a separate publisher lookup just to display a podcast's publisher in the UI.

## Choosing the right endpoint

| You want to…                                  | Use this                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Browse all publishers, ranked by catalog size | `GET /v1/podcasts/publishers?sort=podcast_count`                       |
| Browse all publishers alphabetically          | `GET /v1/podcasts/publishers?sort=name`                                |
| Resolve a publisher slug from a URL           | `GET /v1/podcasts/publishers/{slug}`                                   |
| List every podcast a publisher produces       | `GET /v1/podcasts/publishers/{id}/podcasts`                            |
| Get the publisher of a specific podcast       | The `publisher` field on [`GET /v1/podcasts/{id}`](/podcasts/overview) |

## Related

* [Podcasts overview](/podcasts/overview) — full Podcast object and other sub-resources.
* [Episodes](/podcasts/episodes) — drill from a podcast into its individual episodes.
* [External links](/podcasts/external-links) — third-party platform presences for a podcast.


# Rankings
Source: https://docs.particle.pro/podcasts/rankings

Browse the live Apple and Spotify podcast charts — top podcasts by country and category, per-podcast chart presence, historical snapshots, and trending movers.

The rankings endpoints expose podcast chart data captured daily from Apple Podcasts and Spotify. We refresh **roughly 1.7 million chart positions every day** across 170+ countries × 100+ categories × ranks 1–200, so the data you query is always the live snapshot — yesterday's charts are already historical and addressable through the history endpoints.

Every chart slot is identified by the same four-field vocabulary — **source**, **chart\_type**, **country**, **category\_slug** — and that vocabulary works the same way on every endpoint. Learn it once and you know the whole surface.

The simplest call needs no parameters at all:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/rankings" -H "X-API-Key: $PARTICLE_API_KEY"
```

returns the first page of the **US Apple Top Podcasts** chart, ordered by rank ascending. Charts run to rank 200; the default page size is 25 (raise it up to 100 with `limit`, or paginate with `cursor`).

Use these endpoints when you want to:

* Render a chart leaderboard for any country or category.
* See where a specific podcast currently ranks across every source/country/category.
* Track historical chart positions over time.
* Surface trending podcasts — chart debuts, departures, and the biggest rank movers.

## Identifying a chart slot

A "chart slot" is the unit of analysis: one (source × chart\_type × country × category) tuple, refreshed daily. Every browse and history endpoint accepts the same query parameters to pin or scope a slot:

| Parameter       | Default        | Description                                                                                                         |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `source`        | `apple`        | Ranking source platform: `apple` or `spotify`.                                                                      |
| `chart_type`    | `top_podcasts` | Chart variant within the source. Currently only `top_podcasts` is available.                                        |
| `country`       | `us`           | Lowercase ISO 3166-1 alpha-2 country code (e.g. `us`, `gb`, `jp`).                                                  |
| `category_slug` | —              | Category slug (e.g. `comedy`, `business`). Universal across sources. **Omit for the overall "Top Podcasts" chart.** |

Use the [discovery endpoints](#discovery-endpoints) to enumerate the available sources, countries, and categories.

## List rankings

The workhorse list endpoint. With no parameters it returns the US Apple Top Podcasts overall chart.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/rankings" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch("https://api.particle.pro/v1/podcasts/rankings", {
    headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
  });
  const { data, has_more, cursor } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/rankings",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  body = res.json()
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "0RZ7y1DAY01",
      "source": "apple",
      "chart_type": "top_podcasts",
      "country": "us",
      "rank": 1,
      "chart_total": 200,
      "captured_at": "2026-05-09T03:07:21Z",
      "is_current": true,
      "external_id": "1581410252",
      "external_url": "https://podcasts.apple.com/us/podcast/the-daily/id1581410252",
      "show": {
        "name": "The Daily",
        "publisher": "The New York Times",
        "language": "en-US",
        "image_url": "https://is1-ssl.mzstatic.com/.../600x600.jpg",
        "total_episodes": 1842,
        "genres": [{ "external_id": "1489", "name": "News" }]
      },
      "podcast": {
        "id": "0RZ7y1ABC",
        "slug": "the-daily",
        "title": "The Daily",
        "image_url": "https://cdn.particle.pro/podcasts/the-daily.jpg"
      }
    }
    // …25 entries (the default page size; charts run to rank 200, paginate with `cursor`)
  ],
  "has_more": true,
  "cursor": "r.AQAAAGQ"
}
```

Common shapes of the call:

| Goal                                 | Call                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| UK Apple Top Comedy                  | `GET /v1/podcasts/rankings?country=gb&category_slug=comedy` |
| US Spotify Top Podcasts              | `GET /v1/podcasts/rankings?source=spotify`                  |
| Just the top 10 of any chart         | `GET /v1/podcasts/rankings?max_rank=10`                     |
| Ranks 11–20 of a chart               | `GET /v1/podcasts/rankings?min_rank=11&max_rank=20`         |
| Where does a specific podcast chart? | `GET /v1/podcasts/rankings?podcast_id=the-daily`            |
| Where does it chart in the UK?       | `GET /v1/podcasts/rankings?podcast_id=the-daily&country=gb` |

### Query parameters

| Parameter       | Default        | Description                                                                                   |
| --------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `source`        | `apple`        | Source platform.                                                                              |
| `chart_type`    | `top_podcasts` | Chart variant.                                                                                |
| `country`       | `us`           | Country code.                                                                                 |
| `category_slug` | —              | Category slug. Omit for the overall chart.                                                    |
| `podcast_id`    | —              | Slug or ID. Restricts results to one podcast (and skips the implicit "overall only" default). |
| `min_rank`      | —              | Optional inclusive rank floor (1–500).                                                        |
| `max_rank`      | —              | Optional inclusive rank ceiling (1–500).                                                      |
| `limit`         | `25`           | Page size, 1–100.                                                                             |
| `cursor`        | —              | Opaque cursor from the previous response.                                                     |

### About the linked podcast

We track tens of thousands of the highest-ranked podcasts in the catalog — every show that consistently charts is in there, with full transcripts, sponsors, mentions, and the rest of the Particle Pro surface. Those rows carry a `podcast` field that links straight into the catalog (`GET /v1/podcasts/{slug}` and friends). For the long tail of intermittent or hyper-local entries — chart slots in 170+ countries surface a lot of one-day wonders — `podcast` is omitted and the response still carries a complete `show` block with name, publisher, artwork, and feed URL. Treat `show` as the canonical identity for every row and use `podcast` to cross-link into the catalog whenever it's present.

## List current rankings for a podcast

Returns every live chart slot a podcast appears on, across sources and countries. Rows are clustered by (source, country, category) — overall charts come before sub-categories within each (source, country) group — so iterating the response naturally walks the podcast's footprint without re-sorting.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/the-daily/rankings" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/the-daily/rankings",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    { "source": "apple",   "country": "us", "category": null,                              "rank": 1,  "captured_at": "2026-05-09T03:07:21Z", /* … */ },
    { "source": "apple",   "country": "us", "category": { "slug": "news", "name": "News", "external_id": "1489" }, "rank": 1,  /* … */ },
    { "source": "apple",   "country": "gb", "category": null,                              "rank": 4,  /* … */ },
    { "source": "spotify", "country": "us", "category": null,                              "rank": 5,  /* … */ }
    // …more chart slots
  ],
  "has_more": false
}
```

Returns 404 when the podcast can't be resolved by slug or ID. Pagination is opt-in via `limit` and `cursor`; by default every chart slot the podcast occupies is returned in one response (typically dozens, occasionally a few hundred for very popular shows charting in many countries).

## Summarize a podcast's chart presence

A one-call aggregate: how many distinct chart slots, sources, countries, and categories the podcast is on right now, plus its single best (lowest-numbered) rank.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/the-daily/rankings/summary" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

```jsonc Response theme={"dark"}
{
  "podcast": {
    "id": "0RZ7y1ABC",
    "slug": "the-daily",
    "title": "The Daily"
  },
  "chart_count": 47,
  "source_count": 2,
  "country_count": 18,
  "category_count": 4,
  "best_rank": {
    "source": "apple",
    "chart_type": "top_podcasts",
    "country": "us",
    "rank": 1,
    "captured_at": "2026-05-09T03:07:21Z"
  },
  "appearances_by_source": [
    { "source": "apple",   "chart_count": 35, "best_rank": 1, "best_country": "us", "best_category_slug": "" },
    { "source": "spotify", "chart_count": 12, "best_rank": 4, "best_country": "us", "best_category_slug": "" }
  ]
}
```

When multiple chart placements tie at the same rank, `best_rank` (and each `appearances_by_source[*].best_*`) prefers the higher-priority market — `us > gb > ca > au > de > fr > es > it > mx > br > jp > ie > nl > se > nz`, then alphabetical. A US #1 always wins over a tied #1 in a smaller market. Within a country, the overall chart wins over a sub-category placement.

## Discovery endpoints

These let you enumerate which sources, countries, and categories actually have data right now — without paginating through millions of rows.

### List sources

`GET /v1/podcasts/rankings/sources` returns each `(source, chart_type)` pair currently available, with row counts and freshness:

```jsonc theme={"dark"}
{
  "data": [
    { "source": "apple",   "chart_type": "top_podcasts", "current_row_count": 1737573, "latest_captured_at": "2026-05-09T03:07:21Z" },
    { "source": "spotify", "chart_type": "top_podcasts", "current_row_count": 11100,   "latest_captured_at": "2026-05-09T06:14:56Z" }
  ],
  "has_more": false
}
```

### List countries

`GET /v1/podcasts/rankings/countries` returns every country with current data. Each entry carries the human-readable name (when known) and the count of distinct chart slots.

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/rankings/countries?source=apple" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc theme={"dark"}
{
  "data": [
    { "code": "us", "name": "United States",  "current_chart_count": 18, "sources": ["apple", "spotify"] },
    { "code": "gb", "name": "United Kingdom", "current_chart_count": 17, "sources": ["apple"] }
    // …
  ],
  "has_more": false
}
```

### List categories

`GET /v1/podcasts/rankings/categories` returns every category currently represented. For Apple sub-categories the response includes `parent_slug` so you can render the hierarchy.

```jsonc theme={"dark"}
{
  "data": [
    { "slug": "society-culture",   "name": "Society & Culture",        "external_id": "1324", "current_chart_count": 172, "sources": ["apple"] },
    { "slug": "self-improvement",  "name": "Self-Improvement",         "external_id": "1500", "parent_slug": "education", "current_chart_count": 172, "sources": ["apple"] },
    { "slug": "comedy",            "name": "Comedy",                   "external_id": "1303", "current_chart_count": 198, "sources": ["apple", "spotify"] }
    // …
  ],
  "has_more": false
}
```

`external_id` is the source-native category id. When a category is reported by multiple sources (Apple's iTunes genre id "1303" and Spotify's slug-as-id "comedy" both map to `comedy`), the response prefers Apple's id; pin a single source via `?source=spotify` if you need the Spotify-native form. `category_slug` is the universal handle and works as a filter on every endpoint regardless of source.

## History

History endpoints reach beyond the live snapshot to surface chart positions over time.

### Chart slot history

Returns historical snapshots for a chart slot, ordered most-recent first. Combine with `since` / `until` to bound the range.

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/rankings/history?country=us&since=2026-04-01" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

Each row in the response is a `PodcastRanking` object — the same shape as the list endpoint, just with older `captured_at` values. Pin `podcast_id` to filter to a single podcast within the slot.

### Per-podcast history

Returns the full historical chart record for a single podcast, optionally narrowed by chart slot or date range.

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/the-daily/rankings/history?country=us&since=2026-01-01" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

When `category_slug` is set on this endpoint, `source` must also be set (returns 422 otherwise) — category slugs aren't unique across sources at the wire level, so a Spotify "comedy" filter would otherwise silently exclude Apple matches and vice versa.

## Movers

`GET /v1/podcasts/rankings/movers` returns the chart entries whose rank changed between the live snapshot and a comparison snapshot `window_days` ago. Use it to surface trending movement, new arrivals, and departures — all from one endpoint.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/rankings/movers?country=us&window_days=1" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/rankings/movers?country=us&window_days=1",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "source": "apple",
      "chart_type": "top_podcasts",
      "country": "us",
      "rank": 4,
      "show": { "name": "Smartless", "publisher": "Wondery" },
      "change": "up",
      "delta": 9,                                  // rose from #13 to #4
      "previous_snapshot": { "rank": 13, /* full PodcastRanking shape — same fields as the row above, omitted for brevity */ }
    },
    {
      "source": "apple",
      "country": "us",
      "rank": 7,
      "show": { "name": "New Show", "publisher": "Indie" },
      "change": "new"                              // chart debut
    },
    {
      "source": "apple",
      "country": "us",
      "rank": 200,                                 // last seen rank
      "show": { "name": "Stale Show", "publisher": "…" },
      "change": "exit"                             // fell off the chart
    }
  ]
}
```

The `change` filter narrows to a single change type:

| `change`        | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| `all` (default) | Every change type below. Stable rows are always excluded.         |
| `up`            | Entries whose rank improved (lower number).                       |
| `down`          | Entries whose rank dropped.                                       |
| `new`           | Entries that appeared on the chart since the comparison snapshot. |
| `exit`          | Entries that fell off the chart.                                  |

### Query parameters

| Parameter                                          | Default                          | Description                                                                                                                           |
| -------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `source`, `chart_type`, `country`, `category_slug` | `apple`, `top_podcasts`, `us`, — | Standard chart-slot filters.                                                                                                          |
| `window_days`                                      | `1`                              | Comparison window in days, 1–30. The comparison snapshot is the most recent retired snapshot closest in time to (now − window\_days). |
| `change`                                           | `all`                            | Change-type filter.                                                                                                                   |
| `limit`                                            | `25`                             | Maximum movers to return, 1–100.                                                                                                      |

## Anatomy of a ranking row

| Field               | Description                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                | Stable identifier for this specific snapshot of this entry.                                     |
| `source`            | `apple` or `spotify`.                                                                           |
| `chart_type`        | `top_podcasts`.                                                                                 |
| `country`           | Lowercase ISO 3166-1 alpha-2 code.                                                              |
| `category`          | `{slug, name, external_id, parent_slug}` or null for the overall chart.                         |
| `rank`              | 1-based position.                                                                               |
| `previous_rank`     | Source-reported prior rank when the source provides it. Apple does not currently populate this. |
| `growth_indicator`  | Source-supplied trend hint (e.g. `up`, `down`).                                                 |
| `chart_total`       | Length of the chart at this snapshot (typically 200).                                           |
| `captured_at`       | When we captured the snapshot (UTC). Stable for every row in the same snapshot.                 |
| `source_updated_at` | Timestamp the source itself reported for the chart, when present.                               |
| `external_id`       | Source-native chart entry id. Stable across captures.                                           |
| `external_url`      | Canonical URL on the source platform.                                                           |
| `show`              | Show metadata captured with the entry. **Always present**, even when `podcast` is absent.       |
| `podcast`           | Compact podcast object when matched in our catalog; absent otherwise.                           |

## Choosing the right endpoint

| You want to…                            | Use this                                         |
| --------------------------------------- | ------------------------------------------------ |
| The current US Apple Top Podcasts       | `GET /v1/podcasts/rankings`                      |
| Top podcasts in another country         | `GET /v1/podcasts/rankings?country=gb`           |
| Top podcasts in a category              | `GET /v1/podcasts/rankings?category_slug=comedy` |
| Where one podcast charts right now      | `GET /v1/podcasts/{id}/rankings`                 |
| One-call podcast popularity card        | `GET /v1/podcasts/{id}/rankings/summary`         |
| What sources/countries/categories exist | The three discovery endpoints                    |
| Historical snapshots of a chart         | `GET /v1/podcasts/rankings/history`              |
| Historical rank of a podcast            | `GET /v1/podcasts/{id}/rankings/history`         |
| Trending movers / debuts / departures   | `GET /v1/podcasts/rankings/movers`               |

## Related

* [Podcasts overview](/podcasts/overview) — full Podcast object.
* [Publishers](/podcasts/publishers) — pivot from a chart entry's publisher to its catalog.
* [Episodes](/podcasts/episodes) — drill from a charting podcast into its episodes.


# Search
Source: https://docs.particle.pro/podcasts/search

Search the podcast catalog by what is said in episodes — by meaning, by exact phrase, or both. For 'every line about a person or company', see Mentions.

`GET /v1/podcasts/search` finds dialogue inside podcast episodes. Each result is a segment of an episode, returned with bounded transcript windows centered on the highest-relevance dialogue lines (flagged `is_match: true`) and any highlight clips that overlap the segment.

<Note>Available to MCP agents as [`podcasts/search_dialogue`](/mcp/tools/podcasts/search-dialogue).</Note>

## When to use Search vs Mentions

The Particle podcast surface ships two complementary search endpoints. Pick by what you're really asking.

| You want…                                             | Use this                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Dialogue that *means* something — paraphrase tolerant | [`/v1/podcasts/search?semantic_search=…`](/podcasts/search) |
| Dialogue containing exact tokens or phrases (BM25)    | [`/v1/podcasts/search?keyword_search=…`](/podcasts/search)  |
| Both: ideas plus required terms                       | `/v1/podcasts/search?semantic_search=…&keyword_search=…`    |
| **Every line where a person or company is mentioned** | [`/v1/podcasts/mentions?entity_id=…`](/podcasts/mentions)   |
| Conceptual search scoped to a person/company          | `/v1/podcasts/search?semantic_search=…&entity_id=…`         |

Search ranks segments by relevance. Mentions returns episodes with all of their mention windows in time order. Different shapes, different jobs.

## `semantic_search` — search by meaning

Vector search is the right tool when the surface words in dialogue might not match the surface words in your query. Two speakers can discuss the same idea using totally different vocabulary, and a lexical engine misses both. Express your query the way you'd describe the topic to a colleague — full sentences are welcome.

```bash theme={"dark"}
curl --get "https://api.particle.pro/v1/podcasts/search" \
  --data-urlencode "semantic_search=hosts arguing about whether the Fed is staying too hawkish given how much core inflation has cooled" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

The above will surface segments that talk about *restrictive monetary policy*, *the FOMC's bias*, *PCE moderation*, or *real rates being too high* — even when the words "hawkish" or "Fed" never appear.

What `semantic_search` is **not** good at:

| Don't ask it…                                                                                                                                                                | Use this instead                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| "Every line about Sam Altman" — that's an entity question, not a content question.                                                                                           | [`/v1/podcasts/mentions?entity_id=sam-altman`](/podcasts/mentions)            |
| "Podcasts where Sam Altman is a guest" — structural metadata about an episode, not its dialogue.                                                                             | [`/v1/podcasts/mentions?entity_id=sam-altman&role=guest`](/podcasts/mentions) |
| `"OpenAI Q*"` — when a specific token must appear verbatim, BM25 is more reliable than vector similarity.                                                                    | `keyword_search=OpenAI Q*`                                                    |
| `"AGI AND not safety"` — boolean logic isn't supported. Express the underlying intent in natural language; combine with `keyword_search` if a literal term must also appear. | `semantic_search=…&keyword_search=…`                                          |

## `keyword_search` — search by exact tokens (BM25)

Use this when the exact form of a token matters: company tickers, drug names, model numbers, hashtags. Tokens are matched after the same normalization the index applies (lowercased, English tokenizer, no stemming). Multi-word queries are matched as a bag of tokens, ranked by BM25.

```bash theme={"dark"}
curl --get "https://api.particle.pro/v1/podcasts/search" \
  --data-urlencode "keyword_search=GLP-1" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Hybrid: `semantic_search` + `keyword_search`

When you want segments that *express an idea* **and** *contain a specific term*, send both. Results are produced by running each leg independently and fusing them via reciprocal rank fusion.

```bash theme={"dark"}
curl --get "https://api.particle.pro/v1/podcasts/search" \
  --data-urlencode "semantic_search=existential concerns about AI systems acting outside human control" \
  --data-urlencode "keyword_search=alignment" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Scoping a ranked search to an entity

`entity_id` and `company_id` here are *filters* — they narrow ranked candidates to episodes featuring the resolved entity. The ranking still comes from `semantic_search` / `keyword_search`. To read every line about an entity, use [Mentions](/podcasts/mentions) instead.

```bash theme={"dark"}
curl --get "https://api.particle.pro/v1/podcasts/search" \
  --data-urlencode "semantic_search=AGI timelines and what plausible paths to it look like" \
  --data-urlencode "entity_id=sam-altman" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Response

```json theme={"dark"}
{
  "data": [
    {
      "episode": {
        "id": "…",
        "title": "…",
        "published_at": "2026-…",
        "podcast": {"id": "…", "title": "All-In"}
      },
      "segment": {
        "id": "…",
        "type": "TOPIC_DISCUSSION",
        "title": "…",
        "start_seconds": 1284,
        "end_seconds": 1620
      },
      "windows": [
        {
          "start_seconds": 1305,
          "end_seconds": 1318,
          "lines": [
            {"number": 217, "speaker": "Chamath Palihapitiya", "role": "HOST", "start_seconds": 1305, "end_seconds": 1310, "text": "…"},
            {"number": 218, "speaker": "Jason Calacanis",     "role": "HOST", "start_seconds": 1310, "end_seconds": 1314, "text": "…", "is_match": true},
            {"number": 219, "speaker": "Chamath Palihapitiya", "role": "HOST", "start_seconds": 1314, "end_seconds": 1318, "text": "…"}
          ]
        }
      ],
      "clips": [
        {"id": "…", "title": "…", "engagement_score": 78, "start_seconds": 1310.5, "end_seconds": 1382.2}
      ],
      "match": {"source": "semantic", "relevance_score": 0.82}
    }
  ],
  "has_more": true,
  "cursor": "r.AbCd…",
  "entity": {"id": "…", "slug": "sam-altman", "name": "Sam Altman"}
}
```

`windows` is bounded — never the whole segment. Each window centers on one or more high-relevance lines (flagged `is_match: true`) padded with surrounding context. A single segment can produce multiple non-overlapping windows when the top-scored lines are far apart inside it. When the line-scoring path can't pinpoint a match (e.g., a degraded embedding service or no individual line scored above zero), the window falls back to the segment's opening lines and is flagged `is_preview: true`.

`match.source` is `semantic`, `keyword`, or `hybrid` — branch on it when rendering. `clips` is omitted when no highlight clip overlaps the segment. The page-level `entity` block appears when an `entity_id` or `company_id` filter was provided **and resolved successfully**; if the reference can't be resolved the response comes back with an empty `data` array and `entity` omitted.

## Filters

| Param                      | Notes                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `podcast_id`               | Slug or ID.                                                                                    |
| `episode_id`               | Restrict to a single episode.                                                                  |
| `entity_id` / `company_id` | Filter (not the primary query). For "every line about X" use [Mentions](/podcasts/mentions).   |
| `role`                     | `guest`, `host`, `panelist`, `correspondent`, `mention`. Requires `entity_id` or `company_id`. |
| `type`                     | Segment type filter (e.g. `INTERVIEW`).                                                        |
| `since` / `until`          | Episode `published_at` window. ISO date.                                                       |
| `sort`                     | `relevance` (default) or `recency`.                                                            |

## Pagination

Standard `limit` (1–100, default 25) + opaque `cursor`. Pass the `cursor` from the previous response back as `?cursor=…` to fetch the next page. Cursors are opaque — don't parse them.

## Related

* [Mentions](/podcasts/mentions) — every line where a person or company is mentioned, episode-grouped.
* [Transcripts → mentions in one episode](/podcasts/transcripts#transcript-mentions) — every entity mentioned in a single episode.
* [Episodes](/podcasts/episodes) — episode-level recall when you don't need dialogue.


# Segments & clips
Source: https://docs.particle.pro/podcasts/segments-and-clips

AI-identified structural sections of every episode and engagement-scored highlight clips.

Two related but distinct breakdowns of every episode:

* **Segments** are *structural* — contiguous sections classified by purpose (intro, ad, topic discussion, interview, transition). They cover 100% of the episode timeline and answer "what's happening, when?"
* **Clips** are *highlight-driven* — short standalone moments scored for engagement and tagged with a type (`INSIGHTFUL`, `FUNNY`, `CONTROVERSIAL`, `AHA_MOMENT`, …). Typically a handful per episode. They answer "what's worth sharing?"

<Note>Clips are available to MCP agents as [`podcasts/list_clips`](/mcp/tools/podcasts/list-clips). Segments are bundled into [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode) (set `include_full_segments=true`).</Note>

## Segments

### Segment types

| Type               | What it captures                                      |
| ------------------ | ----------------------------------------------------- |
| `INTRO`            | Opening of the episode                                |
| `OUTRO`            | Closing                                               |
| `TOPIC_DISCUSSION` | In-depth discussion of a specific subject             |
| `INTERVIEW`        | Question-and-answer with a guest                      |
| `PERSONAL_BANTER`  | Off-topic or personal conversation                    |
| `TRANSITION`       | Bridge between segments                               |
| `AD`               | Advertisement, sponsorship, or cross-promotional read |

### Segments for an episode

In chronological order, this is the structural outline of the episode.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/segments" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    { "number": 1, "type": "AD",               "title": "Sponsor: The Build Podcast",                        "start_seconds": 0.56,    "end_seconds": 28.94    },
    { "number": 4, "type": "INTRO",            "title": "Show Open and Banter",                              "start_seconds": 102.94,  "end_seconds": 242.4    },
    { "number": 5, "type": "TOPIC_DISCUSSION", "title": "WH Correspondents Dinner Shooting and Media Coverage", "start_seconds": 242.46,  "end_seconds": 1233.69 },
    { "number": 9, "type": "TOPIC_DISCUSSION", "title": "Musk v. Altman Trial and AI Industry Moves",         "start_seconds": 1435.49, "end_seconds": 2228.04 },
    { "number": 21, "type": "OUTRO",           "title": "Show Close and Credits",                             "start_seconds": 4448.06, "end_seconds": 4502.34 }
    // 21 segments returned; abbreviated for readability
  ],
  "has_more": false,
  "cursor": null
}
```

Each segment has its own [transcript endpoint](/podcasts/transcripts#segment-and-clip-transcripts) and an audio URL with the extracted MP3. To filter by type server-side (for example, to skip ads), use the cross-catalog endpoint with an episode filter: `GET /v1/podcasts/segments?episode_id={id}&type=AD`.

### Cross-episode segment lookup

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/segments?type=INTERVIEW&limit=10" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

At least one of `episode_id`, `podcast_id`, or `type` is required — the endpoint does not return a global feed. Combine filters to narrow further (e.g., `?podcast_id=all-in&type=INTERVIEW`).

## Clips

Clips are the highlight moments — the parts of an episode worth pulling out for sharing, embedding, or social posts. Each is AI-extracted, scored for engagement, and tagged with a type.

### Clip types

| Category            | Types                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Takes & opinions    | `SPICY`, `CONTROVERSIAL`, `DEBATE_DISAGREEMENT`                           |
| Emotion             | `FUNNY`, `EMOTIONAL`, `SHOCKING`                                          |
| Insight & knowledge | `INSIGHTFUL`, `INFORMATIVE`, `EDUCATIONAL`, `PHILOSOPHICAL`, `AHA_MOMENT` |
| Highlights          | `NOTABLE_LINE`, `BEST_STORY`                                              |

### Clips for an episode

Returned ranked by engagement score (highest first):

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/clips?limit=2" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "7ULKq1QRmEKqICZJKa6orv",
      "type": "INSIGHTFUL",
      "title": "Targets, fame, and gun access",
      "intro_statement": "First, what truly drives these attacks?",
      "engagement_score": 84,
      "start_seconds": 356.3,
      "end_seconds": 414.96,
      "duration_seconds": 58.66,
      "audio_url": "https://cdn.particle.pro/podcast/episode/…/clip/audio/….mp3",
      "speaker": {
        "name": "Scott Galloway",
        "role": "HOST",
        "entity_slug": "scott-galloway"
      },
      "segment": {
        "id": "68yiT3ivEGRsDjMgWjO9rT",
        "type": "TOPIC_DISCUSSION",
        "title": "WH Correspondents Dinner Shooting and Media Coverage"
      }
    }
    // …
  ]
}
```

Each clip carries:

* `audio_url` — direct MP3 of the clip; embed it without slicing yourself
* `intro_statement` — ready-to-use share copy
* `engagement_score` — integer 0–100. Higher is more shareable; values above 70 are typical for a strong clip.
* `speaker` — who's speaking, with a knowledge-graph link
* `segment` — which structural section the clip came from

### Discovering clips by what's discussed

Highlight clips are returned alongside their parent segment by `GET /v1/podcasts/search`. Whenever a clip's time range overlaps the matching segment, it appears in the result's `clips` array.

<CodeGroup>
  ```bash curl theme={"dark"}
  # Search the dialogue by meaning; clips on a matching segment come along.
  curl --get "https://api.particle.pro/v1/podcasts/search" \
    --data-urlencode "semantic_search=panel debating whether superintelligent AI will be controllable" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```bash curl theme={"dark"}
  # Every line about a person inside a single podcast — use /mentions for
  # entity-mention search; /search rejects requests without semantic_search
  # or keyword_search.
  curl --get "https://api.particle.pro/v1/podcasts/mentions" \
    --data-urlencode "entity_id=sam-altman" \
    --data-urlencode "podcast_id=pivot" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

See the [search docs](/podcasts/search) for ranked dialogue search, and the [mentions docs](/podcasts/mentions) for entity-mention search.

<Note>
  `GET /v1/podcasts/clips` (above) is for *browsing* highlight clips ranked by engagement. For *text-based* discovery — by topic or keyword — use [`/v1/podcasts/search`](/podcasts/search) (clips on matching segments come along). For entity-mention discovery, use [`/v1/podcasts/mentions`](/podcasts/mentions).
</Note>

## Embeds

Public clip embed endpoints (no API key required) return shareable JSON suitable for iframe-style players:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/embed/clips/7ULKq1QRmEKqICZJKa6orv"
```

The embed payload includes the clip title, intro statement, audio URL, podcast artwork, and duration — everything you need for a thumbnail player.

## Related

* [Transcripts](/podcasts/transcripts) — fetch dialogue scoped to a segment or clip
* [Episodes](/podcasts/episodes) — list and filter episodes
* [Concepts](/concepts) — pagination, slugs, pricing weight


# Brand Suitability
Source: https://docs.particle.pro/podcasts/suitability

Industry-standard content risk and advertiser-fit assessment for podcasts: per-category prevalence and treatment, evidence excerpts, and a deterministic trend across analyses.

Particle API assesses every well-classified podcast against the 12 categories from the [IAB Tech Lab Content Taxonomy 3.x Brand Safety & Suitability Framework](https://iabtechlab.com/standards/content-taxonomy/) — the industry-standard taxonomy that advertisers, agencies, DSPs, and ad-verification vendors (IAS, DoubleVerify, Spotify, Hive, Sounder, Barometer) train against. The framework was originally published by GARM (Global Alliance for Responsible Media) in 2022; IAB Tech Lab assumed stewardship after GARM was discontinued in 2024 and continues to publish and version it. Each assessment covers a contiguous, non-overlapping window of recent episodes, refreshed on a risk-tiered cadence.

<Note>Available to MCP agents through [`podcasts/resolve_podcast`](/mcp/tools/podcasts/resolve-podcast): every result carries the high-level `suitability_tier` enum unconditionally, and passing `include: ["suitability"]` attaches the per-category breakdown alongside the podcast.</Note>

## What the assessment gives you

A buy-or-skip decision needs more than a flat 0–1 risk score per category. A true-crime documentary about Bundy is heavy on crime content but advertiser-friendly; a host endorsing violent vigilantism is light on crime content but advertiser-toxic. The Particle assessment captures that distinction along five dimensions:

* **Per-category prevalence** — `NONE`, `INCIDENTAL`, `OCCASIONAL`, `FREQUENT`, `PERVASIVE`. How often the category appears across the analyzed window.
* **Per-category treatment** — `ABSENT`, `DOCUMENTARY`, `EDITORIAL`, `PROMOTIONAL`, `GLAMORIZING`. How the content is framed when it appears. Treatment is the entire reason a news show covering terrorism stays advertiser-friendly while a podcast endorsing it does not.
* **Per-category risk level** — derived deterministically from `(prevalence, treatment, code)`. `NONE`, `LOW`, `MEDIUM`, `HIGH`, or `FLOOR` (violates the Brand Safety Floor).
* **Per-category evidence** — every category with prevalence above `NONE` carries one or more cited episode excerpts so you can audit the verdict and defend planner decisions to clients.
* **Methodology transparency** — sample size, confidence, and the time window of episodes that produced the verdict, all on every response.

## Tiers

The overall verdict maps to the framework's four risk levels:

| Tier        | Framework risk level | Advertiser fit                                                                       |
| ----------- | -------------------- | ------------------------------------------------------------------------------------ |
| `SAFE`      | Low Risk             | Suitable for all advertisers, including kid-directed and family brands.              |
| `LIMITED`   | Medium Risk          | Suitable for most advertisers; family brands may apply caution.                      |
| `SENSITIVE` | High Risk            | Many brands skip; suitable for general-audience and adult-product advertisers.       |
| `UNSAFE`    | Brand Safety Floor   | No monetization — content violates the Brand Safety Floor for at least one category. |

## Categories

All 12 brand-safety categories are evaluated on every assessment, even when prevalence is `NONE`, so the response records that the category was actively considered.

| Code                             | Description                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `adult_sexual`                   | Adult or sexually explicit content.                                                                                        |
| `arms_ammunition`                | Arms, ammunition, and weapon-related content.                                                                              |
| `crime_harmful_acts`             | Crime, harmful acts to individuals, and human-rights violations.                                                           |
| `death_injury_military_conflict` | Death, injury, or military conflict.                                                                                       |
| `online_piracy`                  | Online piracy and copyright infringement.                                                                                  |
| `hate_speech_aggression`         | Hate speech and acts of aggression directed at protected groups.                                                           |
| `obscenity_profanity`            | Obscenity and profanity, including gestures.                                                                               |
| `illegal_drugs_alcohol_tobacco`  | Illegal drugs, tobacco, e-cigarettes, vaping, or alcohol.                                                                  |
| `spam_harmful`                   | Spam or harmful content (malware, phishing, scams).                                                                        |
| `terrorism`                      | Terrorism, including its promotion or glorification.                                                                       |
| `debated_social_issues`          | Debated sensitive social issues with insensitive or harmful treatment.                                                     |
| `misinformation`                 | Factually incorrect or deliberately misleading content presented as fact (added in the September 2023 framework revision). |

## Get a podcast's suitability

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/the-jane-doe-show/suitability" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/the-jane-doe-show/suitability",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const assessment = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/the-jane-doe-show/suitability",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  assessment = res.json()
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "overall_tier": "LIMITED",
  "confidence": "HIGH",
  "summary": "True-crime show with documentary treatment of historical American cases. No glorification; sponsor base is mainstream consumer brands.",
  "methodology": "Reviewed segments for 12 episodes from a 6-month window; read full transcripts for 5. Cross-checked sponsors for drug- and predatory-finance categories.",
  "episodes_analyzed": 25,
  "sample_window_start_at": "2025-11-04T00:00:00Z",
  "sample_window_end_at":   "2026-04-29T00:00:00Z",
  "evaluated_at": "2026-05-02T18:14:21Z",
  "categories": [
    {
      "code": "crime_harmful_acts",
      "description": "Crime, harmful acts to individuals, and human-rights violations.",
      "prevalence": "FREQUENT",
      "treatment": "DOCUMENTARY",
      "risk_level": "MEDIUM",
      "reasoning": "Hosts narrate established cases without endorsement, citing primary sources and court records.",
      "evidence": [
        {
          "episode_id": "78cgekLUjCJBUZbj3s5K8Y",
          "episode_title": "The Jane Doe Case",
          "episode_slug": "the-jane-doe-case",
          "excerpt": "We're going to walk through the timeline based on the trial transcripts..."
        }
      ]
    },
    {
      "code": "obscenity_profanity",
      "description": "Obscenity and profanity, including gestures.",
      "prevalence": "OCCASIONAL",
      "treatment": "EDITORIAL",
      "risk_level": "LOW",
      "reasoning": "Profanity used for emphasis, never directed at protected groups.",
      "evidence": [/* … */]
    }
    // 10 more entries — every brand-safety category appears, even when prevalence=NONE.
  ]
}
```

## Optional sections

Pass `include=trend`, `include=history`, or `include=trend,history` to expand the response.

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/the-jane-doe-show/suitability?include=trend,history" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

`trend` is computed deterministically from the diff between the two most recent assessments — the agent never compares across windows. Each analysis covers a contiguous, non-overlapping window of episodes, so the comparison is genuinely "what was true in the prior window vs. what's true now."

```jsonc Response (truncated) theme={"dark"}
{
  "overall_tier": "LIMITED",
  // ... main body unchanged ...
  "trend": {
    "direction": "STABLE",
    "prior_evaluated_at": "2025-11-12T03:55:08Z",
    "changed_categories": [
      {
        "code": "obscenity_profanity",
        "prior_prevalence": "INCIDENTAL",
        "new_prevalence":   "OCCASIONAL",
        "prior_treatment":  "EDITORIAL",
        "new_treatment":    "EDITORIAL",
        "prior_risk_level": "LOW",
        "new_risk_level":   "LOW"
      }
    ]
  },
  "history": [
    {
      "overall_tier": "LIMITED",
      "confidence": "HIGH",
      "episodes_analyzed": 25,
      "sample_window_start_at": "2025-05-01T00:00:00Z",
      "sample_window_end_at":   "2025-11-04T00:00:00Z",
      "evaluated_at": "2025-11-12T03:55:08Z"
    }
    // …
  ]
}
```

`direction` is one of `STABLE`, `IMPROVING`, `DECLINING`, or `INSUFFICIENT_HISTORY` (when fewer than two assessments exist).

## Filter the catalog by tier

`GET /v1/podcasts` accepts a `suitability_tier` query parameter. Returns only podcasts whose most recent assessment landed at that tier — useful for buyer-side catalog scans:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts?suitability_tier=SAFE&limit=20" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

The high-level `suitability_tier` enum is also surfaced on every podcast object in list and detail responses; the per-category breakdown, evidence, and methodology are gated to the dedicated suitability endpoint.

## Refresh cadence

Each assessment covers a contiguous, non-overlapping window of recent episodes — the most-recent \~25, scoped above the prior assessment's window so no episode is ever re-analyzed across runs. Refresh thresholds depend on the prior tier:

| Prior tier  | Re-evaluates after this many new episodes | Max wall-clock staleness |
| ----------- | ----------------------------------------- | ------------------------ |
| `SAFE`      | 25 new episodes since last window         | 24 months                |
| `LIMITED`   | 20 new episodes                           | 24 months                |
| `SENSITIVE` | 15 new episodes                           | 12 months                |
| `UNSAFE`    | 10 new episodes                           | 9 months                 |

A daily show producing \~30 episodes per month therefore refreshes roughly monthly when SAFE and weekly when UNSAFE. A weekly show refreshes roughly every 5–6 months when SAFE.

## Limitations

* **Minimum coverage.** A first assessment requires at least 5 episodes with classified topics. Podcasts below this threshold return a 404 from this endpoint.
* **English-language bias.** Treatment classification is most reliable for English-language content; languages with limited transcript coverage may produce lower-confidence assessments.
* **Sample-based.** Each assessment is a snapshot of a contiguous window, not the full catalog. Across many assessments over a podcast's lifetime, the union of windows covers the publishing history; for catalog-wide claims combine `include=history` with the per-window `sample_window_start_at` / `sample_window_end_at` boundaries.

## Related

* [Bias analysis](/podcasts/overview#bias-analysis) — political bias rating, the closest analog (per-podcast LLM-derived assessment with evidence and methodology).
* [Episodes](/podcasts/episodes) — drill into the episodes that produced an assessment.
* [Concepts → Pricing weight](/concepts#pricing-weight) — suitability calls are priced higher per call.


# Transcripts
Source: https://docs.particle.pro/podcasts/transcripts

Diarized dialogue, word-level timestamps, entity mentions in context, and SRT export.

Every transcribed episode has three transcript views, each tuned for a different use case:

* **Dialogue** — speaker-attributed lines with sentence-level timestamps. The default. Best for chat-style UIs, LLM context windows, and most reading.
* **Words** — every word individually timestamped. Best for karaoke-style highlighting, precision audio editing, and word-aligned search.
* **Mentions** — lines surrounding mentions of a specific entity, with `is_mention` flags. Best for "what did they say about X?" workflows.

Dialogue transcripts are also reachable scoped to a single segment or clip.

<Note>Available to MCP agents via [`podcasts/get_episode`](/mcp/tools/podcasts/get-episode) with `include_transcript=true` (and optional `transcript_format`, `transcript_speaker`, `transcript_start`, `transcript_end`). For mention-style windows, use [`podcasts/get_entity_mentions`](/mcp/tools/podcasts/get-entity-mentions).</Note>

## Dialogue transcript

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/transcript" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/transcript",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { lines } = await res.json();
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "episode_id": "78cgekLUjCJBUZbj3s5K8Y",
  "language": "en",
  "duration_seconds": 4206,
  "lines": [
    {
      "number": 1,
      "speaker": "Scott Galloway",
      "role": "CO_HOST",
      "start_seconds": 0.56,
      "end_seconds": 7.74,
      "text": "This episode is brought to you by The Build Podcast…"
    }
    // …
  ]
}
```

Lines are ordered, 1-indexed, and include speaker name and role. Note that the first lines of many episodes are sponsorship reads — fetch `/segments` to see which time ranges are tagged `AD` if you want to skip them. See [segments](/podcasts/segments-and-clips#segments).

## Output formats

Use the `format` query parameter:

<Tabs>
  <Tab title="Dialogue (default)" icon="comments">
    Structured JSON with speaker attribution, roles, and timestamps per line.

    ```bash theme={"dark"}
    curl ".../transcript?format=dialogue"
    ```

    Best for: building conversation UIs, speaker analysis, programmatic processing.
  </Tab>

  <Tab title="Plain text" icon="align-left">
    `Speaker: text` lines, one per turn.

    ```bash theme={"dark"}
    curl ".../transcript?format=text"
    ```

    Best for: LLM context windows, full-text display, search indexing.
  </Tab>

  <Tab title="SRT subtitles" icon="closed-captioning">
    Standard SubRip format with speaker labels.

    ```bash theme={"dark"}
    curl ".../transcript?format=srt"
    ```

    Best for: video players, caption rendering, accessibility tools.
  </Tab>
</Tabs>

## Filter by speaker or time range

Extract everything one person said:

```bash theme={"dark"}
curl ".../transcript?speaker=Kara+Swisher" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

Extract a time range:

```bash theme={"dark"}
# Minute 5 to minute 15
curl ".../transcript?start=300&end=900" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

Combine — exactly what one person said during one segment:

```bash theme={"dark"}
curl ".../transcript?speaker=Scott+Galloway&start=1435&end=2228&format=text"
```

## Word-level transcript

For per-word timing — karaoke-style highlighting, precision editing, word-aligned search:

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/transcript/words?start=0&end=10" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

```jsonc Response (truncated) theme={"dark"}
{
  "episode_id": "78cgekLUjCJBUZbj3s5K8Y",
  "language": "en",
  "words": [
    { "text": "This", "type": "word", "start_seconds": 0.56, "end_seconds": 0.74, "speaker": "Scott Galloway" },
    { "text": " ",    "type": "spacing", "start_seconds": 0.74, "end_seconds": 0.82, "speaker": "Scott Galloway" },
    { "text": "episode", "type": "word", "start_seconds": 0.82, "end_seconds": 1.12, "speaker": "Scott Galloway" }
    // …
  ]
}
```

<Warning>
  Word-level transcripts for long episodes can be very large. Always pass `start` and `end` to request only the time range you need.
</Warning>

The `speaker` field is the identified speaker name (e.g. `Scott Galloway`). When a speaker hasn't been resolved to a name, the raw STT label (`speaker_0`, `speaker_1`, …) is returned instead.

## Transcript mentions

The most useful transcript view when you care about a specific person, company, or topic. Returns the dialogue lines around every mention of an entity in one episode, with `is_mention: true` on the lines that actually contain the mention and surrounding lines for context.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/transcript/mentions?entity_id=sam-altman" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "episode_id": "78cgekLUjCJBUZbj3s5K8Y",
  "entities": [
    {
      "entity": {
        "id": "5MBAHcKUujL2dzPXrgfQ8E",
        "slug": "sam-altman",
        "name": "Sam Altman"
      },
      "total_mention_count": 5,
      "mention_variants": ["Sam Altman"],
      "mentions": [
        {
          "lines": [
            { "number": 363, "speaker": "Kara Swisher", "text": "Uh, let's go on a quick break.", "is_mention": false, "start_seconds": 1232.53, "end_seconds": 1233.69 },
            { "number": 364, "speaker": "Kara Swisher", "text": "When we come back, Elon Musk and Sam Altman head to court.", "is_mention": true, "start_seconds": 1233.79, "end_seconds": 1236.51 },
            { "number": 365, "speaker": "Kara Swisher", "text": "Big story, actually.", "is_mention": false, "start_seconds": 1236.65, "end_seconds": 1238.09 }
          ],
          "start_seconds": 1231.47,
          "end_seconds": 1246.56
        }
        // …
      ]
    }
  ],
  "has_more": true,
  "cursor": "r.AQAAABk"
}
```

Use `start_seconds` / `end_seconds` to deep-link into the audio, or feed the line text into an LLM with full speaker context.

### Chunking semantics

The endpoint groups transcript lines into context **windows**:

* `context_lines` (default `2`, max `20`) is the radius of each window. A mention on line `i` produces the closed range `[i - context_lines, i + context_lines]`, clamped at the transcript boundaries — so a single mention yields up to `2 * context_lines + 1` lines.
* Adjacent or overlapping windows **merge** into a single window. Two mentions within `context_lines` of each other produce one entry with multiple `is_mention: true` lines, not two entries.
* `total_mention_count` is the unfiltered count of dialogue lines containing at least one mention of the entity in the episode. It is independent of pagination, and equals the sum of `is_mention=true` flags across the un-paginated `mentions[]`.
* Mention matching is a case-sensitive substring match against `mention_variants` (the entity's canonical name plus any annotated aliases).

### Pagination

| Caller shape         | Pagination axis        | Cursor refers to                    |
| -------------------- | ---------------------- | ----------------------------------- |
| `entity_id` provided | `mentions[]` (windows) | offset into windows for that entity |
| `entity_id` omitted  | `entities[]`           | offset into entity list             |

When `entity_id` is set, exactly one entity is returned and its `mentions[]` is paged. When `entity_id` is omitted, each entity in the page returns **all** of its mentions; deep-paging through a single entity's mentions requires re-issuing with that `entity_id`.

`limit` defaults to `25` and is capped at `100`. Pass the `cursor` from a previous response to fetch the next page; `has_more` indicates whether more results exist.

```bash theme={"dark"}
curl "https://api.particle.pro/v1/podcasts/episodes/78cgekLUjCJBUZbj3s5K8Y/transcript/mentions?entity_id=sam-altman&limit=25&cursor=r.AQAAABk" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

## Segment and clip transcripts

Segments and clips have their own transcript endpoints scoped to that time range:

```bash theme={"dark"}
# Segment transcript
curl "https://api.particle.pro/v1/podcasts/segments/{segment_id}/transcript" \
  -H "X-API-Key: $PARTICLE_API_KEY"

# Clip transcript with SRT export
curl "https://api.particle.pro/v1/podcasts/clips/{clip_id}/transcript?format=srt" \
  -H "X-API-Key: $PARTICLE_API_KEY"
```

Both accept the `format` query parameter (`dialogue`, `text`, or `srt`).

## Related

* [Episodes](/podcasts/episodes) — discovery and sub-resources
* [Segments & clips](/podcasts/segments-and-clips) — get a clip ID, then its transcript
* [Knowledge graph → entities](/knowledge-graph/entities) — pick the entity to mention-search


# Quickstart
Source: https://docs.particle.pro/quickstart

Trace one person across podcasts, dialogue, and companies in five minutes.

In the next five minutes you'll find a person in the knowledge graph, read every line of dialogue where they're discussed across the podcast catalog, find the episodes where they were actually a guest, pull the highlight clips, search the catalog by topic, then pivot to the companies they're connected to and the podcasts those companies sponsor — all with real, current data.

Every example below was run against `https://api.particle.pro` while writing this page. Paste them with your own key and you'll see the same kind of results.

## Get an API key

1. Sign up or log in at the <DashboardLink>API Dashboard</DashboardLink>
2. Create an organization and project
3. Open the project's **API Keys** section
4. Click **Create API Key** and copy the key — it won't be shown again

Set it as an environment variable so the rest of this guide reads cleanly:

```bash theme={"dark"}
export PARTICLE_API_KEY="pk_…"
```

All endpoints accept the key in the `X-API-Key` header. See [API reference → Introduction](/api-reference/introduction) for the alternate `Authorization: Bearer` form.

## 1. Find a person

Start with a name search. `/v1/entities?q=…` matches against the knowledge graph and returns ranked results with a slug for each — the slug is the handle you'll pass to every other entity-aware endpoint.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/entities?q=altman&limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/entities?q=altman&limit=3",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  import os, httpx

  res = httpx.get(
      "https://api.particle.pro/v1/entities",
      params={"q": "altman", "limit": 3},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response theme={"dark"}
{
  "data": [
    {
      "id": "17PzxG1t12xzno",
      "slug": "sam-altman",
      "name": "Sam Altman",
      "description": "CEO of OpenAI",
      "wikipedia_url": "https://en.wikipedia.org/wiki/Sam_Altman",
      "image_url": "https://cdn.particle.pro/url/media/kge/m/02kx06l/…"
    },
    {
      "id": "44RuOByIGYS",
      "slug": "robert-altman",
      "name": "Robert Altman",
      "description": "American filmmaker",
      "wikipedia_url": "https://en.wikipedia.org/wiki/Robert_Altman"
    }
    // …
  ],
  "has_more": true,
  "cursor": "…"
}
```

The first result is the one we want — `sam-altman`. Once you know an entity's slug, you can also fetch it directly with `GET /v1/entities/sam-altman` to get the full record. Every endpoint that takes an `{id}` accepts the canonical ID *or* the slug — pick whichever you have. We'll use `sam-altman` for the rest of the tutorial.

## 2. Read every line said about them

Jump straight from "this is the entity" to "here is every line of dialogue across the podcast catalog where they're mentioned" — grouped by episode, recency-ordered, with the surrounding lines for context and the matched line flagged.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/mentions?entity_id=sam-altman&limit=2" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/mentions?entity_id=sam-altman&limit=2",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/mentions",
      params={"entity_id": "sam-altman", "limit": 2},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "episode": {
        "id": "1Se2PVIwRNIhRIcv5FgAPX",
        "title": "Evening Wire: Comey Indicted Again & Fauci Advisor Charged in COVID Cover-Up | 4.28.26",
        "published_at": "2026-04-28T21:30:00Z",
        "podcast": { "title": "Morning Wire", "slug": "morning-wire" }
      },
      "mention_count": 1,
      "mention_variants": ["Sam Altman"],
      "windows": [
        {
          "segment": { "type": "TOPIC_DISCUSSION", "title": "OpenAI Growth Miss and IPO Concerns" },
          "start_seconds": 436.05,
          "end_seconds": 470.41,
          "lines": [
            {
              "speaker": "Andy Valdez",
              "role": "CORRESPONDENT",
              "start_seconds": 452.77,
              "end_seconds": 460.21,
              "text": "As CEO Sam Altman continues to seek an IPO at an aggressive pace, slowing growth may turn away potential investors.",
              "is_mention": true
            }
            // …surrounding lines for context
          ]
        }
      ]
    }
    // …
  ],
  "has_more": true,
  "cursor": "s.…",
  "entity": { "slug": "sam-altman", "name": "Sam Altman", "description": "CEO of OpenAI" }
}
```

Each episode group returns one or more `windows` — contiguous ranges of dialogue where the entity is mentioned, with `context_lines` of surrounding speech (default `2`, configurable up to `20`). Every line that actually names the entity has `is_mention: true`. The `start_seconds` and `end_seconds` deep-link into the audio.

<Note>
  Use `/v1/podcasts/mentions` for "every line about an entity." Use [`/v1/podcasts/search`](/podcasts/search) for "every segment that *talks about* a topic" (paraphrase-tolerant) or contains a specific phrase (BM25). They're complementary — see [Search](/podcasts/search) for when to reach for which.
</Note>

The same endpoint answers "what has *one show* been saying about *one entity*?" Stack `entity_id` with `podcast_id` to scope dialogue to a single podcast — for example, every line the All-In podcast has aired about OpenAI:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl --get "https://api.particle.pro/v1/podcasts/mentions" \
    --data-urlencode "entity_id=openai" \
    --data-urlencode "podcast_id=all-in" \
    --data-urlencode "limit=2" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const url = new URL("https://api.particle.pro/v1/podcasts/mentions");
  url.searchParams.set("entity_id", "openai");
  url.searchParams.set("podcast_id", "all-in");
  url.searchParams.set("limit", "2");
  const res = await fetch(url, {
    headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
  });
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/mentions",
      params={"entity_id": "openai", "podcast_id": "all-in", "limit": 2},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "episode": {
        "id": "4KnhQ9DsSIxBhDN3BP5iFN",
        "title": "OpenAI Misses Targets, Codex vs Claude, Elon vs Sam Trial, Big Hyperscaler Beats, Peptide Craze",
        "published_at": "2026-05-01T21:37:00Z",
        "podcast": { "title": "All-In with Chamath, Jason, Sacks & Friedberg", "slug": "all-in" }
      },
      "mention_count": 35,
      "mention_variants": ["OpenAI"],
      "windows": [
        {
          "segment": { "type": "TOPIC_DISCUSSION", "title": "OpenAI misses targets and IPO debate" },
          "start_seconds": 222.42,
          "end_seconds": 275.7,
          "lines": [
            {
              "speaker": "Jason Calacanis",
              "role": "HOST",
              "start_seconds": 229.76,
              "end_seconds": 234.92,
              "text": "OpenAI has $600 billion in spending commitments for compute.",
              "is_mention": true
            }
            // …surrounding lines for context
          ]
        }
        // …more windows in this episode
      ]
    }
    // …more All-In episodes
  ],
  "has_more": true,
  "cursor": "s.1hwwoMp2ojPqMXPMC40Qn5lyYu2z9jHwDAbO",
  "entity": { "slug": "openai", "name": "OpenAI", "description": "Artificial intelligence company" }
}
```

Same shape as the Sam Altman call — episodes, windows, mention-flagged lines — just narrowed to one show. Swap `podcast_id` for any other slug (`acquired`, `lex-fridman`, `the-tim-ferriss-show`) to ask the same question of a different audience.

## 3. Find episodes where they were actually a guest

Mentions tells you where someone was *discussed*. Episodes tells you where they were *featured*. Filter by `entity_id` plus a `role` to get just the episodes where Sam Altman was on the show as a guest — not the hundreds of episodes where his name comes up in passing.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes?entity_id=sam-altman&role=guest&limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/podcasts/episodes?entity_id=sam-altman&role=guest&limit=3",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/episodes",
      params={"entity_id": "sam-altman", "role": "guest", "limit": 3},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "2cgrh56ehQYBlXwqecmZ9P",
      "title": "OpenAI CEO Sam Altman & Amazon CEO Andy Jassy 2/27/26",
      "podcast": { "title": "Squawk Pod", "slug": "squawk-pod" },
      "published_at": "2026-02-27T17:08:52Z",
      "duration_seconds": 2916,
      "speakers": [
        { "name": "Joe Kernen", "role": "HOST" },
        { "name": "Sam Altman", "role": "GUEST", "entity": { "slug": "sam-altman" } },
        { "name": "Andy Jassy", "role": "GUEST", "entity": { "slug": "andy-jassy" } }
        // …
      ],
      "segment_count": 17,
      "clip_count": 6,
      "has_transcript": true
    }
    // …
  ],
  "has_more": true,
  "cursor": "…"
}
```

`role` accepts `guest`, `host`, `panelist`, `correspondent`, or `mention`. Drop the filter and you'll get every episode that touches the entity in any way — useful for broad recall, but for "where was Sam Altman actually interviewed" you want `role=guest`.

Hold onto the first result's `id` (`2cgrh56ehQYBlXwqecmZ9P` above) for the next call.

## 4. Surface the highlight clips

Episode highlights are AI-extracted clips — typically a handful per episode — scored for engagement and classified by type (`INSIGHTFUL`, `FUNNY`, `CONTROVERSIAL`, `AHA_MOMENT`, `NOTABLE_LINE`, and more). Pull the clips from the episode you just found.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/podcasts/episodes/2cgrh56ehQYBlXwqecmZ9P/clips?limit=3" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const episodeId = "2cgrh56ehQYBlXwqecmZ9P";
  const res = await fetch(
    `https://api.particle.pro/v1/podcasts/episodes/${episodeId}/clips?limit=3`,
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  episode_id = "2cgrh56ehQYBlXwqecmZ9P"
  res = httpx.get(
      f"https://api.particle.pro/v1/podcasts/episodes/{episode_id}/clips",
      params={"limit": 3},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "id": "53Fl0WgYU8H45pwOtkKHc2",
      "type": "INSIGHTFUL",
      "title": "AGI Sooner Than Expected",
      "description": "Sam Altman says AI progress is moving faster than even he predicted and hints that AGI could arrive sooner than people imagine.",
      "intro_statement": "Sam Altman evaluates how fast AGI approaches.",
      "engagement_score": 85,
      "duration_seconds": 37.62,
      "speaker": {
        "name": "Sam Altman",
        "role": "GUEST",
        "entity": { "slug": "sam-altman" }
      },
      "audio_url": "https://cdn.particle.pro/podcast/episode/…/clip/audio/….mp3"
    }
    // …
  ],
  "has_more": true,
  "cursor": "…"
}
```

`audio_url` is a direct MP3 of the clip — embed it, drop it into a player, or attach it to a social post. `intro_statement` is a ready-to-use lead-in for show notes or share copy.

## 5. Search dialogue by topic

Mentions and episode filtering both pivot off *who* is being talked about. Search pivots off *what is being said*. Use `semantic_search` for paraphrase-tolerant retrieval — describe the topic in your own words and the engine finds segments that discuss the same idea, even when they use different vocabulary.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl --get "https://api.particle.pro/v1/podcasts/search" \
    --data-urlencode "semantic_search=labor market disruption due to artificial intelligence" \
    --data-urlencode "limit=2" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const url = new URL("https://api.particle.pro/v1/podcasts/search");
  url.searchParams.set(
    "semantic_search",
    "labor market disruption due to artificial intelligence",
  );
  url.searchParams.set("limit", "2");
  const res = await fetch(url, {
    headers: { "X-API-Key": process.env.PARTICLE_API_KEY },
  });
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/podcasts/search",
      params={
          "semantic_search": "labor market disruption due to artificial intelligence",
          "limit": 2,
      },
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "data": [
    {
      "episode": {
        "id": "371bZsGWsJYikBxoCej3GS",
        "title": "Where Investment Themes Intersect and Beat Markets",
        "podcast": { "title": "Thoughts on the Market", "slug": "thoughts-on-the-market" }
      },
      "segment": {
        "type": "TOPIC_DISCUSSION",
        "title": "Labor Market Transformation from AI",
        "summary": "90% of occupations impacted\nSector analysis of employment effects\nNet 4% job loss with offsets from new hires\nShift toward role transformation over replacement",
        "start_seconds": 107.98,
        "end_seconds": 150.36
      },
      "windows": [
        {
          "lines": [
            {
              "speaker": "Stephen Byrd",
              "role": "HOST",
              "text": "Now, at the same time, AI is reshaping the labor market.",
              "is_match": true
            },
            {
              "speaker": "Stephen Byrd",
              "role": "HOST",
              "text": "We estimate that automation or augmentation will impact ninety percent of occupations, so almost every job will be affected, but the effect is not binary.",
              "is_match": true
            }
            // …context lines around the matches
          ]
        }
      ],
      "match": { "source": "semantic", "relevance_score": 0.61 }
    }
    // …
  ],
  "has_more": true,
  "cursor": "…"
}
```

Each result is one *segment* of one episode. The query never used the words "automation," "occupations," or "employment" — `semantic_search` matched on meaning. Lines whose text drove the match are flagged `is_match: true`. The response also returns any highlight clips that overlap the segment in the same payload.

For exact-phrase matches (tickers, drug names, model numbers), pass `keyword_search` instead — or both, for hybrid retrieval. Add `entity_id` or `company_id` to scope a topical search to episodes featuring a specific person or company. The full surface is documented in [Search](/podcasts/search).

## 6. Pivot to companies

Companies in Particle API are cross-referenced across every identifier system you might already have — SEC CIK, Wikidata QID, stock ticker, domain, and knowledge-graph slug. Look up Shopify by ticker:

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/companies?ticker=SHOP&limit=1" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/companies?ticker=SHOP&limit=1",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const { data } = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/companies",
      params={"ticker": "SHOP", "limit": 1},
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  data = res.json()["data"]
  ```
</CodeGroup>

```json Response theme={"dark"}
{
  "data": [
    {
      "id": "21IMlzahxqyE3wPovDXXM9",
      "name": "Shopify",
      "description": "Shopify offers an e-commerce platform mainly to small and medium-sized businesses…",
      "identifiers": {
        "cik": "0001594805",
        "qid": "Q7501150",
        "entity": {
          "id": "17PzxG1tF2dy48",
          "slug": "shopify",
          "name": "Shopify"
        },
        "ticker": "SHOP",
        "domain": "shopify.com"
      }
    }
  ],
  "has_more": false
}
```

Path-style lookups accept the slug, the domain, or the canonical ID — these all return the same Shopify record (`id: 21IMlzahxqyE3wPovDXXM9`):

```bash theme={"dark"}
curl "https://api.particle.pro/v1/companies/shopify"      -H "X-API-Key: $PARTICLE_API_KEY"   # by slug
curl "https://api.particle.pro/v1/companies/shopify.com"  -H "X-API-Key: $PARTICLE_API_KEY"   # by domain
```

For ticker, CIK, or QID lookups use the list endpoint (`/v1/companies?ticker=SHOP`, `?cik=…`, `?qid=…`). The nested `entity.slug` (`shopify`) is the same kind of handle you used for Sam Altman in step 1 — feed it to any entity-aware endpoint to surface Shopify's mentions, episodes, and clips across the catalog.

## 7. Get sponsor analytics in one call

Companies show up in podcasts in two ways: as topics of conversation *and* as advertisers. The per-company advertising endpoint gives you the sponsor view in a single request.

<CodeGroup>
  ```bash curl theme={"dark"}
  curl "https://api.particle.pro/v1/companies/shopify/podcast/advertising" \
    -H "X-API-Key: $PARTICLE_API_KEY"
  ```

  ```js JavaScript theme={"dark"}
  const res = await fetch(
    "https://api.particle.pro/v1/companies/shopify/podcast/advertising",
    { headers: { "X-API-Key": process.env.PARTICLE_API_KEY } },
  );
  const summary = await res.json();
  ```

  ```python Python theme={"dark"}
  res = httpx.get(
      "https://api.particle.pro/v1/companies/shopify/podcast/advertising",
      headers={"X-API-Key": os.environ["PARTICLE_API_KEY"]},
  )
  summary = res.json()
  ```
</CodeGroup>

```jsonc Response (truncated) theme={"dark"}
{
  "company_id": "shopify.com",
  "total_ads": 9349,
  "podcast_reach": 578,
  "episode_reach": 8277,
  "read_type_breakdown": { "host_read": 7003, "pre_recorded": 2346 },
  "recent_ads": [
    {
      "sponsor_name": "Shopify",
      "product": "Shopify checkout",
      "offer_description": "Get a $1 trial when you switch to Shopify today",
      "sponsor_url": "shopify.com/setup",
      "read_type": "PRE_RECORDED",
      "placement_type": "PRE_ROLL",
      "start_seconds": 9.4,
      "end_seconds": 38.1,
      "duration_seconds": 28.7,
      "podcast": { "title": "The John Batchelor Show", "slug": "the-john-batchelor-show" },
      "created_at": "2026-04-29T01:42:01.520819Z"
    }
    // …
  ]
}
```

You get host-read vs pre-recorded breakdowns, recent placements with podcast attribution, and product-level tagging where available — plus the in-episode timing of each read. Enough to power competitive intelligence dashboards or category-spend analysis without scraping audio yourself.

## What's next

<CardGroup>
  <Card title="Concepts" icon="book" href="/concepts">
    IDs and slugs, pagination, errors, pricing weight, and choosing the right endpoint for the job.
  </Card>

  <Card title="Podcasts overview" icon="microphone" href="/podcasts/overview">
    Episodes, transcripts, segments, clips, advertising, and bias.
  </Card>

  <Card title="API reference" icon="terminal" href="/api-reference/introduction">
    Every endpoint with request and response schemas.
  </Card>
</CardGroup>


