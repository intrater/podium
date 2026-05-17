/**
 * Derive a stable, deterministic topic_key for a moment.
 *
 * topic_key is the partition key inside voice_positions — the novelty
 * gate compares "voice X's prior positions on topic Y" against the
 * current take. The key must be:
 *
 *   - **Deterministic**: same input → same key, byte-stable across runs.
 *     A re-extract of the same moment must produce the same key so the
 *     UNIQUE(voice_id, team_id, topic_key, segment_id) constraint
 *     correctly deduplicates.
 *   - **Coarse enough to cluster**: two takes about Brock Purdy's
 *     contract should land under the same topic_key, even if one
 *     mentions "Purdy" and the other "Brock". Slugging the top
 *     surfacing entity gets us most of the way there.
 *   - **Cheap**: no LLM call. v1 derivation runs inline during segment
 *     persistence (potentially hundreds of segments per run).
 *
 * v1 algorithm: lowercase, slugify, take the top `surfacing_entities`
 * entry. Fallback to "general" when entities are empty (rare but
 * possible).
 *
 * **Iteration path**: if v1's slug-the-top-entity proves too coarse
 * (every Purdy moment lumps together regardless of subject) or too
 * fine (one moment about "Purdy contract", another about "Purdy
 * leadership", treated as separate topics), the natural next step is
 * a small LLM call that emits the topic_key alongside the moment
 * extraction. Deferred to v2.5 — see plan §"Open Questions".
 */

/**
 * Slugify a string into a stable lowercase kebab-case key. Strips
 * punctuation, collapses whitespace, lowercases. Examples:
 *   "Brock Purdy"      → "brock-purdy"
 *   "WR room"          → "wr-room"
 *   "$50M contract"    → "50m-contract"
 *   "  Trent  Williams" → "trent-williams"
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derive the topic_key for a moment from its surfacing entities.
 *
 * The top entity drives the key. If no entities, returns "general"
 * so the moment still lands in voice_positions (the novelty gate
 * will see a coarse bucket but at least see the take).
 */
export function extractTopicKey(
  surfacingEntities: readonly string[],
): string {
  const top = surfacingEntities[0]?.trim();
  if (!top) return "general";
  const slug = slugify(top);
  return slug.length > 0 ? slug : "general";
}
