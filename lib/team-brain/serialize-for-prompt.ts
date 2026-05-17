import type { TeamBrain } from "./types";

/**
 * Render a team brain as a stable text block suitable for use as the
 * cacheable system prefix on Anthropic calls.
 *
 * **Determinism contract.** Same input → identical output byte-for-byte.
 * No timestamps, no random ordering, no environment-dependent text.
 * Fields render in declaration order so reordering the input does
 * not perturb the cache prefix.
 *
 * **Excluded fields.** `updated_at` is intentionally NOT serialized
 * — the prompt prefix must stay byte-stable across days so the cache
 * keeps firing.
 *
 * **Target length.** ≥4,096 tokens once the brain is fully populated.
 * Haiku 4.5 silently disables prompt caching below this threshold
 * (see docs/solutions/2026-05-13-anthropic-haiku-4-5-cache-minimum.md).
 * The seed payload is sized to clear it; bare/incomplete brains will
 * not.
 */
export function serializeBrainForPrompt(brain: TeamBrain): string {
  const sections: string[] = [];

  // 1. Identity + framing — same on every call, every team. Helps cache
  //    coverage for any future multi-team work.
  sections.push(
    [
      `You are Podium, an editorial digest of NFL podcast discourse for`,
      `serious fans of ${brain.team_name}. Your job is not to recap the`,
      `news (a fanatic already saw it on Twitter at 9 AM). Your job is`,
      `to surface what the smart podcast voices are saying — and to do`,
      `so in the voice of a knowledgeable ${brain.team_name} fan, not a`,
      `neutral observer.`,
      ``,
      `Below is your running model of the team. Use it to ground every`,
      `read: when you see a podcast moment, ask "what does this mean`,
      `for ${brain.team_name}, given what I already know about where`,
      `they are this year?" The brain is the answer to that question.`,
    ].join(" "),
  );

  // 2. Team identity card.
  sections.push(
    [
      "## Team",
      `- Name: ${brain.team_name}`,
      `- Sport: ${brain.sport}`,
      `- Season context: ${brain.season_context}`,
    ].join("\n"),
  );

  // 3. Season storyline — the running narrative.
  sections.push(["## Season storyline", brain.season_storyline].join("\n\n"));

  // 4. Notable roster.
  const rosterLines = brain.roster.map((entry) => {
    const note = entry.note ? ` — ${entry.note}` : "";
    return `- **${entry.name}** (${entry.role})${note}`;
  });
  sections.push(["## Notable roster", ...rosterLines].join("\n"));

  // 5. Active narrative arcs — the recurring debates.
  const arcBlocks = brain.narrative_arcs.map((arc) => {
    const stateTag = arc.state ? ` [${arc.state.toUpperCase()}]` : "";
    return `### ${arc.label}${stateTag}\n${arc.summary}`;
  });
  sections.push(["## Active narrative arcs", ...arcBlocks].join("\n\n"));

  // 6. Fan psychology — what this fanbase obsesses over.
  const psychLines = brain.fan_psychology.map((line) => `- ${line}`);
  sections.push(["## Fan psychology", ...psychLines].join("\n"));

  // 7. Recent themes — populated by the weekly brain-update job.
  //    Always render the heading so the prefix shape is stable even
  //    when this list is empty (no shape drift between seed day and
  //    week-2 day).
  if (brain.recent_themes.length > 0) {
    const themeLines = brain.recent_themes.map((theme) => {
      const hot = theme.hot ? " [HOT]" : "";
      return `- **${theme.label}**${hot} — first seen ${theme.first_seen}, last seen ${theme.last_seen}`;
    });
    sections.push(["## Recent themes (rolling)", ...themeLines].join("\n"));
  } else {
    sections.push(
      [
        "## Recent themes (rolling)",
        "_No themes surfaced yet. This section populates as Podium runs._",
      ].join("\n"),
    );
  }

  // 8. Closing reminder — keeps the prefix purposeful when it's
  //    consumed by a downstream prompt that adds its own instructions.
  sections.push(
    [
      "## Voice reminder",
      `- Write like a ${brain.team_name} fan who has watched every game and listened to every podcast.`,
      "- Subtle attitude, not loud. Aware why this team's fans care about each story.",
      "- Never recap the news; assume the reader already saw it.",
      "- Lead with the take, not the topic.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
