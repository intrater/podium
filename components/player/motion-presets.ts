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
