---
purpose: vendored reference docs — point-in-time snapshots of upstream APIs we depend on
---

# `docs/reference/`

Snapshots of upstream API documentation, vendored into the repo so a session can answer "does this endpoint exist?" / "what does this field mean?" without re-fetching docs every time.

These differ from `docs/solutions/`:
- **`docs/solutions/`** — what we discovered solving a specific problem. Dated, narrative, learning-shaped.
- **`docs/reference/`** — what the API *is*. The vendor's docs, snapshotted at a known date with a refresh command in the file's frontmatter.

## What's here

| File | Contents |
|---|---|
| `particle-api-index.md` | Compact endpoint index — one-liners for every Particle endpoint. Start here to find what you need. |
| `particle-api.md` | Full Particle API reference — every endpoint with description, params, source URL. ~7k lines; grep for the endpoint you want. |

## When to refresh

- Before relying on a field that's been flagged as "optional" or "experimental" in our types — re-pull and check that Particle hasn't tightened the contract.
- When adding a new endpoint to our integration.
- When the agent gets surprised by a 4xx that the local snapshot says shouldn't happen.

The frontmatter of each file carries the `refresh:` command. Run it, replace the file, restore the frontmatter. Update the `snapshot:` date.

## Why vendor instead of WebFetch every time

Cache freshness is rarely the bottleneck; *availability* is. Vendored docs survive network blips, vendor outages, and offline sessions. The trade-off is staleness — accepted in exchange for instant grep.
