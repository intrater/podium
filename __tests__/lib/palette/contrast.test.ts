/**
 * WCAG contrast regression guard on every team palette.
 *
 * The 49ers v1 palette ships hand-checked, but future teams (Giants,
 * Warriors, Sharks) get added by editing `config/teams.ts` data — without
 * a contrast check, a too-light or too-saturated palette would silently
 * fail readability. This test fails CI when that happens.
 *
 * Two thresholds, both anchored in WCAG 2.1:
 *
 *   - onPrimary vs primary  ≥ 4.5  (AA body text — applies to button labels,
 *                                    the team chip text, focused-state copy)
 *   - primary  vs background ≥ 3.0  (AA UI components / large text — applies
 *                                    to the team accent as a surface against
 *                                    the deepest dark tone)
 *
 * We intentionally do NOT require primary ≥ 3.0 against every surface tier
 * (card at L=0.18, popover at L=0.22). Saturated team colors against
 * slightly-elevated near-black sit at the edge of 3.0:1 — testing all three
 * would force pale-team-color compromises with no real-world benefit, since
 * the team accent is layered on the deepest surface in practice.
 */

import { describe, expect, it } from "vitest";

import { teams } from "@/config/teams";

/** OKLCH dark-surface background — keep in sync with `app/globals.css`. */
const BACKGROUND_OKLCH = "oklch(0.14 0 0)";

interface Oklch {
  L: number;
  c: number;
  h: number;
}

function parseOklch(input: string): Oklch {
  // Accepts `oklch(L C H)` and `oklch(L C H / A)`; alpha ignored for contrast.
  const m = input.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`Cannot parse OKLCH: ${input}`);
  return { L: parseFloat(m[1]), c: parseFloat(m[2]), h: parseFloat(m[3]) };
}

/**
 * OKLCH → linear sRGB via OKLab.
 *
 * Matrix constants are Björn Ottosson's published values (the OKLab paper).
 * Linear sRGB values may fall outside [0, 1] for OKLCH colors that aren't
 * in the sRGB gamut; we don't clip here because the goal is the luminance
 * computation downstream, which uses the linear values directly.
 */
function oklchToLinearSrgb({ L, c, h }: Oklch): [number, number, number] {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const lCubed = l_ ** 3;
  const mCubed = m_ ** 3;
  const sCubed = s_ ** 3;

  return [
    4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
  ];
}

/** Per WCAG 2.1, relative luminance = 0.2126·R + 0.7152·G + 0.0722·B on
 *  linear-light channels. We feed clamped values to keep luminance in [0,1]. */
function relativeLuminance(oklch: string): number {
  const [r, g, b] = oklchToLinearSrgb(parseOklch(oklch));
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(colorA: string, colorB: string): number {
  const a = relativeLuminance(colorA);
  const b = relativeLuminance(colorB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("palette contrast (WCAG)", () => {
  it.each(teams.map((t) => ({ team: t })))(
    "$team.id — onPrimary vs primary clears 4.5:1 (AA body text)",
    ({ team }) => {
      const ratio = contrastRatio(team.palette.onPrimary, team.palette.primary);
      expect(
        ratio,
        `${team.id}: onPrimary on primary = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(teams.map((t) => ({ team: t })))(
    "$team.id — primary vs background clears 3.0:1 (AA UI components)",
    ({ team }) => {
      const ratio = contrastRatio(team.palette.primary, BACKGROUND_OKLCH);
      expect(
        ratio,
        `${team.id}: primary on background = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3.0);
    },
  );

  it("contrast helper agrees with the spec on a known pair (white on black)", () => {
    // Sanity check on the math: white on black is 21:1 by definition.
    const ratio = contrastRatio("oklch(1 0 0)", "oklch(0 0 0)");
    expect(ratio).toBeCloseTo(21, 0);
  });
});
