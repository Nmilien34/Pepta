import type { LifestyleTargets, UserProfileInput } from "@pepta/shared";
import { computeLifestyleTargets } from "./lifestyle-targets";
import {
  computeNutritionTargets,
  estimateGoalDate,
  NUTRITION_ENGINE_VERSION,
  poundsFromWeight,
} from "./nutrition";

export interface ProfileTargets {
  ageYears: number;
  dailyCalorieTarget: number;
  dailyProteinTargetGrams: number;
  proteinGramsPerKg: number;
  targetWeeklyLossPercent: number;
  estimatedGoalDate: string | null;
  dailyFiberTargetGrams: number;
  dailyWaterTargetOz: number;
  dailyStepTarget: number;
  nutritionEngineVersion: typeof NUTRITION_ENGINE_VERSION;
  lifestyleTargets: LifestyleTargets;
}

export function deriveAgeYears(
  dateOfBirth: string | undefined,
  fallbackAgeYears: number | undefined,
  now = new Date(),
): number {
  if (!dateOfBirth) {
    if (fallbackAgeYears === undefined) {
      throw new Error("dateOfBirth or ageYears is required");
    }
    return fallbackAgeYears;
  }

  const [year, month, day] = dateOfBirth.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("dateOfBirth must be YYYY-MM-DD");
  }

  let age = now.getUTCFullYear() - year;
  const hasHadBirthday =
    now.getUTCMonth() + 1 > month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!hasHadBirthday) {
    age -= 1;
  }

  return age;
}

export function computeProfileTargets(
  profile: UserProfileInput,
  now = new Date(),
): ProfileTargets {
  const ageYears = deriveAgeYears(profile.dateOfBirth, profile.ageYears, now);
  const nutritionTargets = computeNutritionTargets({
    ...profile,
    ageYears,
  });
  const currentWeightLb = poundsFromWeight(
    profile.currentWeight,
    profile.weightUnit,
  );
  const goalWeightLb = poundsFromWeight(
    profile.goalWeight,
    profile.goalWeightUnit,
  );
  const estimatedGoalDate = estimateGoalDate({
    currentWeight: currentWeightLb,
    goalWeight: goalWeightLb,
    targetWeeklyLossPercent: nutritionTargets.targetWeeklyLossPercent,
    fromDate: new Date(`${profile.journeyStartDate}T00:00:00.000Z`),
  });
  const lifestyleTargets = computeLifestyleTargets({
    currentWeightLb,
    activityLevel: profile.activityLevel,
    sideEffectBaseline: profile.sideEffectBaseline,
  });

  return {
    ageYears,
    dailyCalorieTarget: nutritionTargets.dailyCalorieTarget,
    dailyProteinTargetGrams: nutritionTargets.dailyProteinTargetGrams,
    proteinGramsPerKg: nutritionTargets.proteinGramsPerKg,
    targetWeeklyLossPercent: nutritionTargets.targetWeeklyLossPercent,
    estimatedGoalDate,
    dailyFiberTargetGrams: lifestyleTargets.dailyFiberTargetGrams,
    dailyWaterTargetOz: lifestyleTargets.dailyWaterTargetOz,
    dailyStepTarget: lifestyleTargets.dailyStepTarget,
    nutritionEngineVersion: nutritionTargets.engineVersion,
    lifestyleTargets,
  };
}
