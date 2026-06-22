import type { ActivityLevel, SideEffectType } from "@pepta/shared";

const DAILY_FIBER_TARGET_GRAMS = 30;
const CONSTIPATION_FIBER_TARGET_GRAMS = 38;

const STEP_TARGET_BY_ACTIVITY: Record<ActivityLevel, number> = {
  sedentary: 5000,
  light: 7000,
  moderate: 9000,
  active: 11000,
};

export interface LifestyleTargetsInput {
  currentWeightLb: number;
  activityLevel: ActivityLevel;
  sideEffectBaseline?: SideEffectType[];
}

export interface LifestyleTargetsResult {
  dailyWaterTargetOz: number;
  dailyFiberTargetGrams: number;
  dailyStepTarget: number;
  adjustedFor: SideEffectType[];
}

function clamp(value: number, floor: number, cap: number): number {
  return Math.min(cap, Math.max(floor, value));
}

export function computeLifestyleTargets(
  input: LifestyleTargetsInput,
): LifestyleTargetsResult {
  const sideEffects = new Set(input.sideEffectBaseline ?? []);
  const adjustedFor: SideEffectType[] = [];
  let dailyWaterTargetOz = clamp(
    Math.round(input.currentWeightLb * 0.5),
    64,
    120,
  );
  let dailyFiberTargetGrams = DAILY_FIBER_TARGET_GRAMS;
  let dailyStepTarget = STEP_TARGET_BY_ACTIVITY[input.activityLevel];

  if (sideEffects.has("nausea") || sideEffects.has("constipation")) {
    dailyWaterTargetOz += 16;
    if (sideEffects.has("nausea")) {
      adjustedFor.push("nausea");
    }
    if (sideEffects.has("constipation")) {
      adjustedFor.push("constipation");
    }
  }

  if (sideEffects.has("constipation")) {
    dailyFiberTargetGrams = CONSTIPATION_FIBER_TARGET_GRAMS;
  }

  if (sideEffects.has("fatigue")) {
    dailyStepTarget = Math.max(3000, dailyStepTarget - 1500);
    adjustedFor.push("fatigue");
  }

  return {
    dailyWaterTargetOz,
    dailyFiberTargetGrams,
    dailyStepTarget,
    adjustedFor,
  };
}
