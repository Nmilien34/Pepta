export const MUSCLE_RETENTION_ENGINE_VERSION = 'retention-v2';

export type RetentionDriverType = 'protein' | 'training' | 'pace';
export type RetentionVerdict = 'protected' | 'steady' | 'watch' | 'at_risk';

export interface MuscleRetentionInput {
  proteinActualGrams: number;
  proteinTargetGrams: number;
  proteinDaysHit: number;
  daysInWindow: number;
  resistanceSessions: number;
  resistanceSessionTarget: number;
  weeklyWeightLossPercent: number;
}

export interface RetentionDriver {
  type: RetentionDriverType;
  label: string;
  score: number;
  contribution: number;
}

export interface MuscleRetentionResult {
  score: number;
  verdict: RetentionVerdict;
  drivers: RetentionDriver[];
  penaltyApplied: boolean;
  engineVersion: typeof MUSCLE_RETENTION_ENGINE_VERSION;
}

const WEIGHTS: Record<RetentionDriverType, number> = {
  protein: 0.45,
  training: 0.35,
  pace: 0.2,
};

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function paceScore(weeklyWeightLossPercent: number): number {
  if (weeklyWeightLossPercent <= 0.5) {
    return 100;
  }

  if (weeklyWeightLossPercent <= 1) {
    return 80;
  }

  if (weeklyWeightLossPercent <= 1.5) {
    return 60;
  }

  if (weeklyWeightLossPercent <= 2) {
    return 40;
  }

  return 20;
}

function verdictForScore(score: number): RetentionVerdict {
  if (score >= 75) {
    return 'protected';
  }

  if (score >= 60) {
    return 'steady';
  }

  if (score >= 40) {
    return 'watch';
  }

  return 'at_risk';
}

export function computeMuscleRetention(input: MuscleRetentionInput): MuscleRetentionResult {
  const adequacy = clampRatio(input.proteinTargetGrams > 0 ? input.proteinActualGrams / input.proteinTargetGrams : 0);
  const consistency = clampRatio(input.daysInWindow > 0 ? input.proteinDaysHit / input.daysInWindow : 0);
  const proteinScore = clampScore(100 * (0.4 * adequacy + 0.6 * consistency));
  const trainingScore = clampScore(
    input.resistanceSessionTarget > 0
      ? (input.resistanceSessions / input.resistanceSessionTarget) * 100
      : 0,
  );
  const pace = paceScore(input.weeklyWeightLossPercent);
  const drivers: RetentionDriver[] = [
    {
      type: 'protein',
      label: 'Protein adequacy',
      score: Number(proteinScore.toFixed(1)),
      contribution: Number((proteinScore * WEIGHTS.protein).toFixed(1)),
    },
    {
      type: 'training',
      label: 'Resistance training',
      score: Number(trainingScore.toFixed(1)),
      contribution: Number((trainingScore * WEIGHTS.training).toFixed(1)),
    },
    {
      type: 'pace',
      label: 'Weight-loss pace',
      score: pace,
      contribution: Number((pace * WEIGHTS.pace).toFixed(1)),
    },
  ];
  const baseScore = drivers.reduce((sum, driver) => sum + driver.contribution, 0);
  const fastLoss = input.weeklyWeightLossPercent > 1.5;
  const lowProtein = adequacy < 0.8 || consistency < 0.6;
  const penaltyApplied = fastLoss && lowProtein;
  const score = Math.round(penaltyApplied ? baseScore * 0.7 : baseScore);

  return {
    score,
    verdict: verdictForScore(score),
    drivers,
    penaltyApplied,
    engineVersion: MUSCLE_RETENTION_ENGINE_VERSION,
  };
}
