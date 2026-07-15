import { describe, expect, it, vi } from "vitest";
import type { HomeResponse, TrackResponse } from "@pepta/shared";
import {
  buildPepPushContextFromResponses,
  createPepPushNotification,
  selectPepPushCandidate,
} from "../../services/pepPushCopy.service";

const now = new Date("2026-06-21T14:00:00.000Z");

function home(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return {
    profile: {
      id: "profile-1",
      userId: "user-1",
      ageYears: 40,
      medicationStatus: "active",
      height: 65,
      heightUnit: "in",
      currentWeight: 190,
      weightUnit: "lb",
      goalWeight: 165,
      goalWeightUnit: "lb",
      goalPace: "steady",
      activityLevel: "light",
      trainingStatus: "beginner",
      goalType: "lose_fat",
      biggestWorry: "side_effects",
      doseUnitPreference: "mg",
      onboardingComplete: true,
      journeyStartDate: "2026-06-01",
      timezone: "America/New_York",
      sideEffectBaseline: ["constipation"],
      dailyCalorieTarget: 1700,
      dailyProteinTargetGrams: 130,
      proteinGramsPerKg: 1.6,
      targetWeeklyLossPercent: 0.6,
      estimatedGoalDate: "2026-12-01",
      dailyFiberTargetGrams: 35,
      dailyWaterTargetOz: 100,
      dailyStepTarget: 7000,
      nutritionEngineVersion: "nutrition-v2",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    },
    activeCompounds: [],
    medicationLevels: [],
    selectedRange: "today",
    rangeTotals: undefined,
    rangeAvailability: undefined,
    todayProteinGrams: 42,
    todayFiberGrams: 8,
    todayCalories: 620,
    todayWaterOz: 32,
    streakDays: 4,
    setupProgress: { loggedItems: 4, required: 4, unlocked: true },
    nextDose: {
      compoundId: "compound-1",
      compoundName: "Semaglutide",
      nextDoseAt: "2026-06-21T16:00:00.000Z",
      hoursUntilNextDose: 2,
    },
    latestWeight: {
      id: "weight-1",
      userId: "user-1",
      value: 187.4,
      unit: "lb",
      datetime: "2026-06-20T12:00:00.000Z",
      deletedAt: null,
      createdAt: "2026-06-20T12:00:00.000Z",
      updatedAt: "2026-06-20T12:00:00.000Z",
    },
    insights: [],
    weeklyRetention: null,
    sectionErrors: {},
    ...overrides,
  };
}

function track(overrides: Partial<TrackResponse> = {}): TrackResponse {
  return {
    doseLogs: [
      {
        id: "dose-1",
        userId: "user-1",
        compoundId: "compound-1",
        amount: 0.5,
        unit: "mg",
        datetime: "2026-06-14T16:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-06-14T16:00:00.000Z",
        updatedAt: "2026-06-14T16:00:00.000Z",
      },
    ],
    mealLogs: [
      {
        id: "meal-1",
        userId: "user-1",
        foodName: "Greek yogurt bowl",
        protein: 28,
        calories: 310,
        source: "manual",
        datetime: "2026-06-21T12:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-06-21T12:00:00.000Z",
        updatedAt: "2026-06-21T12:00:00.000Z",
      },
    ],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [
      {
        id: "side-1",
        userId: "user-1",
        types: ["constipation"],
        severity: 3,
        datetime: "2026-06-20T18:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-06-20T18:00:00.000Z",
        updatedAt: "2026-06-20T18:00:00.000Z",
      },
    ],
    measurements: [],
    sectionErrors: {},
    ...overrides,
  };
}

describe("Pep push copy service", () => {
  it("builds a compact companion context from home and track data", () => {
    const context = buildPepPushContextFromResponses(home(), track(), now);

    expect(context).toMatchObject({
      timezone: "America/New_York",
      nextDose: {
        compoundName: "Semaglutide",
        hoursUntilNextDose: 2,
      },
      nutrition: {
        proteinGrams: 42,
        proteinTargetGrams: 130,
        waterOz: 32,
        waterTargetOz: 100,
      },
      latestWeight: {
        value: 187.4,
        unit: "lb",
      },
      goal: {
        weight: 165,
        weightUnit: "lb",
        biggestWorry: "side_effects",
      },
    });
    expect(context.recentMeals[0]).toEqual({
      foodName: "Greek yogurt bowl",
      protein: 28,
      calories: 310,
      when: "2026-06-21T12:00:00.000Z",
    });
    expect(context.recentSideEffects[0]).toEqual({
      types: ["constipation"],
      severity: 3,
      when: "2026-06-20T18:00:00.000Z",
    });
  });

  it("selects a shot-due candidate as a high-priority push", () => {
    const context = buildPepPushContextFromResponses(home(), track(), now);
    const candidate = selectPepPushCandidate(context, now);

    expect(candidate).toEqual(
      expect.objectContaining({
        priorityId: "dose_due",
        importance: "high",
        windowKey: "dose_due:2026-06-21",
        pushEligible: true,
      }),
    );
  });

  it("prioritizes severe side effects with clinician-safe wording", () => {
    const context = buildPepPushContextFromResponses(
      home({ nextDose: null }),
      track({
        sideEffectLogs: [
          {
            id: "side-severe",
            userId: "user-1",
            types: ["nausea"],
            severity: 5,
            datetime: "2026-06-21T13:15:00.000Z",
            deletedAt: null,
            createdAt: "2026-06-21T13:15:00.000Z",
            updatedAt: "2026-06-21T13:15:00.000Z",
          },
        ],
      }),
      now,
    );

    const candidate = selectPepPushCandidate(context, now);

    expect(candidate).toEqual(
      expect.objectContaining({
        priorityId: "side_effect_clinician",
        importance: "high",
        pushEligible: true,
        windowKey: "side_effect_clinician:2026-06-21",
      }),
    );
    expect(candidate?.fallback.body).toMatch(/clinician|urgent/i);
    expect(candidate?.fallback.body).not.toMatch(/change.*dose|treat/i);
  });

  it("turns mild side effects into supportive companion nudges", () => {
    const context = buildPepPushContextFromResponses(
      home({
        nextDose: null,
        todayProteinGrams: 120,
        todayWaterOz: 80,
      }),
      track({
        sideEffectLogs: [
          {
            id: "side-mild",
            userId: "user-1",
            types: ["constipation"],
            severity: 2,
            datetime: "2026-06-20T18:00:00.000Z",
            deletedAt: null,
            createdAt: "2026-06-20T18:00:00.000Z",
            updatedAt: "2026-06-20T18:00:00.000Z",
          },
        ],
      }),
      now,
    );

    const candidate = selectPepPushCandidate(context, now);

    expect(candidate).toEqual(
      expect.objectContaining({
        priorityId: "side_effect_support",
        importance: "normal",
        pushEligible: false,
        windowKey: "side_effect_support:2026-06-20",
      }),
    );
    expect(candidate?.fallback.body).toMatch(/water|fiber|track|log/i);
  });

  it("does not call OpenAI without AI push consent", async () => {
    const context = buildPepPushContextFromResponses(home(), track(), now);
    const candidate = selectPepPushCandidate(context, now);
    const generateCopy = vi.fn();

    const result = await createPepPushNotification({
      context,
      candidate: candidate!,
      aiPushCopyConsent: false,
      generateCopy,
    });

    expect(generateCopy).not.toHaveBeenCalled();
    expect(result.source).toBe("deterministic");
    expect(result.title).toContain("Pep:");
  });

  it("uses OpenAI copy when consent is present and keeps the prompt grounded in logged data", async () => {
    const context = buildPepPushContextFromResponses(home(), track(), now);
    const candidate = selectPepPushCandidate(context, now);
    const generateCopy = vi.fn(async ({ payload }: { payload: string }) => {
      const parsed = JSON.parse(payload) as { context: unknown };
      expect(parsed.context).toEqual(
        expect.objectContaining({
          recentMeals: [
            expect.objectContaining({ foodName: "Greek yogurt bowl" }),
          ],
        }),
      );
      return JSON.stringify({
        title: "Pep: shot window",
        body: "Your Semaglutide window is close. Log it after it is done and I will keep the cycle aligned.",
      });
    });

    const result = await createPepPushNotification({
      context,
      candidate: candidate!,
      aiPushCopyConsent: true,
      generateCopy,
    });

    expect(generateCopy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      source: "ai",
      title: "Pep: shot window",
    });
  });

  it("falls back to deterministic copy when OpenAI fails", async () => {
    const context = buildPepPushContextFromResponses(home(), track(), now);
    const candidate = selectPepPushCandidate(context, now);

    const result = await createPepPushNotification({
      context,
      candidate: candidate!,
      aiPushCopyConsent: true,
      generateCopy: async () => {
        throw new Error("OpenAI unavailable");
      },
    });

    expect(result.source).toBe("deterministic");
    expect(result.body).toContain("Log it when it's done");
  });
});
