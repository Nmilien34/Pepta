// The "your week has a shape" beat: which symptom the curve is titled for,
// whether to show it at all, and how the line draws itself.
//
// WHAT THIS SCREEN CLAIMS, AND WHAT IT DOES NOT. It draws ONE curve — the
// documented arc of GI side effects after a dose change: they cluster around
// escalation and attenuate with time. There is deliberately no second "without
// Pepta" line. The competitor screen this is modelled on draws a high
// "without tracking" curve against a low branded one, which asserts that using
// the app roughly halves side-effect intensity. No such data exists, for them
// or for us, and it is the same invented comparison refused on the lean-mass
// bars (see leanMassBars.ts). The differentiator is carried by the copy — we
// tell you where on the curve you are standing, which is a promise the symptom
// log actually keeps — not by a fabricated second line. Do not add one.
//
// Pure and RN-free so both the gating and the pacing unit-test in plain Node.

import type { SideEffectType } from '@pepta/shared';
import type { RampStyle } from '../../utils/hapticRamp';

/**
 * Symptoms whose intensity genuinely follows a post-dose rise-and-ease arc,
 * best first. Ordering is how the card picks its title when several are
 * selected: nausea is the most-reported and the most clearly dose-linked.
 */
export const CURVED_EFFECTS: readonly SideEffectType[] = [
  'nausea',
  'diarrhea',
  'reflux',
  'bloating',
  'sulfur_burps',
  'appetite_suppression',
  'fatigue',
  'headache',
  'constipation',
];

/**
 * The three that are deliberately absent, and why:
 *   hair_loss              — a downstream consequence of rapid loss over
 *                            months, not something that rises and eases with
 *                            a dose. Drawing it on this curve would be wrong.
 *   injection_site_reaction — tied to the injection itself, not the dose arc.
 *   other                  — we do not know what it is.
 * Someone who picked only these gets no beat at all; see symptomForWeekBeat.
 */
export const SIDE_EFFECT_LABEL: Record<SideEffectType, string> = {
  nausea: 'Nausea',
  constipation: 'Constipation',
  diarrhea: 'Diarrhea',
  fatigue: 'Fatigue',
  headache: 'Headache',
  reflux: 'Heartburn',
  hair_loss: 'Hair thinning',
  bloating: 'Bloating',
  sulfur_burps: 'Sulfur burps',
  appetite_suppression: 'Appetite loss',
  injection_site_reaction: 'Injection-site reaction',
  other: 'Other',
};

/**
 * The symptom this beat should draw, or null if it should be skipped entirely.
 *
 * Skipped for "none yet" / no selection — a nausea curve shown to someone
 * reporting no symptoms reads as being told what is coming rather than being
 * heard. Also skipped when nothing they picked follows this arc (injection-site
 * reactions and "other" do not), because a GI curve would be a non-sequitur —
 * the same reasoning that keeps the lean-mass bars away from non-dosing users.
 */
export function symptomForWeekBeat(picked: readonly SideEffectType[] | undefined): SideEffectType | null {
  if (!picked || picked.length === 0) return null;
  return CURVED_EFFECTS.find((effect) => picked.includes(effect)) ?? null;
}

/** Card title, e.g. "Nausea after a dose change". */
export function symptomWeekTitle(effect: SideEffectType): string {
  return `${SIDE_EFFECT_LABEL[effect]} after a dose change`;
}

/**
 * Their picks as a spoken echo: "Nausea and fatigue. Noted." Caps at two so
 * the echo stays one breath — the full list belongs in the log, not here.
 */
export function sideEffectNamesEcho(picked: readonly SideEffectType[] | undefined): string | undefined {
  if (!picked || picked.length === 0) return undefined;
  const names = picked.slice(0, 2).map((effect) => SIDE_EFFECT_LABEL[effect].toLowerCase());
  const spoken = names.length === 2 ? `${names[0]} and ${names[1]}` : names[0]!;
  const more = picked.length > 2 ? ' and the rest' : '';
  return `${spoken.charAt(0).toUpperCase()}${spoken.slice(1)}${more}. Noted.`;
}

// — the draw —

/** The curve, in a 300x140 viewBox with the baseline at y=112. */
export const CURVE_PATH =
  'M8 106 C 26 103, 38 34, 66 26 C 88 20, 104 25, 122 40 C 156 66, 208 92, 292 102';

/**
 * Measured with getTotalLength() on the real path (345.1), rounded up by a
 * hair so the dash fully hides the line at rest. Recompute if CURVE_PATH
 * changes — a stale value leaves a stub of line visible before the draw.
 */
export const CURVE_LENGTH = 346;

/**
 * Slow on purpose. This is the same call as the lean-mass bars: the beat only
 * works if the shape is WATCHED being traced, and anything near a second reads
 * as an animation playing rather than a curve being drawn.
 */
export const DRAW_DURATION_MS = 2200;

export interface DrawMark {
  /** Fraction of the path length, 0…1. */
  at: number;
  haptic: RampStyle;
}

/**
 * Felt beats along the draw, at the two moments the shape means something:
 * cresting the peak, and settling at day 7. Positions come from the measured
 * path — the crest sits at 0.30 of the length, the tail begins at 0.86.
 */
export function drawMarks(): DrawMark[] {
  return [
    { at: 0.3, haptic: 'medium' },
    { at: 1, haptic: 'soft' },
  ];
}

/** Fraction at which each on-chart label fades in, just after the line passes it. */
export const PEAK_LABEL_AT = 0.36;
export const EASING_LABEL_AT = 0.88;

/**
 * How far right the stroke has actually reached, per fraction of path length.
 * Sampled from the real path with getPointAtLength().
 *
 * The shaded area is revealed by a clip rect sweeping left to right, and the
 * two are NOT the same thing: the steep rise out of shot day covers a lot of
 * path length while barely moving in x. Sweeping the clip linearly puts the
 * fill 22px ahead of the line at the crest — the shading visibly leads the
 * stroke that is supposed to bound it. Interpolating through these stops keeps
 * them locked together. Re-sample if CURVE_PATH changes.
 */
export const CLIP_X_BY_FRACTION = {
  inputRange: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  outputRange: [8, 28, 43.4, 68, 101.9, 130.6, 160, 191.5, 224.3, 257.9, 292],
} as const;
