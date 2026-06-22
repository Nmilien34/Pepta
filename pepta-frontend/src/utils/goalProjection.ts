// Pure projection for the goal-pace screen: maps a 0..1 pace to a weekly loss
// rate (% of current weight) and an estimated goal date. No RN imports →
// unit-testable. `now` is injected. Returns nulls when there's nothing to lose
// (maintain/recomp), so the screen can show a "holding steady" message.
//
// NOTE: this is a frontend PREVIEW so the slider feels responsive. Once the
// backend lands, the real estimated date comes from OnboardingResultResponse;
// this stays as the live in-flight estimate.

import type { DateParts } from './dateParts';

const GENTLE_PCT = 0.25; // %/week at pace 0
const AMBITIOUS_PCT = 1.0; // %/week at pace 1

export interface GoalProjection {
  weeklyLoss: number; // in the same unit as the inputs, 1 decimal
  weeks: number | null;
  estimatedDate: DateParts | null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function projectGoal(args: {
  currentWeight: number;
  goalWeight: number;
  pace: number;
  now: Date;
}): GoalProjection {
  const toLose = Math.max(0, args.currentWeight - args.goalWeight);
  const weeklyPct = GENTLE_PCT + (AMBITIOUS_PCT - GENTLE_PCT) * clamp01(args.pace);
  const weeklyLoss = Math.round(((args.currentWeight * weeklyPct) / 100) * 10) / 10;

  if (toLose <= 0 || weeklyLoss <= 0) {
    return { weeklyLoss, weeks: null, estimatedDate: null };
  }

  const weeks = Math.ceil(toLose / weeklyLoss);
  const d = new Date(args.now.getFullYear(), args.now.getMonth(), args.now.getDate() + weeks * 7);
  return {
    weeklyLoss,
    weeks,
    estimatedDate: { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() },
  };
}
