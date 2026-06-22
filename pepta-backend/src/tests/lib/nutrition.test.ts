import { describe, expect, it } from "vitest";
import {
  computeNutritionTargets,
  estimateGoalDate,
  poundsFromWeight,
} from "../../lib/nutrition";

describe("nutrition targets", () => {
  const baseInput = {
    sex: "female" as const,
    ageYears: 40,
    height: 65,
    heightUnit: "in" as const,
    currentWeight: 180,
    weightUnit: "lb" as const,
    goalWeight: 150,
    goalWeightUnit: "lb" as const,
    activityLevel: "light" as const,
    trainingStatus: "beginner" as const,
    goalType: "lose_fat" as const,
    goalPace: "steady" as const,
  };

  it("uses goal-weight-based GLP-1 protein tuning and exposes fiber", () => {
    const result = computeNutritionTargets({
      ...baseInput,
    });

    expect(result.dailyProteinTargetGrams).toBe(136);
    expect(result.dailyFiberTargetGrams).toBe(30);
    expect(result.proteinGramsPerKg).toBe(2);
    expect(result.targetWeeklyLossPercent).toBe(0.75);
    expect(result.engineVersion).toBe("nutrition-v2");
  });

  it("normalizes kilograms to pounds", () => {
    expect(poundsFromWeight(100, "kg")).toBeCloseTo(220.462, 3);
    expect(poundsFromWeight(220, "lb")).toBe(220);
  });

  it("scales protein by goal type for the same person", () => {
    const maintain = computeNutritionTargets({
      ...baseInput,
      goalType: "maintain",
    });
    const loseFat = computeNutritionTargets({
      ...baseInput,
      goalType: "lose_fat",
    });

    expect(loseFat.dailyProteinTargetGrams).toBeGreaterThan(
      maintain.dailyProteinTargetGrams,
    );
  });

  it("caps prescribed deficit and never targets below 1.1x BMR", () => {
    const result = computeNutritionTargets({
      ...baseInput,
      sex: "male",
      height: 70,
      currentWeight: 400,
      goalWeight: 180,
      goalPace: "ambitious",
    });

    expect(result.dailyDeficitCalories).toBe(500);
    expect(result.dailyCalorieTarget).toBeGreaterThanOrEqual(
      result.calorieFloor,
    );
    expect(result.calorieFloor).toBeGreaterThan(1500);
  });

  it("uses a neutral Mifflin offset when sex is omitted", () => {
    const female = computeNutritionTargets({ ...baseInput, sex: "female" });
    const male = computeNutritionTargets({ ...baseInput, sex: "male" });
    const neutral = computeNutritionTargets({ ...baseInput, sex: undefined });

    expect(neutral.dailyCalorieTarget).toBeGreaterThan(
      female.dailyCalorieTarget,
    );
    expect(neutral.dailyCalorieTarget).toBeLessThan(male.dailyCalorieTarget);
  });

  it("keeps high-BMI protein target below current-weight basis", () => {
    const result = computeNutritionTargets({
      ...baseInput,
      currentWeight: 320,
      goalWeight: 180,
      height: 66,
      goalType: "recomp",
    });

    const currentWeightBasis = Math.round((320 / 2.2046226218) * 2.2);
    expect(result.dailyProteinTargetGrams).toBeLessThan(currentWeightBasis);
  });

  it("estimates a goal date from weekly loss pace", () => {
    expect(
      estimateGoalDate({
        currentWeight: 200,
        goalWeight: 180,
        targetWeeklyLossPercent: 1,
        fromDate: new Date("2026-06-21T00:00:00.000Z"),
      }),
    ).toBe("2026-08-30");
  });

  it("estimates the same goal date when current and goal weights use different units", () => {
    const mixedUnits = computeNutritionTargets({
      ...baseInput,
      currentWeight: 220,
      weightUnit: "lb",
      goalWeight: 90.7185,
      goalWeightUnit: "kg",
    });
    const allKg = computeNutritionTargets({
      ...baseInput,
      currentWeight: 99.7903,
      weightUnit: "kg",
      goalWeight: 90.7185,
      goalWeightUnit: "kg",
    });

    expect(mixedUnits.estimatedGoalDate).not.toBeNull();
    expect(mixedUnits.estimatedGoalDate).toBe(allKg.estimatedGoalDate);
  });
});
