import { describe, expect, it } from "vitest";
import type { HomeResponse, TrackResponse } from "@pepta/shared";
import { makeHome } from "../../mocks/home";
import { defaultReminderState, deriveReminderGroups } from "../../screens/app/reminderSettings";

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

function homeWithNextDose(overrides: Partial<HomeResponse> = {}): HomeResponse {
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
    nextDose: {
      compoundId: "compound-1",
      compoundName: "Tirzepatide",
        nextDoseAt: "2026-07-04T18:00:00.000Z",
      hoursUntilNextDose: 72,
    },
    ...overrides,
  });
}

describe("deriveReminderGroups", () => {
  it("creates GLP-1 reminder groups from the user's next dose and targets", () => {
    const groups = deriveReminderGroups({
      home: homeWithNextDose(),
      track: track(),
    });

    expect(groups.map((group) => group.title)).toEqual(["DOSE CYCLE", "DAILY ANCHORS", "CHECK-INS"]);

    const items = groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === "dose_due")).toMatchObject({
      label: "Dose reminder",
      subtitle: "Tirzepatide · Jul 4, 2:00 PM",
      defaultOn: true,
      schedule: { kind: "date", datetime: "2026-07-04T18:00:00.000Z" },
    });
    expect(items.find((item) => item.id === "post_dose_checkin")).toMatchObject({
      label: "Post-dose check-in",
      subtitle: "24 hours after your next dose",
      defaultOn: true,
      schedule: { kind: "date", datetime: "2026-07-05T18:00:00.000Z" },
    });
    expect(items.find((item) => item.id === "protein_anchor")).toMatchObject({
      subtitle: "Aim for 125g by evening",
      schedule: { kind: "daily", hour: 11, minute: 30 },
    });
    expect(items.find((item) => item.id === "hydration_check")).toMatchObject({
      subtitle: "Afternoon water + fiber check",
      schedule: { kind: "daily", hour: 15, minute: 30 },
    });
    expect(items.find((item) => item.id === "weekly_weigh_in")).toMatchObject({
      schedule: { kind: "weekly", weekdays: [1], hour: 8, minute: 0 },
    });
    expect(items.find((item) => item.id === "trend_review")).toMatchObject({
      schedule: { kind: "weekly", weekdays: [2], hour: 9, minute: 0 },
    });
    expect(items.find((item) => item.id === "progress_photo")).toMatchObject({
      defaultOn: false,
      schedule: { kind: "timeInterval", seconds: 28 * 24 * 60 * 60, repeats: true },
    });
  });

  it("does not default dose-cycle reminders on when no dose is scheduled", () => {
    const groups = deriveReminderGroups({
      home: homeWithNextDose({ nextDose: null }),
      track: track(),
    });
    const items = groups.flatMap((group) => group.items);

    expect(items.find((item) => item.id === "dose_due")).toMatchObject({
      subtitle: "Set your dose schedule to enable",
      defaultOn: false,
      schedule: { kind: "none" },
    });
    expect(items.find((item) => item.id === "post_dose_checkin")).toMatchObject({
      defaultOn: false,
      schedule: { kind: "none" },
    });
  });

  it("seeds default state with progress photos off and scheduled reminders on", () => {
    const state = defaultReminderState(deriveReminderGroups({ home: homeWithNextDose(), track: track() }));

    expect(state.dose_due).toBe(true);
    expect(state.post_dose_checkin).toBe(true);
    expect(state.protein_anchor).toBe(true);
    expect(state.hydration_check).toBe(true);
    expect(state.weekly_weigh_in).toBe(true);
    expect(state.trend_review).toBe(true);
    expect(state.progress_photo).toBe(false);
  });
});
