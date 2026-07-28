// How the goal-path line draws itself.
//
// The old version swept the whole curve in 1.5s on a symmetric ease — it read
// as an animation playing, not as something being assembled. This replaces it
// with explicit segments separated by short pauses, so the line visibly
// GATHERS: it inches out, catches, inches again, then opens up.
//
// The shape is deliberate and matches how the moment should feel:
//   0 → 50%   slow, with the longest pauses. This is the "working" stretch.
//   50 → 75%  pauses shorten, segments lengthen. Something is coming together.
//   75 → 100% no pauses, fastest segment, straight into the flag.
//
// Each segment start fires a haptic, so the stutter is felt as well as seen —
// the pause is what makes the next movement register as progress rather than
// as a bar sliding across.
//
// Pure and RN-free so the pacing can be unit-tested without a renderer.

import type { RampStyle } from '../../utils/hapticRamp';

export interface RevealSegment {
  /** Fraction of the curve this segment ends at, 0…1. */
  to: number;
  /** How long this segment takes. */
  durationMs: number;
  /** Dead time AFTER it, before the next one starts. 0 = run straight on. */
  pauseMs: number;
  /** Fired as the segment begins. */
  haptic: RampStyle;
}

/**
 * The draw plan. Ordered, ends exactly at 1, and never moves backwards.
 */
export function buildRevealSegments(): RevealSegment[] {
  return [
    // — gathering: short hops, long catches
    { to: 0.12, durationMs: 620, pauseMs: 170, haptic: 'soft' },
    { to: 0.26, durationMs: 560, pauseMs: 150, haptic: 'soft' },
    { to: 0.38, durationMs: 520, pauseMs: 130, haptic: 'light' },
    { to: 0.5, durationMs: 480, pauseMs: 110, haptic: 'light' },
    // — it starts to flow
    { to: 0.63, durationMs: 420, pauseMs: 80, haptic: 'medium' },
    { to: 0.75, durationMs: 380, pauseMs: 60, haptic: 'medium' },
    // — release, no more catches
    { to: 0.88, durationMs: 300, pauseMs: 0, haptic: 'rigid' },
    { to: 1, durationMs: 260, pauseMs: 0, haptic: 'heavy' },
  ];
}

/** Total wall-clock time including pauses. */
export function revealDurationMs(segments = buildRevealSegments()): number {
  return segments.reduce((sum, s) => sum + s.durationMs + s.pauseMs, 0);
}

/**
 * Average speed (fraction of the curve per second) over a slice of the plan.
 * Used to assert that the thing actually accelerates.
 */
export function averageSpeed(
  segments: RevealSegment[],
  fromIndex: number,
  toIndex: number,
): number {
  const slice = segments.slice(fromIndex, toIndex);
  if (slice.length === 0) return 0;
  const startFraction = fromIndex === 0 ? 0 : segments[fromIndex - 1]!.to;
  const distance = slice[slice.length - 1]!.to - startFraction;
  const millis = slice.reduce((sum, s) => sum + s.durationMs + s.pauseMs, 0);
  return millis === 0 ? 0 : (distance / millis) * 1000;
}
