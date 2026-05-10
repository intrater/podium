/**
 * 49ers content universe (R3): the entities and storylines that define what
 * counts as "49ers content" for the daily ingestion run.
 *
 *  - `entities`       — Particle entity slugs to query via the entity-mention
 *                       search endpoint. Slugs follow Particle's published
 *                       convention `name.toLowerCase().replace(/'/g,'').
 *                       replace(/\./g,'').replace(/\s+/g,'-')`. All entries
 *                       below were verified against `/v1/entities?q=...` on
 *                       2026-05-10 — predicted slugs land on the canonical
 *                       entity 100% of the sample.
 *  - `nameFallbacks`  — name strings used for semantic search when an entity
 *                       isn't in Particle's graph. Empty in v1 because
 *                       coverage was complete; the field stays as a hook for
 *                       fringe roster additions during the season.
 *  - `storylines`     — semantic queries for content that talks about the
 *                       team without naming a specific roster entity (free
 *                       agency, draft, coaching, etc.). The daily worker
 *                       runs each as a semantic search against Particle and
 *                       unions the results with the entity-mention hits.
 */

export interface Universe {
  teamId: string;
  entities: readonly string[];
  nameFallbacks: readonly string[];
  storylines: readonly string[];
}

export const niners: Universe = {
  teamId: "49ers",

  entities: [
    // Team
    "san-francisco-49ers",

    // Front office + coaching staff
    "kyle-shanahan",      // head coach
    "john-lynch",         // general manager
    "robert-saleh",       // defensive coordinator (returned 2025)
    "klay-kubiak",        // offensive coordinator
    "jed-york",           // owner / CEO

    // Quarterbacks
    "brock-purdy",
    "mac-jones",

    // Running backs
    "christian-mccaffrey",
    "isaac-guerendo",
    "jordan-mason",

    // Wide receivers
    "brandon-aiyuk",
    "jauan-jennings",
    "ricky-pearsall",

    // Tight end
    "george-kittle",

    // Offensive line
    "trent-williams",

    // Defensive line
    "nick-bosa",
    "javon-hargrave",
    "maliek-collins",
    "leonard-floyd",
    "yetur-gross-matos",

    // Linebackers
    "fred-warner",
    "dre-greenlaw",

    // Secondary
    "charvarius-ward",
    "deommodore-lenoir",
    "renardo-green",
    "talanoa-hufanga",
    "malik-mustapha",

    // Specialists
    "jake-moody",
    "mitch-wishnowsky",
  ],

  nameFallbacks: [],

  storylines: [
    "San Francisco 49ers offseason moves and free agency",
    "San Francisco 49ers draft strategy and rookie evaluations",
    "San Francisco 49ers injury reports and recovery timelines",
    "San Francisco 49ers coaching decisions and play-calling",
    "San Francisco 49ers contract extensions and salary cap",
    "San Francisco 49ers playoff outlook and NFC West race",
    "San Francisco 49ers trade rumors involving roster players",
    "San Francisco 49ers game previews, recaps, and matchup analysis",
  ],
};
