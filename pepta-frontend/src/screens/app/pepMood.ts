// Pep's mood, derived from the user's own medication level and cycle position.
//
// This is the piece no competitor can copy: it needs the level model. Bright
// near peak, drowsy near trough, asleep through an off-cycle rest week. It
// teaches the pharmacokinetics through character instead of a second chart.
//
// SAFETY RULE, deliberate and load-bearing: there is no sad, disappointed or
// scolding mood, and a missed dose never changes how Pep looks. Shame about a
// missed dose can push someone to double up — that is a medical risk, not a
// growth lever. Moods react to WHERE THE DRUG IS, never to compliance.
//
// Pure and RN-free so it unit-tests in plain Node.

import type { MedicationLevelResponse } from '@pepta/shared';

export type PepMood = 'peak' | 'steady' | 'drowsy' | 'resting' | 'celebrating';

export interface PepMoodInput {
  level?: MedicationLevelResponse | null;
  /** True when today falls inside an off-cycle rest window. */
  resting?: boolean;
  /** Set for a moment worth marking — first shot, first month, a goal step. */
  milestone?: boolean;
}

export interface PepMoodView {
  mood: PepMood;
  /** Which Mascot pose to render. */
  pose: 'idle' | 'wave' | 'drowsy' | 'asleep' | 'cheer';
  /** Seconds for one bob cycle — slower when the level is low. */
  bobSeconds: number;
  /** Optional line for the companion bubble. Never guilt, never a nudge. */
  line?: string;
}

/** Where the current estimate sits between trough and peak, 0…1. */
export function levelFraction(level?: MedicationLevelResponse | null): number | null {
  if (!level) return null;
  const { currentEstimate, peakEstimate, troughEstimate } = level;
  if (![currentEstimate, peakEstimate, troughEstimate].every(Number.isFinite)) return null;
  const span = peakEstimate - troughEstimate;
  // A flat curve (span 0) carries no information — treat as unknown rather
  // than dividing by zero and reporting a confident 0 or 1.
  if (span <= 0) return null;
  const raw = (currentEstimate - troughEstimate) / span;
  return Math.min(1, Math.max(0, raw));
}

export function buildPepMood({ level, resting, milestone }: PepMoodInput): PepMoodView {
  // A marked moment outranks everything — it is the one time Pep leads.
  if (milestone) {
    return { mood: 'celebrating', pose: 'cheer', bobSeconds: 2.2 };
  }

  // Resting outranks the curve: during an off week the level is low by design,
  // and "drowsy" would read as something being wrong.
  if (resting) {
    return {
      mood: 'resting',
      pose: 'asleep',
      bobSeconds: 5.5,
      line: 'Resting with you. Nothing to log today.',
    };
  }

  const fraction = levelFraction(level);
  if (fraction === null) {
    return { mood: 'steady', pose: 'idle', bobSeconds: 3.5 };
  }

  if (fraction >= 0.66) {
    return {
      mood: 'peak',
      pose: 'idle',
      bobSeconds: 2.6,
      line: `${formatEstimate(level)} on board — this is the strong stretch.`,
    };
  }

  if (fraction <= 0.25) {
    return {
      mood: 'drowsy',
      pose: 'drowsy',
      bobSeconds: 4.8,
      line: `Down to ${formatEstimate(level)}. Shot day is close.`,
    };
  }

  return { mood: 'steady', pose: 'idle', bobSeconds: 3.5 };
}

function formatEstimate(level?: MedicationLevelResponse | null): string {
  if (!level) return 'your level';
  const value = Math.round(level.currentEstimate * 100) / 100;
  return `${value} mg`;
}
