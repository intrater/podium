/**
 * Shared Motion (motion/react) transition primitives.
 *
 * Co-located with the audio player since it's the primary consumer in v1.
 * The digest grid and feedback bar import from here too — keeping motion
 * defaults in one place keeps animation feel coherent across surfaces.
 *
 * Reduced-motion: components that animate should branch on Motion's
 * `useReducedMotion()` hook and replace these transitions with a 0ms tween
 * (or skip the animation entirely). The CSS-side fallback in
 * `app/globals.css` collapses `--motion-duration-*` tokens, but JS-driven
 * springs need explicit handling at the call site.
 */

import type { Transition } from "motion/react";

/**
 * Springs ready to drop into Motion's `transition` prop.
 *
 *   - `gentle`  — Arc-like feel. Use for layout settles, card expansion,
 *                 the scrubber thumb returning to playhead position.
 *   - `snappy`  — More immediate. Use for button presses, taps, and
 *                 anything where the user expects a direct response.
 */
export const springs = {
  gentle: { type: "spring", stiffness: 120, damping: 14 },
  snappy: { type: "spring", stiffness: 220, damping: 22 },
} as const satisfies Record<string, Transition>;

/**
 * Cubic-bezier easings for tween-style transitions.
 *
 *   - `out` — Standard "decelerate into rest" curve. Pairs well with
 *             opacity/transform transitions where a spring would over-shoot.
 */
export const easings = {
  out: [0.32, 0.72, 0, 1],
} as const;

/**
 * Standardized durations (seconds, Motion's unit) matched to the CSS
 * `--motion-duration-*` tokens so JS- and CSS-driven motion line up.
 */
export const durations = {
  fast: 0.12,
  base: 0.2,
  slow: 0.36,
} as const;
