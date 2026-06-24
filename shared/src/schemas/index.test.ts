import { describe, expect, it } from "vitest";
import {
  compoundResponseSchema,
  insightSchema,
  mealLogScanDetailResponseSchema,
  mealScanResponseSchema,
  medicationCatalogItemSchema,
  onboardingCompleteInputSchema,
  onboardingResultResponseSchema,
  sideEffectLogInputSchema,
  userProfileInputSchema,
  userProfileResponseSchema,
} from "./index";

describe("shared profile schemas", () => {
  const baseProfile = {
    sex: "female",
    ageYears: 40,
    height: 65,
    heightUnit: "in",
    currentWeight: 180,
    weightUnit: "lb",
    goalWeight: 150,
    goalWeightUnit: "lb",
    goalPace: "steady",
    activityLevel: "light",
    trainingStatus: "beginner",
    goalType: "lose_fat",
    biggestWorry: "losing_muscle",
    doseUnitPreference: "mg",
    onboardingComplete: true,
    journeyStartDate: "2026-06-21",
    timezone: "America/New_York",
  };

  it("keeps computed nutrition fields out of client input", () => {
    const result = userProfileInputSchema.safeParse({
      ...baseProfile,
      dailyCalorieTarget: 1510,
    });

    expect(result.success).toBe(false);
  });

  it("allows computed nutrition fields in backend responses", () => {
    const result = userProfileResponseSchema.safeParse({
      ...baseProfile,
      id: "profile-1",
      userId: "user-1",
      dailyCalorieTarget: 1510,
      dailyProteinTargetGrams: 131,
      proteinGramsPerKg: 1.6,
      targetWeeklyLossPercent: 0.75,
      estimatedGoalDate: "2027-03-21",
      dailyFiberTargetGrams: 30,
      dailyWaterTargetOz: 90,
      dailyStepTarget: 7000,
      nutritionEngineVersion: "nutrition-v1",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("requires goal pace and goal-weight fields in profile input", () => {
    const result = userProfileInputSchema.safeParse(baseProfile);

    expect(result.success).toBe(true);
  });

  it("allows additive insight copy versions", () => {
    const result = insightSchema.safeParse({
      id: "insight-1",
      type: "medication_level",
      headline: "Dose cycle note",
      body: "Your relative medication estimate is in the lower part of the curve.",
      severity: "warning",
      deterministicSignal: { ratioToPeak: 0.2 },
      generatedAt: "2026-06-21T00:00:00.000Z",
      copyVersion: "insight-copy-v1",
    });

    expect(result.success).toBe(true);
  });

  it("accepts date of birth, gender identity, medication status, and no sex in profile input", () => {
    const result = userProfileInputSchema.safeParse({
      ...baseProfile,
      sex: undefined,
      ageYears: undefined,
      dateOfBirth: "1986-06-21",
      genderIdentity: "nonbinary",
      medicationStatus: "starting_soon",
      sideEffectBaseline: ["hair_loss", "bloating", "sulfur_burps"],
    });

    expect(result.success).toBe(true);
  });

  it("requires age years and lifestyle targets in profile responses", () => {
    const result = userProfileResponseSchema.safeParse({
      ...baseProfile,
      dateOfBirth: "1986-06-21",
      genderIdentity: "woman",
      medicationStatus: "active",
      sideEffectBaseline: ["constipation"],
      id: "profile-1",
      userId: "user-1",
      dailyCalorieTarget: 1510,
      dailyProteinTargetGrams: 131,
      proteinGramsPerKg: 1.6,
      targetWeeklyLossPercent: 0.75,
      estimatedGoalDate: "2027-03-21",
      dailyFiberTargetGrams: 38,
      dailyWaterTargetOz: 106,
      dailyStepTarget: 7000,
      nutritionEngineVersion: "nutrition-v2",
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts route metadata and common doses in medication catalog items", () => {
    const result = medicationCatalogItemSchema.safeParse({
      id: "catalog-1",
      slug: "rybelsus",
      name: "Rybelsus",
      brand: "Rybelsus",
      drugClass: "glp_1",
      route: "oral",
      defaultFrequency: "daily",
      commonDoses: [3, 7, 14],
      halfLifeDays: 7,
      doseUnit: "mg",
      defaultDose: 3,
      active: true,
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("allows compound responses to include soft-delete metadata", () => {
    const result = compoundResponseSchema.safeParse({
      id: "compound-1",
      userId: "user-1",
      medicationCatalogId: "catalog-1",
      name: "Mounjaro",
      drugClass: "glp_1",
      route: "injection",
      halfLifeDays: 5,
      doseUnit: "mg",
      plannedDose: 2.5,
      startDate: "2026-06-21",
      status: "active",
      deletedAt: null,
      createdAt: "2026-06-21T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("accepts onboarding schedule without compound id, last dose, and legal acceptance", () => {
    const result = onboardingCompleteInputSchema.safeParse({
      profile: {
        ...baseProfile,
        dateOfBirth: "1986-06-21",
        medicationStatus: "active",
      },
      compound: {
        medicationCatalogId: "catalog-1",
        name: "Semaglutide",
        drugClass: "glp_1",
        route: "injection",
        halfLifeDays: 7,
        doseUnit: "mg",
        plannedDose: 0.25,
        startDate: "2026-06-21",
        status: "active",
      },
      schedule: {
        frequency: "weekly",
        daysOfWeek: [0],
        nextDoseAt: "2026-06-28T13:00:00.000Z",
        active: true,
      },
      lastDose: {
        amount: 0.25,
        unit: "mg",
        injectionSite: "abdomen_left",
        datetime: "2026-06-14T13:00:00.000Z",
      },
      baselineWeight: {
        value: 180,
        unit: "lb",
        datetime: "2026-06-21T00:00:00.000Z",
      },
      sideEffectBaseline: ["constipation"],
      legalAcceptance: {
        termsVersion: "2026-06",
        privacyVersion: "2026-06",
        acceptedAt: "2026-06-21T00:00:00.000Z",
      },
    });

    expect(result.success).toBe(true);
  });

  it("describes onboarding result profile, lifestyle targets, and highlights", () => {
    const result = onboardingResultResponseSchema.safeParse({
      profile: {
        ...baseProfile,
        id: "profile-1",
        userId: "user-1",
        dateOfBirth: "1986-06-21",
        medicationStatus: "active",
        dailyCalorieTarget: 1510,
        dailyProteinTargetGrams: 131,
        proteinGramsPerKg: 1.6,
        targetWeeklyLossPercent: 0.75,
        estimatedGoalDate: "2027-03-21",
        dailyFiberTargetGrams: 38,
        dailyWaterTargetOz: 106,
        dailyStepTarget: 7000,
        nutritionEngineVersion: "nutrition-v2",
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      },
      lifestyleTargets: {
        dailyWaterTargetOz: 106,
        dailyFiberTargetGrams: 38,
        dailyStepTarget: 7000,
        adjustedFor: ["constipation"],
      },
      planHighlights: ["Protein target set to protect lean mass."],
    });

    expect(result.success).toBe(true);
  });

  it("accepts expanded side effect log types", () => {
    const result = sideEffectLogInputSchema.safeParse({
      types: ["hair_loss", "bloating", "sulfur_burps"],
      severity: 2,
      datetime: "2026-06-21T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("allows meal scan tracker notes without replacing structured coach content", () => {
    const result = mealScanResponseSchema.safeParse({
      scanId: "scan-1",
      photoS3Key: "pepta/meal-scans/user-1/photo.png",
      analysis: {
        foodName: "Chicken rice bowl",
        servingSize: "1 bowl",
        protein: 42,
        calories: 640,
        carbs: 72,
        fat: 18,
        fiber: 7,
        confidence: 0.82,
      },
      coachContent: {
        mode: "affirmation",
        callout: "Review this estimate before logging.",
        swap: null,
        copyVersion: "meal-scan-note-v1",
      },
      note: "This would put you at 96g of 120g protein today.",
      visionEngineVersion: "meal-scan-vision-v1",
    });

    expect(result.success).toBe(true);
  });

  it("allows meal log scan details to return the stored tracker note", () => {
    const result = mealLogScanDetailResponseSchema.safeParse({
      photoViewUrl: "https://signed.example/photo.png",
      analysis: null,
      coachContent: null,
      note: "Review this estimate before logging.",
    });

    expect(result.success).toBe(true);
  });
});
