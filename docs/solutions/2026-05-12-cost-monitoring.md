---
date: 2026-05-12
topic: cost monitoring for v1 (Particle + Anthropic spend)
tags: [supabase, observability, cost, v1]
applicability: until v2 adds the /usage page UI on top of api_calls
---

# Cost monitoring (v1)

v1 ships the `api_calls` table populated by the U7 tracked-call wrapper
on every Particle and Anthropic call. There is **no `/usage` page in
v1** — that UI lands in v2. Until then, query Supabase's SQL editor
directly.

## Day-by-day spend per provider

```sql
select date_trunc('day', ts)::date as day,
       provider,
       sum(cost_usd)::numeric(10,4) as usd,
       count(*) as call_count
from api_calls
group by 1, 2
order by 1 desc, 2;
```

## Spend by endpoint (find expensive callers)

```sql
select provider,
       endpoint,
       sum(cost_usd)::numeric(10,4) as usd,
       count(*) as call_count
from api_calls
where ts > now() - interval '7 days'
group by 1, 2
order by 3 desc
limit 20;
```

## Anthropic cache hit rate

Cache hits show up via `metadata->'cache_read_input_tokens'` (the U9
client splits this out before computing cost). A high ratio of
cache-read to fresh-input tokens means prompt caching is working.

```sql
select date_trunc('day', ts)::date as day,
       sum((metadata->>'cache_read_input_tokens')::int) as cache_read,
       sum(input_tokens) as fresh_input,
       round(
         sum((metadata->>'cache_read_input_tokens')::int)::numeric
           / nullif(sum(input_tokens) + sum((metadata->>'cache_read_input_tokens')::int), 0)
           * 100, 1
       ) as cache_pct
from api_calls
where provider = 'anthropic'
  and ts > now() - interval '30 days'
group by 1
order by 1 desc;
```

## Daily run digest (cross-referenced with system_alerts)

For a single day's run, pair `api_calls` with the matching
`system_alerts` row to read estimated vs. actual cost and segment counts:

```sql
with run as (
  select * from system_alerts
  where kind in ('scheduled_run_complete', 'manual_run_complete')
    and created_at > now() - interval '1 day'
  order by created_at desc limit 1
)
select
  run.created_at,
  run.episodes_count,
  run.segments_count,
  run.cost_usd::numeric(10,4) as estimated_usd,
  (
    select sum(cost_usd)::numeric(10,4)
    from api_calls
    where ts between run.started_at and run.finished_at
  ) as actual_usd
from run;
```

## Cost-gate aborts

If a run is skipped due to the 60%-of-remaining-credit gate, a row of
kind `cost_abort` lands in `system_alerts`:

```sql
select created_at, notes, cost_usd
from system_alerts
where kind = 'cost_abort'
order by created_at desc
limit 10;
```

## Monthly cap check

The Particle Starter credit is $10. To see month-to-date spend against
the cap, run:

```sql
select sum(cost_usd)::numeric(10,4) as month_to_date_usd
from api_calls
where date_trunc('month', ts) = date_trunc('month', now())
  and provider = 'particle';
```

A value approaching $6 (60% of remaining) means the next run's
pre-flight gate may abort. Top up Particle (Growth tier) or wait until
the next billing cycle.
