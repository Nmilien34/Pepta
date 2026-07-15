import { describe, expect, it } from "vitest";
import type { HomeResponse, TrackResponse } from "@pepta/shared";
import { makeHome } from "../../mocks/home";
import { buildPepPriorities } from "./pepPriorities";

function home(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return makeHome({
    profile: {
      id: "profile-1",
      userId: "user-1",
      sex: "female",
      dateOfBirth: "1992-01-01",
      ageYears: 34,
      medicationStatus: "active",
      height: 66,
      heightUnit: "in",
      currentWeight: 184,
      weightUnit: "lb",
      goalWeight: 160,
      goalWeightUnit: "lb",
      goalPace: "steady",
      activityLevel: "light",
      trainingStatus: "beginner",
      goalType: "lose_fat",
      biggestWorry: "losing_muscle",
      doseUnitPreference: "mg",
      onboardingComplete: true,
      journeyStartDate: "2026-06-01",
      timezone: "America/New_York",
      dailyCalorieTarget: 1800,
      dailyProteinTargetGrams: 125,
      proteinGramsPerKg: 1.6,
      targetWeeklyLossPercent: 0.7,
      estimatedGoalDate: "2026-12-01",
      dailyFiberTargetGrams: 25,
      dailyWaterTargetOz: 90,
      dailyStepTarget: 7500,
      nutritionEngineVersion: "test",
      sideEffectBaseline: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    activeCompounds: [
      {
        id: "compound-1",
        userId: "user-1",
        name: "Tirzepatide",
        drugClass: "dual_glp_1_gip",
        route: "injection",
        halfLifeDays: 5,
        doseUnit: "mg",
        plannedDose: 5,
        startDate: "2026-06-01",
        status: "active",
        deletedAt: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
    medicationLevels: [
      {
        compoundId: "compound-1",
        compoundName: "Tirzepatide",
        halfLifeDays: 5,
        currentEstimate: 1.2,
        peakEstimate: 2,
        troughEstimate: 0.5,
        curve: [],
        nextDoseAt: "2026-07-14T18:00:00.000Z",
        hoursUntilNextDose: 1,
        estimateBasis: "relative-dose-equivalent",
        engineVersion: "test",
      },
    ],
    nextDose: {
      compoundId: "compound-1",
      compoundName: "Tirzepatide",
      nextDoseAt: "2026-07-14T18:00:00.000Z",
      hoursUntilNextDose: 1,
    },
    todayProteinGrams: 42,
    todayWaterOz: 18,
    todayFiberGrams: 6,
    setupProgress: { loggedItems: 5, required: 5, unlocked: true },
    ...overrides,
  });
}

function track(overrides: Partial<TrackResponse> = {}): TrackResponse {
  return {
    doseLogs: [],
    mealLogs: [],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [],
    measurements: [],
    sectionErrors: {},
    ...overrides,
  };
}

describe("buildPepPriorities", () => {
  it("ranks a due shot above daily anchors and marks it push-worthy", () => {
    const priorities = buildPepPriorities({ home: home(), track: track() });

    expect(priorities[0]).toMatchObject({
      id: "dose-due",
      level: "important",
      pushEligible: true,
      note: { action: "dose", tone: "nudge" },
      reminderId: "dose_due",
    });
    expect(priorities[0]?.notification?.title).toBe("Pep: shot time");
    expect(priorities[0]?.notification?.body).toContain("Tirzepatide");
    expect(priorities.map((priority) => priority.id)).toContain("protein-gap");
  });

  it("uses recent logged data for the post-dose companion check-in", () => {
    const priorities = buildPepPriorities({
      home: home({ nextDose: null }),
      track: track({
        doseLogs: [
          {
            id: "dose-1",
            userId: "user-1",
            compoundId: "compound-1",
            amount: 5,
            unit: "mg",
            datetime: "2026-07-13T18:00:00.000Z",
            deletedAt: null,
            createdAt: "2026-07-13T18:00:00.000Z",
            updatedAt: "2026-07-13T18:00:00.000Z",
          },
        ],
      }),
      now: new Date("2026-07-14T12:00:00.000Z"),
    });

    expect(priorities[0]).toMatchObject({
      id: "post-dose-checkin",
      reminderId: "post_dose_checkin",
      pushEligible: true,
    });
    expect(priorities[0]?.note?.text).toContain("18 hours since your last shot");
  });
});
