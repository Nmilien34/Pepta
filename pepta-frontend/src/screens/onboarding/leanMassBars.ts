// The two-bar "where the weight comes from" chart, and how it builds itself.
//
// THE NUMBERS ARE REAL AND ONLY ONE IS QUANTIFIED. 39% is the top of the cited
// 25–39% range from the STEP-1 / SURMOUNT-1 body-composition analyses. The
// second bar is deliberately shorter but carries NO percentage, because we have
// no source for how much protein + pace recover, and no data at all comparing
// Pepta users to non-users. A "91% with us vs 45% without us" chart would be
// invented — it would fail the content-integrity tests and is exactly the kind
// of claim that draws 2.3.1 scrutiny on a health app. Do not add a number to
// the managed bar without a citation to hang it on.
//
// HOW IT ANIMATES. The bars do not grow from nothing. They start at a shared
// visible floor, so the first frame already looks like a chart, and then they
// diverge: the unmanaged bar climbs a long way, the managed one barely moves.
// The divergence IS the message, so it has to be watched rather than arrived
// at — starting from zero would read as a chart being drawn, not as a number
// getting worse. The unmanaged bar goes first and takes the longest; the
// managed bar answers it.
//
// Pure and RN-free so the plan can be unit-tested without a renderer.

import type { RampStyle } from '../../utils/hapticRamp';

export interface LeanMassBar {
  key: 'unmanaged' | 'managed';
  /** Final height as a fraction of the chart box, 0…1. */
  height: number;
  /** Height it starts at, same units. Never 0 — see the note above. */
  from: number;
  /** Wait after the chart appears before this bar moves. */
  delayMs: number;
  /** How long its climb takes. */
  durationMs: number;
  /** Fired as it settles. */
  haptic: RampStyle;
  /** Shown inside the bar. Absent = we have no sourced number for it. */
  label?: string;
  /** Under the bar. */
  caption: string;
  captionSub: string;
}

/** The shared starting height. Enough to read as a bar, low enough to climb. */
export const BAR_FLOOR = 0.22;

export function buildLeanMassBars(): LeanMassBar[] {
  return [
    {
      key: 'unmanaged',
      height: 0.78,
      from: BAR_FLOOR,
      delayMs: 0,
      // Slow and laboured — this is the bar the user is meant to WATCH grow,
      // so it is paced to be followed by the eye rather than registered after
      // the fact. Was 980ms, which read as a snap into position.
      durationMs: 1700,
      haptic: 'heavy',
      label: '39%',
      caption: 'Unmanaged',
      captionSub: 'lean mass',
    },
    {
      key: 'managed',
      height: 0.34,
      from: BAR_FLOOR,
      // Starts before the first bar lands, so it reads as an answer rather
      // than as a second, unrelated animation — but late enough that the two
      // climbs are told apart. Scaled with the first bar, not left behind it.
      delayMs: 1000,
      durationMs: 950,
      haptic: 'light',
      caption: 'Protein + pace',
      captionSub: 'tracked weekly',
    },
  ];
}

/** When the last bar finishes moving — the cue for Pep's line to appear. */
export function leanMassSettleMs(bars = buildLeanMassBars()): number {
  return bars.reduce((max, b) => Math.max(max, b.delayMs + b.durationMs), 0);
}
