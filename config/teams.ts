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
  },
];
