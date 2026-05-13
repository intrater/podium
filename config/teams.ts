/**
 * Team registry. v1 ships one team (49ers); the structure carries the v2
 * multi-team shape so adding more teams is data, not architecture.
 *
 * Palettes are in OKLCH so contrast can be checked mathematically in U10's
 * design-system pass. The hex equivalents live in comments for human
 * reference; only the OKLCH strings flow into the database `palette` jsonb
 * column.
 */

export interface TeamPalette {
  /** Primary brand color — used for accents, focused states, and the team chip. */
  primary: string;
  /** Secondary brand color — used sparingly for highlights and gradients. */
  secondary: string;
  /** High-contrast color used for text on the primary surface. */
  onPrimary: string;
}

export interface Team {
  id: string;
  sport: "nfl" | "nba" | "mlb" | "nhl" | "ncaaf" | "ncaab";
  slug: string;
  name: string;
  palette: TeamPalette;
  /**
   * UTC months (1–12) that count as "in season" for this team. Months
   * NOT in this list use `offSeasonCadenceDays`. For sports whose
   * regular season spans the calendar year boundary (NFL: Sep–Feb),
   * include both halves of the wrap.
   */
  inSeasonMonths: readonly number[];
  /**
   * Days between scheduled ingest runs during off-season months. v1
   * default is 3 days for NFL (a typical off-season news cycle has
   * enough podcast content to make a digest worth running every few
   * days but not daily). In-season cadence is always 1.
   */
  offSeasonCadenceDays: number;
}

export const teams: readonly Team[] = [
  {
    id: "49ers",
    sport: "nfl",
    slug: "san-francisco-49ers",
    name: "San Francisco 49ers",
    palette: {
      // Faithful Red — #AA0000
      primary: "oklch(0.51 0.18 27)",
      // 49ers Gold — #B3995D
      secondary: "oklch(0.66 0.06 80)",
      // White text reads cleanly against the saturated red.
      onPrimary: "oklch(1 0 0)",
    },
    // NFL regular season + playoffs runs roughly Sep–early Feb. Include
    // both ends of the calendar-year wrap so the off-season pickup is
    // Mar–Aug (6 months in, 6 months off).
    inSeasonMonths: [1, 2, 9, 10, 11, 12],
    offSeasonCadenceDays: 3,
  },
];

/**
 * Resolve a team's effective cadence given a clock. In-season months
 * return 1 (daily); off-season months return the team's configured
 * off-season cadence. The DB column `teams.cadence_days` is reserved
 * for manual overrides — operationally the cron route reads from
 * config first and falls back to the DB value only if the team isn't
 * in config (a v2 admin-added team case).
 */
export function effectiveCadenceDays(team: Team, now: Date): number {
  const monthUtc = now.getUTCMonth() + 1; // 1–12
  return team.inSeasonMonths.includes(monthUtc) ? 1 : team.offSeasonCadenceDays;
}
