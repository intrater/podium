/**
 * Dump one card's full data — episode + segments + AI-generated content —
 * to the terminal in a readable form so we can iterate on the content
 * shape without bouncing between the browser and Supabase's SQL editor.
 *
 * Usage:
 *   npm run inspect-card             # most recent card
 *   npm run inspect-card -- 2        # second most recent
 *   npm run inspect-card -- all      # one-line summary of all cards
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const userId = process.env.PODIUM_USER_ID!;

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const arg = process.argv[2] ?? "0";

async function main() {
  const { data: cards, error } = await supabase
    .from("cards")
    .select(
      `id, surfaced_at, total_relevant_seconds, episode_summary,
       episodes (
         id, title, published_at, audio_url,
         podcasts ( id, name ),
         segments (
           id, start_seconds, end_seconds, audio_url, speaker_name,
           summary, pull_quotes, bullets, surfacing_entities, match_source
         )
       )`,
    )
    .eq("user_id", userId)
    .eq("hidden", false)
    .order("surfaced_at", { ascending: false });

  if (error) throw error;
  if (!cards || cards.length === 0) {
    console.log("No cards found.");
    return;
  }

  if (arg === "all") {
    console.log(`${cards.length} cards (newest → oldest):\n`);
    cards.forEach((card, i) => {
      const ep = card.episodes as Record<string, unknown> | null;
      const segs = (ep?.segments as unknown[]) ?? [];
      console.log(
        `  [${i}] ${(ep?.title as string)?.slice(0, 70).padEnd(70)} · ${segs.length} segments · ${card.total_relevant_seconds}s · ${card.surfaced_at}`,
      );
    });
    return;
  }

  const idx = Number(arg);
  const card = cards[idx];
  if (!card) {
    console.log(`No card at index ${idx}. Run with 'all' to list.`);
    return;
  }
  const ep = card.episodes as Record<string, unknown>;
  const podcast = ep?.podcasts as { name: string };
  const segments = (ep?.segments as Record<string, unknown>[]) ?? [];
  segments.sort(
    (a, b) => (a.start_seconds as number) - (b.start_seconds as number),
  );

  const w = "─".repeat(78);
  const sub = "·".repeat(78);
  console.log(`\n${w}`);
  console.log(`CARD ${idx}  ·  surfaced ${card.surfaced_at}`);
  console.log(w);
  console.log(`Podcast       : ${podcast?.name}`);
  console.log(`Episode title : ${ep?.title}`);
  console.log(`Published     : ${ep?.published_at}`);
  console.log(`Audio URL     : ${(ep?.audio_url as string)?.slice(0, 80)}…`);
  console.log(`Total time    : ${card.total_relevant_seconds}s  (${segments.length} segments)`);
  console.log("");
  console.log("Episode rollup (what the home-screen card text shows):");
  console.log(sub);
  console.log(card.episode_summary ?? "(no episode rollup)");
  console.log(sub);
  console.log("");
  console.log("Segments (what the expanded sheet shows):");
  console.log("");
  segments.forEach((s, i) => {
    const start = s.start_seconds as number;
    const end = s.end_seconds as number;
    const minStart = `${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")}`;
    const minEnd = `${Math.floor(end / 60)}:${String(end % 60).padStart(2, "0")}`;
    console.log(
      `  ── Segment ${String(i + 1).padStart(2, "0")} ─── ${minStart} – ${minEnd}  ` +
        `(${end - start}s)  ${s.speaker_name ?? ""}  [match: ${s.match_source}] ──`,
    );
    if (s.surfacing_entities && (s.surfacing_entities as unknown[]).length > 0) {
      console.log(`     entities : ${(s.surfacing_entities as string[]).join(", ")}`);
    }
    console.log(`     summary  : ${s.summary ?? "(none)"}`);
    const quotes = (s.pull_quotes as string[]) ?? [];
    if (quotes.length > 0) {
      console.log(`     quotes   :`);
      quotes.forEach((q) => console.log(`        " ${q} "`));
    }
    const bullets = (s.bullets as string[]) ?? [];
    if (bullets.length > 0) {
      console.log(`     bullets  :`);
      bullets.forEach((b) => console.log(`        · ${b}`));
    }
    console.log("");
  });
  console.log(w);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
