import type {
  ActivityLevel,
  GoalPace,
  Sex,
  TrainingStatus,
} from "@pepta/shared";

export const NUTRITION_ENGINE_VERSION = "nutrition-v2";

const LB_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;
const KCAL_PER_LB_FAT = 3500;
const DAILY_FIBER_TARGET_GRAMS = 30;

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.5,
  active: 1.65,
};

const TRAINING_BONUS: Record<TrainingStatus, number> = {
  not_training: 0,
  beginner: 0,
  returning: 0.05,
  consistent: 0.1,
};

const PROTEIN_G_PER_KG = {
  maintain: 1.6,
  lose_fat: 2,
  recomp: 2.2,
} as const;

const TARGET_WEEKLY_LOSS_PERCENT: Record<GoalPace, number> = {
  gentle: 0.5,
  steady: 0.75,
  ambitious: 1,
};

const CALORIE_FLOOR: Record<Sex, number> = {
  female: 1200,
  male: 1500,
};
const NEUTRAL_SEX_OFFSET = -78;
const NEUTRAL_CALORIE_FLOOR = 1350;

const DAILY_DEFICIT_CAP = 500;

export interface NutritionTargetsInput {
  sex?: Sex;
  ageYears: number;
  height: number;
  heightUnit: "in" | "cm";
  currentWeight: number;
  weightUnit: "lb" | "kg";
  goalWeight: number;
  goalWeightUnit: "lb" | "kg";
  activityLevel: ActivityLevel;
  trainingStatus: TrainingStatus;
  goalType: "lose_fat" | "maintain" | "recomp";
  goalPace: GoalPace;
}

export interface NutritionTargets {
  dailyCalorieTarget: number;
  dailyProteinTargetGrams: number;
  proteinGramsPerKg: number;
  targetWeeklyLossPercent: number;
  estimatedGoalDate: string | null;
  dailyFiberTargetGrams: number;
  dailyDeficitCalories: number;
  calorieFloor: number;
  engineVersion: typeof NUTRITION_ENGINE_VERSION;
}

export function poundsFromWeight(value: number, unit: "lb" | "kg"): number {
  return unit === "kg" ? value * LB_PER_KG : value;
}

function centimetersFromHeight(value: number, unit: "in" | "cm"): number {
  return unit === "in" ? value * CM_PER_INCH : value;
}

function kilogramsFromWeight(value: number, unit: "lb" | "kg"): number {
  return poundsFromWeight(value, unit) / LB_PER_KG;
}

function clamp(value: number, floor: number, cap: number): number {
  return Math.min(cap, Math.max(floor, value));
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function estimateGoalDate(input: {
  currentWeight: number;
  goalWeight: number;
  targetWeeklyLossPercent: number;
  fromDate?: Date;
}): string | null {
  if (
    input.goalWeight >= input.currentWeight ||
    input.targetWeeklyLossPercent <= 0
  ) {
    return null;
  }

  const weeklyLoss =
    input.currentWeight * (input.targetWeeklyLossPercent / 100);
  if (weeklyLoss <= 0) {
    return null;
  }

  const weeks = Math.ceil(
    (input.currentWeight - input.goalWeight) / weeklyLoss,
  );
  const estimated = new Date(input.fromDate ?? new Date());
  estimated.setUTCDate(estimated.getUTCDate() + weeks * 7);

  return dateOnly(estimated);
}

export function computeNutritionTargets(
  input: NutritionTargetsInput,
): NutritionTargets {
  const weightLb = poundsFromWeight(input.currentWeight, input.weightUnit);
  const weightKg = kilogramsFromWeight(input.currentWeight, input.weightUnit);
  const goalWeightKg = kilogramsFromWeight(
    input.goalWeight,
    input.goalWeightUnit,
  );
  const heightCm = centimetersFromHeight(input.height, input.heightUnit);
  const referenceKg = Math.max(goalWeightKg, 0.75 * weightKg);
  const proteinGramsPerKg = PROTEIN_G_PER_KG[input.goalType];
  const proteinFloor = Math.max(90, Math.round(1.4 * referenceKg));
  const dailyProteinTargetGrams = clamp(
    Math.round(referenceKg * proteinGramsPerKg),
    proteinFloor,
    230,
  );
  const sexOffset =
    input.sex === "male"
      ? 5
      : input.sex === "female"
        ? -161
        : NEUTRAL_SEX_OFFSET;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * input.ageYears + sexOffset;
  const activityFactor =
    ACTIVITY_FACTOR[input.activityLevel] + TRAINING_BONUS[input.trainingStatus];
  const tdee = bmr * activityFactor;
  const targetWeeklyLossPercent = TARGET_WEEKLY_LOSS_PERCENT[input.goalPace];
  const weeklyLossLb = weightLb * (targetWeeklyLossPercent / 100);
  const rawDeficit = (weeklyLossLb * KCAL_PER_LB_FAT) / 7;
  const dailyDeficitCalories =
    input.goalType === "maintain" ? 0 : Math.min(rawDeficit, DAILY_DEFICIT_CAP);
  const target = tdee - dailyDeficitCalories;
  const calorieFloor = Math.max(
    input.sex ? CALORIE_FLOOR[input.sex] : NEUTRAL_CALORIE_FLOOR,
    Math.round(bmr * 1.1),
  );

  return {
    dailyCalorieTarget: Math.max(calorieFloor, Math.round(target / 10) * 10),
    dailyProteinTargetGrams,
    proteinGramsPerKg,
    targetWeeklyLossPercent,
    estimatedGoalDate: estimateGoalDate({
      currentWeight: weightKg,
      goalWeight: goalWeightKg,
      targetWeeklyLossPercent,
    }),
    dailyFiberTargetGrams: DAILY_FIBER_TARGET_GRAMS,
    dailyDeficitCalories: Math.round(dailyDeficitCalories),
    calorieFloor,
    engineVersion: NUTRITION_ENGINE_VERSION,
  };
}
