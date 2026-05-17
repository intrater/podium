/**
 * Hand-curated 49ers team brain seed.
 *
 * Initial v1 payload assembled 2026-05-17 from current public sources
 * (ESPN, NFL.com, 49ers.com, NinerNoise, Yahoo Sports, Pro Football
 * Reference) — grounded facts only, no model speculation. The maker
 * has reviewed; corrections land via direct edit + re-run.
 *
 * Usage:
 *   npm run seed:team-brain
 *
 * Idempotent — upserts on team_id. Re-running overwrites the payload
 * and stamps a fresh updated_at; safe to run as many times as needed
 * to iterate the content during dogfooding.
 */

import { createClient } from "@supabase/supabase-js";

import {
  TEAM_BRAIN_PROMPT_VERSION,
  type TeamBrain,
} from "../lib/team-brain/types.ts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export const niners49ers: Omit<TeamBrain, "updated_at"> = {
  team_id: "49ers",
  team_name: "the 49ers",
  sport: "NFL",
  season_context:
    "May 2026 offseason. The 2025 season ended in February with a 6–41 Divisional Round loss to the Seahawks — the second-worst playoff defeat in franchise history. The 2026 NFL Draft (April) is complete. The 2026 schedule was released May 14. Currently between the draft and OTAs/training camp.",
  season_storyline: [
    "The 2025 season was a return to the playoffs after a one-year absence, with the team going 12–5 and finishing 2nd in the NFC West behind the Rams. The regular season trajectory was a slow build — early-season inconsistency around Purdy's adjustments to a depleted receiver corps, mid-season stability once Christian McCaffrey was fully healthy, and a strong December that established the team as a legitimate NFC threat once again.",
    "A 23–19 Wild Card win over the Eagles felt like a return to form, with Purdy navigating Philadelphia's pass rush competently and McCaffrey carrying the offense on the ground. But George Kittle tore his Achilles in that game, and the team got blown out 6–41 the following week in Seattle. The Divisional Round score line was the lowest moment in franchise playoff history in over two decades — at home, with the conference championship in reach, the offense scored a single touchdown and the defense surrendered four. It framed every conversation that followed.",
    "The 2026 offseason has been a structural reset. Brock Purdy signed a 5-year, $265M extension ($181M guaranteed, ~$53M AAV — tied for 7th in the NFL), formally locking the QB position. To pay for it, the front office moved on from large swaths of the previous Super Bowl-window roster: Deebo Samuel and Jordan Mason were traded, and Javon Hargrave, Leonard Floyd, Talanoa Hufanga, Charvarius Ward, Aaron Banks, and Jaylon Moore all departed in free agency. Deebo's departure in particular was treated as the symbolic end of the 2019–2024 contender era — a beloved figure, a personality, a player whose body language defined the offense.",
    "In their place: Mike Evans on a 3-year, $60.4M deal at WR (a 33-year-old whose red-zone production is the bet); Christian Kirk on a 1-year prove-it for the slot; Osa Odighizuwa traded in from Dallas for a 3rd-round pick to anchor the interior defensive line; Nate Hobbs at CB on a 1-year deal; Dre Greenlaw on a 1-year return to the linebacker corps. Trent Williams re-signed after a public contract standoff (2 years, $50M / $37M guaranteed) — a saga that dominated April and produced multiple weeks of 'will he retire' speculation before resolving. The result is a meaningfully different roster — same coaching staff, same QB, same identity ambition, but a depth chart that no longer looks like the 2023 Super Bowl team.",
    "The 2026 schedule is brutal: about 38,000 miles traveled (most in the league this year and a franchise record), 5 primetime games, two Thursday games, and a Week 11 'home' game in Mexico City against the Vikings on Sunday Night Football. The travel grind is the defining external constraint on the season — particularly for an aging roster recovering from significant injuries.",
    "Health is the wild card. Nick Bosa's ACL recovery and George Kittle's Achilles recovery are the two storylines that will dominate training camp coverage. Both reportedly tracking toward Week 1 availability, but with realistic uncertainty. The team's ceiling depends on both being themselves; the floor scenario is one or both returning at reduced capacity, which would compound the roster-talent loss and probably end the championship window outright.",
  ].join(" "),
  roster: [
    // Offense — skill
    {
      name: "Brock Purdy",
      role: "QB",
      note: "Just signed 5yr/$265M extension; the era's defining bet",
    },
    {
      name: "Christian McCaffrey",
      role: "RB",
      note: "Health on watch after 2024 injury year; shoulder stinger late in 2025 was minor",
    },
    {
      name: "George Kittle",
      role: "TE",
      note: "Torn Achilles in 2025 Wild Card; hopeful but uncertain for Week 1",
    },
    {
      name: "Mike Evans",
      role: "WR",
      note: "New: 3yr/$60.4M signing, replaces Deebo as the WR1-by-paycheck",
    },
    {
      name: "Christian Kirk",
      role: "WR",
      note: "New: 1yr prove-it deal, slot/possession",
    },
    {
      name: "Ricky Pearsall",
      role: "WR",
      note: "Year-2 ascending; expected larger role with Deebo gone",
    },
    {
      name: "De'Zhaun Stribling",
      role: "WR",
      note: "2026 draft pick; depth/development",
    },
    {
      name: "Kaelon Black",
      role: "RB",
      note: "2026 draft pick; depth behind McCaffrey",
    },
    // Offense — line
    {
      name: "Trent Williams",
      role: "LT",
      note: "Re-signed 2yr/$50M after offseason standoff; 12x Pro Bowler",
    },
    {
      name: "Vederian Lowe",
      role: "OL",
      note: "New: 2yr deal, swing tackle",
    },
    {
      name: "Brett Toth",
      role: "OL",
      note: "New: 1yr depth",
    },
    {
      name: "Enrique Cruz Jr.",
      role: "OL",
      note: "2026 draft pick; OL project",
    },
    // Defense
    {
      name: "Nick Bosa",
      role: "DE",
      note: "ACL injury mid-2025; 'around training camp' return timeline; Week 1 still in play",
    },
    {
      name: "Osa Odighizuwa",
      role: "DL",
      note: "Traded in from Dallas for 2026 3rd-round pick",
    },
    {
      name: "Mykel Williams",
      role: "DL/Edge",
      note: "Recovering from injury; reported on schedule",
    },
    {
      name: "Alfred Collins",
      role: "DL",
      note: "Had offseason surgery; depth chart uncertainty",
    },
    {
      name: "Dre Greenlaw",
      role: "LB",
      note: "Re-signed on a 1-year deal",
    },
    {
      name: "Nate Hobbs",
      role: "CB",
      note: "New: 1yr signing",
    },
    {
      name: "Ephesians Prysock",
      role: "DB",
      note: "2026 draft pick",
    },
    {
      name: "Romello Height",
      role: "LB/Edge",
      note: "2026 draft pick; hybrid defender",
    },
    // Coaching / front office
    {
      name: "Kyle Shanahan",
      role: "Head Coach",
      note: "9th season; 3 Super Bowl losses (1 as OC, 2 as HC, all with a 10-pt lead); playoff finishing is the open question of his career",
    },
    {
      name: "John Lynch",
      role: "General Manager",
      note: "Architect of the post-Deebo roster reset",
    },
  ],
  narrative_arcs: [
    {
      label: "Purdy now paid",
      summary:
        "The 5yr/$265M extension formally ends the 'last-pick bargain' era and starts the 'tied for 7th-highest-paid QB in the NFL' era. Every Purdy performance now reads through 'is he worth $53M AAV.' The contract carries $181M guaranteed and runs through 2030 — there's no easy exit if it doesn't work. Expect every podcast take to land somewhere on the 'overpaid versus right-sized' axis, with peer comp to Burrow, Hurts, Goff, and Tua as the recurring reference points. The contract also constrains future spending; every other Niners signing for the next three years gets read as 'what they can afford with Purdy's cap hit.'",
      state: "hot",
    },
    {
      label: "The Seattle blowout",
      summary:
        "The 6–41 Divisional Round loss to the Seahawks is the open wound. It reframes Shanahan's playoff narrative not as 'close in Super Bowls' but as 'one game from the conference championship and got run off the field at home.' The discourse around 'is the window closing' starts here. Specific fan obsessions: the early-game defensive collapse, the offensive line getting overwhelmed without a healthy Kittle, the lack of halftime adjustments, and Seattle's willingness to be physical in ways the 49ers couldn't answer. Every preseason narrative for 2026 implicitly references this game as the baseline the team has to climb back from.",
      state: "simmering",
    },
    {
      label: "Roster reset, identity reset",
      summary:
        "Deebo Samuel was a personality and a brand — the swagger of the offense and a player whose presence shaped how the 49ers were covered. Hargrave, Floyd, Hufanga, Ward, and Banks were core contributors during the Super Bowl run. They're all gone. The 2026 roster is structurally different and the team's identity has to be rebuilt — by the same coaching staff, with a different supporting cast, around a now-expensive QB. The open question every podcast will return to: is this still the Shanahan-era 49ers, or is this the start of a different team that happens to share a coach and a quarterback?",
      state: "hot",
    },
    {
      label: "Shanahan's playoff demons",
      summary:
        "Three Super Bowl appearances, three losses, all after holding a 10-point lead. Now compounded by the 41–6 Divisional blowout. The 'great offensive mind, can he finish?' debate has been live for years; the question now is whether Shanahan ever wins one, or whether the franchise eventually moves on. Shanahan himself has invoked his father Mike Shanahan's career arc (lost his first three Super Bowls as an OC, then won his next three) as a comparison, which fans alternately read as confidence-inspiring or delusional. Career playoff record: 8-4 (.667), highest in NFL history without a championship.",
      state: "simmering",
    },
    {
      label: "Travel grind",
      summary:
        "The 49ers will travel about 38,000 miles in 2026 — the most in the NFL and a franchise record — including a Week 11 'home' game in Mexico City against the Vikings on Sunday Night Football. Two Thursday games on short rest, five primetime games stacking the prep load, and a far-flung opener that sets the tone. The fatigue compounds on an older roster recovering from significant injuries. Beat writers and national voices alike will read every late-season slump through the 'they traveled too much' lens.",
      state: "hot",
    },
    {
      label: "Bosa and Kittle return",
      summary:
        "Nick Bosa's ACL recovery (mid-2025 injury) and George Kittle's Achilles recovery (2025 Wild Card injury) are the two health storylines that will dominate training camp coverage. GM John Lynch has publicly said both are tracking toward Week 1 availability — Bosa 'around training camp' for full return, Kittle 'progressing at a good rate.' But Achilles and ACL injuries at their ages are not minor: realistic timelines include a partial Week 1 return, a midseason ramp, or full miss. The team's ceiling depends on both being themselves. The floor scenario — one or both at reduced capacity — would compound the roster-talent loss.",
      state: "simmering",
    },
    {
      label: "Trent Williams contract standoff",
      summary:
        "Williams's offseason holdout and reported retirement talk dominated March and April. Multiple beat reporters speculated on whether the 12-time Pro Bowl LT would actually walk away. Resolved with a 2yr/$50M deal ($37M guaranteed) before the draft. The arc is technically cold but will come back the moment LT play falters, or when the next aging star (Kittle? Bosa?) approaches a contract decision. This is also the third high-profile Niners contract drama in three years (Aiyuk, Deebo, Williams) — a pattern that's becoming a fan-base trauma.",
      state: "cold",
    },
    {
      label: "Mike Evans bet",
      summary:
        "Signing a 33-year-old Mike Evans to a 3-year, $60.4M deal in the same offseason as the Purdy extension is a 'go for it now' move. The bet is that Evans's red-zone production (his career calling card) and Purdy's QB jump elevate the offense enough to outweigh the defensive talent drain. Will be re-litigated weekly when Evans either dominates the red zone or fails to separate against young corners. Combined with Christian Kirk in the slot and Pearsall ascending, the WR room is built around Evans being Evans for one more year.",
      state: "simmering",
    },
    {
      label: "Defensive identity rebuild",
      summary:
        "The defense loses Hargrave (interior pressure), Floyd (edge depth), Hufanga (safety physicality), and Ward (CB1 coverage) and replaces them with Odighizuwa (traded in), Hobbs at CB, Greenlaw back, and rookies. The line is the strength again with Bosa returning; the back end is the question. DC continuity matters — same scheme, different bodies — but the personnel turnover is steep. Will be a recurring theme in every defensive evaluation podcast: 'does this defense have a top-10 ceiling or is it a middle-of-the-pack unit now?'",
      state: "simmering",
    },
    {
      label: "Ricky Pearsall ascending",
      summary:
        "Year-2 WR Pearsall enters a season with Deebo gone and a clear path to a larger role. He showed late-season flashes in 2025 and the coaching staff has signaled he'll be a featured player. Whether he becomes a legitimate WR2 or settles in as a high-floor complementary piece is one of the season's quieter make-or-break questions. If Pearsall pops, the WR room can survive Evans being a one-year rental. If he doesn't, the offense gets thinner faster than expected.",
      state: "simmering",
    },
  ],
  fan_psychology: [
    "We live in the shadow of close-but-not-quite. Three Super Bowls under Shanahan, three losses with double-digit leads. The fear isn't that the team is bad — it's that the team is *almost*, and 'almost' is the most painful place to be in pro sports. Every late-season win is shadowed by the question of whether it sets up another February heartbreak.",
    "The Lance fallout still haunts. Drafting Trey Lance #3 overall in 2021, trading away three first-round picks to get him, watching him fail to take the job from Jimmy G, and then having Purdy emerge from Mr. Irrelevant — it's the franchise's strangest origin story. Every Purdy take is implicitly a Lance take. Every 'is Purdy a system QB' debate is the discourse trying to relitigate the 2021 draft.",
    "We don't trust late-game execution. Clock management, halftime adjustments, fourth-quarter defensive collapses. Shanahan's offensive genius is unquestioned; his closing instincts are the fan-base's chronic anxiety. The Super Bowl LIV second-half collapse, Super Bowl LVIII's overtime decisions, and the 41-6 Seattle loss are all cited as evidence in the same recurring argument.",
    "We have a complicated relationship with our stars. Deebo and Aiyuk both had contract drama. Trent Williams just had his. The pattern of 'beloved player → public negotiation → team or player walks away unsatisfied' has happened so often it's become a recognizable fan trauma. The trades-of-stars-for-cap-relief era now feels structural, not incidental.",
    "We're a 'they always find a way' team that just had its 'they actually fell apart' moment. The 41-6 loss to Seattle wasn't a close defeat — it was a thrashing. Fans are still processing whether that game was an aberration or a turning point, and the answer probably shapes whether the 2026 season feels like a continuation of the contender era or the start of something post-contender.",
    "The window obsession is intense. We've been told the championship window is open since 2019. It's now 2026. Every offseason move is read through 'is this enough to win it before it closes?' Fans treat each year as potentially the last shot, which makes both optimism and dread feel acute.",
    "We're an 'offense first' identity team in our hearts even when the defense has been the actual driver of playoff success. Shanahan's scheme, McCaffrey's versatility, Kittle's energy, Trent Williams's dominance up front — these are the things fans talk about when they describe what 'Niners football' is. Defensive accomplishments often get under-credited until the defense fails, at which point the discourse rotates back hard.",
    "We have a chip about national perception. The franchise lives partly in the shadow of the Cowboys and Eagles in NFC mindshare, and longtime fans bristle at coverage they consider dismissive of the Bay Area or condescending to the Shanahan-Lynch era. National pundits underrating the team is a recurring grievance; national pundits overrating the team produces an opposite anxiety about being a hype-team that disappoints in January.",
    "We obsess over the offensive line. The Trent Williams contract drama landed harder for Niners fans than for any other fanbase precisely because the OL is treated as the soul of the offense. McCaffrey's success, Purdy's clean pockets, the play-action game — all read as products of OL dominance. Any LT or center conversation triggers more anxiety than the position group would normally warrant.",
    "We've internalized a 'we're tougher than we look' identity. The franchise's modern reputation includes a willingness to be physical, run the ball, and out-condition opponents in late-game situations. When games go the other way — when the team gets out-physicaled or out-conditioned, as in the Seattle blowout — it lands as an identity failure, not just a tactical one.",
  ],
  recent_themes: [], // Populated by U10 weekly update; intentionally empty at seed.
};

async function main() {
  const payload = niners49ers;

  const { error } = await supabase.from("team_brain").upsert(
    {
      team_id: payload.team_id,
      payload,
      prompt_version: TEAM_BRAIN_PROMPT_VERSION,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "team_id" },
  );
  if (error) {
    console.error("seed-team-brain failed:", error.message);
    process.exit(1);
  }

  console.log("Team brain seeded:");
  console.log(`  team_id:        ${payload.team_id}`);
  console.log(`  roster entries: ${payload.roster.length}`);
  console.log(`  narrative arcs: ${payload.narrative_arcs.length}`);
  console.log(`  fan psychology: ${payload.fan_psychology.length}`);
  console.log(`  prompt_version: ${TEAM_BRAIN_PROMPT_VERSION}`);
}

// Only run main() when invoked directly (not when imported as a module —
// the debug-cache script imports `niners49ers` and we don't want that
// to trigger an unintended re-seed).
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
