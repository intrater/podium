# Podium v2 — editorial direction

Captured during the 2026-05-17 brainstorm. This document is the
editorial reframe that shifts Podium from a coverage product (summarize
everything every podcast said about the team) to an **analysis product**
(surface what notable voices are saying about the team that a fanatic
might have missed).

This is intentionally a brainstorm doc, not a plan. The corresponding
`/ce-plan` output is the next artifact and references this one.

## The reframe in one line

> Podium isn't "catch up on 150 minutes of podcasts in 2 minutes."
> Podium is **"make sure I didn't miss what the smart voices said about
> my team."**

The first framing is efficiency. The second is editorial. The user has
explicitly rejected the first as the wrong product.

## Target reader

The fanatic. Already plugged into their team. Already saw the news on
Twitter at 9 AM. By 9:01 they want the takes, not the recap. Multi-team
fanatics (their NFL team + their NBA team + a fantasy-driven secondary)
are the natural depth users — the same product just stacks.

Explicitly *not* designing for the casual fan in v1. A casual fan can
get the news anywhere; Podium's value is for people who already know
the news and want the conversation around it.

## Rhythm

Daily morning read. 24-hour window — what was discussed yesterday. The
existing 11:00 UTC cron (4 AM PT) is already the right cadence: by the
time the user's coffee is ready, last night's discourse is processed.

Promise to the user: *if it mattered yesterday, you'll see it here.*

## Two card types

Sports podcast content has two distinct patterns that need different
surfacing logic. One card type would compromise both; treating them
separately keeps each honest.

### Theme cards (the conversation)

A theme card surfaces when ≥ N curated podcasts discussed the same
topic in the 24-hour window. The topic header serves as *validation*
("8 podcasts on the Australia trip" tells the user they're plugged in
correctly — they didn't miss what everyone is discussing). The
**actual value is inside the card**: what each notable voice
specifically said, with their sharp quote pulled, not a polite
summary written around it.

### Notable take cards (the singular take)

A solo Tier-A voice surfaces even with no cross-source backing because
Mina Kimes ranking Shanahan is itself the signal. Tier-C solo takes
never surface alone — random Locked On opinion isn't important enough
to earn the user's morning without cross-source corroboration.

## Novelty gate — at the take level, not the topic level

The single most important editorial heuristic, and the one that
distinguishes Podium from "AI-summarizes-podcasts" generic.

A take surfaces only if it represents *movement* — a new voice
entering the debate, a new fact dropped, a contrarian turn, a clear
shift in a voice's position from what they've said before. If today
is just "people are still saying the same things about Purdy,"
nothing surfaces. **Something has to be new today, or get out of the
user's morning.**

Crucially: novelty is at the *take* level, not the *topic* level.
The fanatic already knows the topics. "Purdy contract is being
discussed" isn't novel. "Mina just flipped — peer comp says he's
underpaid" is novel.

Implication: this requires **voice memory.** The system has to
remember what positions each voice has previously argued so it can
detect when a voice shifts. Without voice memory, "novelty" collapses
to topic-level uniqueness and the product feels stuck.

Side benefit: novelty detection also produces *delta copy* for free
("Mina just flipped the consensus") which directly drives card
voice.

## Voice — fan-of-this-team, not loud

Podium itself has voice. It's not a neutral window onto podcast
extracts — it's a publication with a perspective. But the perspective
is the *fan's*, not the maker's, and the volume is subtle.

The voice's job: **contextualize why this info matters to this fan**.
"They're talking about the Mexico City trip" → flat. "The Mexico
City trip is load-bearing — old team, most travel miles of any
season, fan anxiety about February" → that sounds like a fan who's
been paying attention.

The voice needs grounding to work. Without team context, it falls
back to generic sports-blog cadence, which the reader will smell
immediately. The voice and the team brain are the same system viewed
from two angles.

## Stateful team brain + voice memory

The most ambitious system component. Podium maintains a running model
per team and per Tier-A voice, continuously updated, fed into every
extraction / clustering / card-writing step.

**Per-team brain** tracks:
- Roster context (age profile, key players, injuries, depth charts)
- Season-to-date storyline (record, trend, key moments)
- Active narrative arcs (Purdy contract, Shanahan playoff history, WR
  drama, etc.)
- Recent themes (last 60–90 days of discourse)
- Fan psychology — what fans of this team obsess over, what triggers
  them, what their hopes / fears are this cycle

**Per-voice memory** tracks:
- What positions has Mina previously argued? When did she shift?
- What's Bill Simmons's running narrative about this team?
- Who's been quiet on this team recently?

Maintenance: a weekly summarization job that distills accumulated
themes + manual injection of key facts (trades, injuries, signings).
Probably needs some lightweight admin UX so the maker can keep it
honest. v1 may stub this with hand-curated team-brain docs and
defer the auto-maintenance to v2.

## Catalog tiering

The single piece of editorial work the user accepts as one-time and
coarse:

- **Tier A** — named voices, opinion-driven. Mina Kimes Show, Bill
  Simmons Podcast, Pat McAfee Show, The Athletic Football Show,
  Football 301, possibly The Ringer NFL Show.
- **Tier B** — national/regional coverage with real reporting. PFT
  Live, Rich Eisen, MMQB, Get Up, Heed the Call, Move the Sticks,
  Pardon My Take.
- **Tier C** — daily local treadmills. Locked On 49ers, Gold
  Standard, 49ers Talk, Section 415, Krueg Show, KNBR, Leeds View.

Tier A is the product spine — fanatics open Podium specifically for
these voices. Tier B is real coverage that often clusters with Tier
A. Tier C is mostly a *frequency-signal* layer — its participation
in a theme helps the theme bubble up, but a solo Tier-C take never
surfaces alone.

## Architecture posture

The schema already supports multi-team / multi-user / multi-sport
(per existing CLAUDE.md). v1 ships single-team / 49ers, but every
design decision in v2 should hold up under multi-team:

- Themes might span teams (e.g., Tice ranking rookie QBs across the
  league). Need cross-team theme dedupe so the same theme doesn't
  appear three times for a user who follows three teams.
- Voice memory is global, not team-scoped. Mina's running model of
  the 49ers and her running model of the Patriots are both stored,
  composable per user's followed teams.
- Team brains are team-scoped. Each team gets its own.

## Failure modes to design against

Ordered by likelihood, based on the dealbreaker discussion:

1. **Take-level repetition.** The user sees a Mina position they
   already knew Mina held, or sees the same Purdy take Mon / Tue /
   Wed with cosmetic reframes. The novelty gate failed. **This is
   the primary dealbreaker.** Voice memory has to actually catch
   "she's said this before" and suppress.
2. **Stale or wrong team brain.** Voice says things that feel
   off-period — "Hardy is finally healthy" when he just re-injured.
   Erodes trust irreversibly. Maintenance hygiene matters.
3. **Voice misses.** Tries to be smart-fan-friend, lands as AI
   imitating a sports blog. Tone is a small target.
4. **Manufactured aggregation.** "8 podcasts discussed Mexico City"
   when all 8 are downstream of the same news drop. Nuzzle signal
   is fake when the cluster is just news-cycle echo. We need to
   distinguish "8 voices independently engaging" from "8 voices
   reacting to the same article."
5. **Sharp quote, tepid excerpt.** Mina says something pointed; the
   card gives you a polite summary instead of the line itself. The
   quote IS the value; framing is context. Card-writer must
   prioritize verbatim sharp content over generated paraphrase.

## What v1 (single-team / 49ers) should validate before v2 scales

- Does the two-card model produce a digest that *feels* curated
  vs. *feels* generic?
- Does the novelty gate's "voice memory" actually catch
  repetition? Or does the user start seeing the same Mina take
  twice in a week?
- Does the team-brain-grounded voice land as a fan, or as AI
  imitating a fan?
- What's the right N for theme cards (3? 5?) — and does it vary
  by topic type (news cycle vs. opinion cycle)?
- Does the multi-team UX hold up when the user adds team #2, or
  do new design decisions emerge there?

## Out of scope for this brainstorm

- Notifications / push (email when interesting things land) — a real
  product layer but separate from editorial design.
- Reading-list / save-for-later behaviors — orthogonal.
- Social / sharing — orthogonal.
- Audio playback redesign — the existing player is fine; this brainstorm
  is about *what surfaces*, not *how it plays*.

## Next artifact

A `/ce-plan` output that operationalizes this direction into
implementation units, with v1-scoped milestones and explicit
dependencies on the per-team brain and per-voice memory systems.
