// The muscle-risk profile — the scored payoff on the reveal.
//
// WHAT THIS IS. A weighted read of the four things we know at the end of
// onboarding that are associated with lean-mass loss on a GLP-1. It is a
// prioritisation aid, not a measurement and not a diagnosis: nothing here has
// been near a DEXA scan, and the copy that renders it must never imply
// otherwise.
//
// WHY IT EXISTS. Thirty answers go in and, before this, five came back out.
// A score with NAMED drivers turns the questionnaire into something the user
// can see the shape of — and every driver here points at something they can
// actually change, which is the difference between a warning and a plan.
//
// THE SPREAD IS THE POINT. If every driver came back at 80 the whole thing
// reads as flattery-in-reverse and gets ignored. Drivers are scaled so a
// genuinely low-risk input lands genuinely low; `age` on a 30-year-old is
// supposed to look like a non-problem, because it is one.
//
// HONEST INPUTS ONLY. An earlier draft of this had a "protein gap" driver.
// At the end of onboarding the user has logged nothing, so that number could
// only ever have been invented. It is not here.

import type { ActivityLevel, TrainingStatus } from '@pepta/shared';

/** Ordered strongest-first; the order is the render order. */
export const RISK_DRIVERS = ['pace', 'training', 'age', 'activity'] as const;
export type RiskDriverKey = (typeof RISK_DRIVERS)[number];

/**
 * How much each driver moves the total.
 *
 * Rate of loss dominates on purpose — it is both the best-evidenced driver of
 * lean-mass loss and the one the user just chose on a slider, so it is the
 * most changeable thing on the screen.
 */
const WEIGHT: Record<RiskDriverKey, number> = {
  pace: 0.4,
  training: 0.3,
  age: 0.18,
  activity: 0.12,
};

const TRAINING_RISK: Record<TrainingStatus, number> = {
  not_training: 92,
  beginner: 62,
  returning: 45,
  consistent: 18,
};

/**
 * MIND THE ORDER. The union reads sedentary | light | moderate | active, and
 * `active` is the TOP tier — DailyRoutineScreen labels it "Very active ·
 * physical job or daily training", while `moderate` is the one labelled
 * "Active". Typing this Record is what surfaced the mistake: the first draft
 * invented a `very_active` key and omitted `moderate`, so every user who
 * answered "Active" would have silently taken the unknown-answer fallback.
 */
const ACTIVITY_RISK: Record<ActivityLevel, number> = {
  sedentary: 84,
  light: 58,
  moderate: 34,
  active: 20,
};

/**
 * What an ABSENT answer scores. Deliberately mid-scale, never 0: a question
 * the user skipped is an unknown, and an unknown must not be rendered back to
 * them as reassurance.
 */
// Deliberately NOT equal to any real tier: 62 is `beginner` and 58 is `light`,
// so the original values made "we never asked" indistinguishable from a real
// answer — in the data and in any test trying to tell them apart.
const UNKNOWN_TRAINING = 64;
const UNKNOWN_ACTIVITY = 60;

export interface RiskDriver {
  key: RiskDriverKey;
  /** Short, plain, and about something the user did — never a body part. */
  label: string;
  /** 0–100. */
  score: number;
}

export interface RiskProfile {
  /** 0–100, the weighted total. */
  score: number;
  drivers: RiskDriver[];
}

export interface RiskInput {
  /** Projected loss per week, in the same unit as `weight`. */
  weeklyLoss?: number;
  weight?: number;
  trainingStatus?: TrainingStatus;
  activityLevel?: ActivityLevel;
  ageYears?: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Weekly loss as a share of body weight, mapped onto risk.
 *
 * Below ~0.5%/week is the commonly cited "sustainable" band; at and past ~1.2%
 * the deficit is steep enough that lean mass goes with the fat. Anything we
 * cannot compute lands mid-scale rather than at zero — an unknown is not the
 * same as a reassurance.
 */
function paceRisk(weeklyLoss?: number, weight?: number): number {
  if (!weeklyLoss || !weight || weight <= 0) return 50;
  const pct = (weeklyLoss / weight) * 100;
  return clamp(((pct - 0.35) / (1.2 - 0.35)) * 100);
}

/** Sarcopenia risk is flat and low until roughly 40, then climbs. */
function ageRisk(ageYears?: number): number {
  if (!ageYears || ageYears <= 0) return 40;
  if (ageYears <= 30) return 15;
  return clamp(15 + ((ageYears - 30) / 40) * 85);
}

export function buildRiskProfile(input: RiskInput): RiskProfile {
  const drivers: RiskDriver[] = [
    { key: 'pace', label: 'Pace you picked', score: paceRisk(input.weeklyLoss, input.weight) },
    {
      key: 'training',
      label: 'Resistance training',
      score: input.trainingStatus ? TRAINING_RISK[input.trainingStatus] : UNKNOWN_TRAINING,
    },
    { key: 'age', label: 'Age', score: ageRisk(input.ageYears) },
    {
      key: 'activity',
      label: 'Daily movement',
      score: input.activityLevel ? ACTIVITY_RISK[input.activityLevel] : UNKNOWN_ACTIVITY,
    },
  ];

  const score = clamp(
    drivers.reduce((total, d) => total + d.score * WEIGHT[d.key], 0),
  );
  return { score, drivers };
}

/**
 * The one driver worth naming in copy — the highest-scoring one, which is
 * also the one with the most headroom to improve.
 */
export function topDriver(profile: RiskProfile): RiskDriver {
  return profile.drivers.reduce((worst, d) => (d.score > worst.score ? d : worst));
}
