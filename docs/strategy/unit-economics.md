---
date: 2026-05-12
status: working draft (v1 dev, pre-launch)
type: strategy
title: "Podium — unit economics and pricing anchor"
related-plan: docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md
---

# Unit economics & pricing anchor

This doc captures the cost structure, pricing target, and architectural decisions that make Podium economically viable beyond the v1 single-user build. It exists so the math is auditable as we make engineering choices — every cost-relevant decision should be checkable against this anchor.

**Bottom line:** target retail price is **$3.99/month Pro tier, unlimited teams, daily digest**. Cost-to-serve target is **<$1.00/user/month at modest scale**, achieved via multi-tenant ingestion sharing + a per-team cost ceiling of ~$6/month. Margin holds at 70%+ once a team has ≥10 users; break-even is 2 users per team.

---

## What we observed (the real numbers)

Pulled from `api_calls` on 2026-05-12 covering all ingestion runs since 2026-05-10 (the U8 verification onward):

```
Total: 679 calls, $4.23 over 2 days across multiple dev-mode runs

By provider:
  particle    496 calls  $3.46  (82%)
  anthropic   183 calls  $0.77  (18%)

By endpoint (top spenders):
  particle/podcasts.transcript.lines   254 calls  $2.03   ← 48% of total
  anthropic/summarize_segment          179 calls  $0.76   ← 18%
  particle/podcasts.mentions            91 calls  $0.73   ← 17%
  particle/entities.list                65 calls  $0.26   ← 6% (should be ~0)
  particle/podcasts.list                62 calls  $0.25   ← 6% (should be ~0)
  particle/podcasts.search              24 calls  $0.19   ← 5%

Anthropic prompt cache hit rate: 0%  (designed to be ~90%)
```

The actual data drove three findings:

1. **Particle dominates cost (82%)**, and within Particle, transcript fetches are half of everything we spend. This is the structural cost driver.
2. **Anthropic prompt caching is broken** (0% hit rate vs the 90% U9 designed for). Free 0.20/day-equivalent savings sitting on the table.
3. **`entities.list` + `podcasts.list` are running during ingest** (127 calls in 2 days) when they should only run at seed time. Cached IDs aren't being used somewhere. Free ~$0.15/day savings sitting on the table.

Reproduce: `npm run inspect-costs` (or `inspect-costs -- since=YYYY-MM-DD` to bound the window).

---

## Cost model — what one team costs to serve, by optimization stage

Per-team-per-day cost (the unit the architecture optimizes for, since one ingest run feeds every user following that team):

| Stage | Per-team-per-day | Per-team-per-month | Effort to reach |
|---|---|---|---|
| **Today** (as shipped, v1) | $0.80–1.20 | $24–36 | — |
| **+ Anthropic caching fixed + redundant list calls eliminated** | $0.40–0.60 | $12–18 | ~1 hour |
| **+ Episode-level Claude pass** (one summarize call per episode instead of per-segment) | $0.20–0.30 | $6–9 | half a day |
| **+ Cadence policy** (daily in-season, every 2-3 days off-season) | $0.10–0.15 avg | $3–5 avg | trivial |

**Engineering target:** **≤$6/month per team in steady state**, which means we have to hit at least the "+episode-level" stage before opening to paid users. Caching + list calls are pre-requisites we should ship even for the v1 single-user case (they're free wins).

### What we're paying for

After all optimizations, the residual structural costs per team-per-day:

- **Particle entity searches** (30 entities × $0.008 = $0.24): one call per entity per run. Particle's mentions API is per-entity; can't be batched. Fixed cost per team.
- **Particle storyline searches** (8 storylines × $0.008 = $0.06): same shape as entities. Fixed per team.
- **Particle transcript fetches** (~8 episodes/day × $0.008 = $0.06): episode-level instead of segment-level pipeline collapses this.
- **Anthropic episode summarization** (~8 episodes × ~$0.005 with caching = $0.04): one pass per episode, cache hit on the system prompt + universe context.

Total residual: ~$0.40/day in-season → after off-season averaging, ~$0.20/day.

### What scales with users (almost nothing)

- Per-user storage: trivial. Cards + feedback rows are tiny. Supabase Pro covers it.
- Per-user serving: Vercel function executions. ~$0.10/user/month at moderate traffic.
- Per-user Anthropic: zero (summarization is per-team, not per-user).
- Per-user Particle: zero (search and transcripts are per-team).

**Per-user marginal cost ≈ $0.10–0.30/month** dominated by serving. All real cost is per-team.

---

## How multi-tenant sharing makes the math work

Architecture (already supported by the v1 schema):

```
1 PODCAST CATALOG (national pool + per-team specific shows)
   │
   N TEAM UNIVERSES (one per team — entities + storylines)
   │
   1 INGEST RUN per team per day  ← all cost incurred here
   │
   M USERS following that team  ← share the cards produced
   │
   per-user: cards (with team_id), feedback (per-user)
```

Cost-per-user-per-month for a team with K subscribers, given $6/team/month:

| K (users per team) | Cost / user | Margin at $3.99 |
|---|---|---|
| 1 | $6.00 | -$2.01 (loss leader) |
| 2 | $3.00 | $0.99 (break-even) |
| 5 | $1.20 | $2.79 (70% margin) |
| 10 | $0.60 | $3.39 (85%) |
| 20 | $0.30 | $3.69 (92%) |
| 100 | $0.06 | $3.93 (99%) |

For a user following T teams, total cost-to-serve is `Σ ($6 / K_i)` across their teams. The pricing model below bets on average behavior across the user base.

### Catalog scoping (per-team specific shows + shared national)

The 31-podcast v1 catalog is composed of:
- **24 national shows** — relevant to every team (NFL Daily, Mina Kimes, etc.)
- **7 49ers-specific** — only relevant for 49ers ingestion

When we add the Giants in v2, schema gains `podcasts.team_id` (nullable for national shows; team-specific for the rest). Each team's ingest scans `national ∪ that team's specific shows`. The 49ers don't subsidize Giants ingestion; each team has its own cost stream, amortized across its own subscribers.

The team-specific shows are the moat — they're the high-density content. National pool is table stakes; cutting team-specifics would make the product worse and only save ~$0.10–0.20/team/day. Not worth the quality hit.

---

## Pricing model

### Tier structure

| Tier | Price | What's included | Target cost-to-serve |
|---|---|---|---|
| **Free** | $0 | 1 team, weekly digest, 30-day card retention | $0.05/user/mo |
| **Pro** | **$3.99/mo** | Unlimited teams, daily digest, full history, advanced feedback | $0.50–1.50/user/mo |
| **Ultra** (v3+) | **$9.99/mo** | Email + push delivery, custom universes (add personal players/shows), multi-sport bundling | $1.50–3.00/user/mo |

### Why $3.99 unlimited teams (vs. team-capped tiers)

- **Simpler positioning.** "Follow your teams, get the digest" is one sentence. No tier-shopping over team count.
- **Power-user inclusion.** A fan who follows 5 teams is more engaged, more likely to advocate, more likely to retain. Caps would push them to a competitor that doesn't gate.
- **Math holds at average behavior.** Even a 3-team user with mixed team density nets ~$2.50–3 in monthly margin. Outliers (one user following 10 teams in 10 niche markets) are rare and tolerable.
- **Differentiate by features at higher tiers.** Ultra adds delivery channels and personal-universe extensions — things that DO cost more per-user (push notifications, additional Particle slugs in personal scope).

### Comparable products for anchoring

| Product | Price | What you get |
|---|---|---|
| The Athletic (one team) | $7–10/mo | Human-written articles, one team |
| Spotify Premium | $11.99/mo | Music + podcast access |
| Locked On podcast network (free) | $0 | Daily team-specific podcast (but you have to listen) |
| Bleacher Report Live | $2.99–9.99/mo | Live sports, one team |
| **Podium Pro** | **$3.99/mo** | AI-curated daily digest across all your teams, audio + summary + quotes, time-saving |

The value proposition is **time, not information**. A serious fan listens to 5–8 hours of podcast per week. Podium turns that into 5–10 minutes of reading + targeted listening to the moments that matter. At $20/hr opportunity cost, you're "earning" $100+/week. $3.99 is one coffee.

---

## Break-even analysis (when does each team pay for itself?)

Given a $6/team/month cost-to-serve target and $3.99/user/month Pro pricing:

| Team subscriber count | Monthly revenue | Cost | Net | Status |
|---|---|---|---|---|
| 1 | $3.99 | $6 | -$2 | Loss leader (acceptable for early team-launch) |
| 2 | $7.98 | $6 | +$1.98 | Break-even |
| 10 | $39.90 | $6 | +$33.90 | Healthy ($3.39/user margin) |
| 100 | $399 | $6 | +$393 | Pure margin ($3.93/user) |
| 1000 | $3,990 | $6 | +$3,984 | Scale economics |

A "team can pay for itself" at just 2 paying subscribers. Below that, the team is a marketing cost — useful for SEO, breadth of catalog claim, and acquiring those first 2 fans.

### Implication for team rollout

- **Launch teams that already have ≥20K serious fans** (49ers ✓, Cowboys, Patriots, Lakers, etc.) — easy to find 10+ subscribers.
- **Mid-tier teams** (Giants, Vikings, etc.) — break-even achievable in months.
- **Long-tail teams** (Jaguars, Pirates, etc.) — net negative for the first year but the marginal cost is small ($6/mo). Worth carrying for catalog completeness if engineering effort is zero (just adding a universe + a few team-specific podcasts).

---

## Engineering decisions anchored to this doc

Decisions made because of unit economics:

1. **Multi-tenant ingestion sharing is non-negotiable for v2.** A v2 that runs the pipeline per-user-per-team kills the entire margin story. Schema already supports the shared model (`cards.user_id` exists alongside `cards.team_id`); the ingestion runner needs to produce one card row per (user × episode) when sharing kicks in — not duplicate Particle/Claude work.
2. **Episode-level Claude pass before paid launch.** Per-segment summarization burns ~60% more than per-episode. Half-day refactor; biggest single cost lever.
3. **Anthropic prompt caching must reach ~90% hit rate.** Currently at 0% — likely a bug in how the cache markers are applied. Investigate before launch.
4. **Eliminate `entities.list` + `podcasts.list` calls during ingestion.** Cached IDs in `podcasts.particle_id` + `universes.entity_id_map` should be the only source. Anything calling these endpoints at runtime is a bug.
5. **Daily cadence in-season; every 2-3 days off-season.** No serious 49ers content drops in July; running daily is waste. Cadence config per team.
6. **Don't accept user-suggested podcasts into the catalog freely.** Every catalog addition costs every team. Editorial review or paid "personal extras" only.

Decisions explicitly deferred:

- Custom user universes (add my own player to the search): Ultra tier feature, requires per-user Particle search calls = real per-user cost. Defer to v3.
- Cross-team intelligence (when these teams play): valuable but compute-heavy. v3.
- Push/email delivery: shifts cost to delivery infra (negligible) but adds engagement (worth it). v3 Ultra.

---

## Risks & open questions

- **Particle pricing tier shift.** We're on Starter ($10 free credit, ~$0.004/standard, ~$0.008/premium call). If Particle moves the goalposts on Growth ($/call) the per-team cost rises. Mitigation: confirm pricing pre-launch; the cost-abort gate protects against runaway spend.
- **Anthropic Haiku pricing.** Cheap today (~$1/M input, $5/M output). Stable so far. A Haiku price hike would mostly affect the episode-level pass.
- **Catalog inflation.** Adding 20 more national podcasts to chase coverage means 20 more transcript fetches per ingest per team. Discipline matters: each catalog addition needs to pass an "is the marginal cost worth it" gate.
- **Per-user serving cost at scale.** Vercel function executions scale with traffic; at 10K+ users this might hit $200/mo. Still tiny relative to revenue.
- **Acquisition costs.** Unit economics are healthy; acquiring users is a separate problem. A $3.99 product has to fight for attention against $0 alternatives (Twitter, Reddit, podcast apps themselves). Not solved by engineering.

---

## Re-validate

This doc reflects our model on 2026-05-12. Re-validate when any of:

- Per-team cost data shifts (run `npm run inspect-costs` after every major architecture change)
- Particle or Anthropic pricing changes
- We add a second team (Giants/Warriors/etc.) and discover the assumed per-team cost is off
- We get our first paying users and see real usage patterns (avg teams per user, retention)

The plan unit `Success Metrics` section (`docs/plans/2026-05-09-001-feat-podium-v1-49ers-digest-plan.md`) carries the operational success criteria. This doc carries the *commercial* criteria — together they should be reviewed before every major architectural decision.
