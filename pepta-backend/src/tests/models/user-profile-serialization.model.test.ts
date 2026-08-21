// A strict response schema fed a raw persistence document.
//
// PRODUCTION, 2026-08-21: every /home returned `profile: null` with the raw zod
// error in sectionErrors —
//
//   Unrecognized key(s) in object: 'uiPreferencesUpdatedAt'
//
// userProfileResponseSchema rejects unknown keys, and serializeWithSchema feeds
// it toObject() output directly. `uiPreferencesUpdatedAt` is declared with
// `default: null`, so it exists on EVERY profile document — not just those of
// users who ever opened "What to show". The moment that field shipped, every
// profile serialization threw, on /home and on the profile-update endpoint
// alike: no targets, no companion name, no units.
//
// The preferences are storage-only. They have their own endpoint
// (/me/ui-preferences) which reads them straight off the document, so they must
// never appear in a profile response. These tests pin that, and pin the shape
// of the failure so the next storage-only field added to this model gets the
// same treatment rather than the same outage.

import { describe, expect, it } from "vitest";
import { userProfileResponseSchema } from "@pepta/shared";
import { UserProfileModel } from "../../models/user-profile.model";

/** A profile as it comes back from Mongo, with every default materialised. */
function profileDocument(overrides: Record<string, unknown> = {}) {
  return new UserProfileModel({
    userId: "507f1f77bcf86cd799439011",
    sex: "female",
    dateOfBirth: "1990-01-01",
    ageYears: 36,
    height: 66,
    heightUnit: "in",
    currentWeight: 184,
    weightUnit: "lb",
    goalWeight: 160,
    activityLevel: "light",
    goalWeightUnit: "lb",
    goalType: "lose_fat",
    goalPace: "steady",
    journeyStartDate: "2026-08-01",
    trainingStatus: "consistent",
    biggestWorry: "losing_muscle",
    dailyCalorieTarget: 1600,
    dailyProteinTargetGrams: 154,
    proteinGramsPerKg: 1.8,
    targetWeeklyLossPercent: 0.5,
    dailyFiberTargetGrams: 30,
    dailyWaterTargetOz: 100,
    dailyStepTarget: 8000,
    nutritionEngineVersion: "v1",
    // timestamps: true only populates these on save; a document read back from
    // Mongo always has them, so the fixture supplies them.
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    ...overrides,
  });
}

describe("profile documents survive the strict response schema", () => {
  it("strips uiPreferencesUpdatedAt, which every document carries", () => {
    // default: null means this is present on EVERY profile, including users who
    // have never touched a preference. That is what made the outage universal.
    const plain = profileDocument().toObject() as unknown as Record<string, unknown>;

    expect("uiPreferencesUpdatedAt" in plain).toBe(false);
  });

  it("strips uiPreferences once a user has actually set one", () => {
    const plain = profileDocument({
      uiPreferences: { progressSections: { weight: false } },
      uiPreferencesUpdatedAt: new Date("2026-08-20T00:00:00.000Z"),
    }).toObject() as unknown as Record<string, unknown>;

    expect("uiPreferences" in plain).toBe(false);
    expect("uiPreferencesUpdatedAt" in plain).toBe(false);
  });

  it("serializes cleanly through the strict schema — the actual regression", () => {
    // This is exactly what home.service and user.service do.
    const withPrefs = profileDocument({
      uiPreferences: { progressSections: { weight: false } },
      uiPreferencesUpdatedAt: new Date("2026-08-20T00:00:00.000Z"),
    }).toObject();

    expect(() => userProfileResponseSchema.parse(withPrefs)).not.toThrow();
    expect(() => userProfileResponseSchema.parse(profileDocument().toObject())).not.toThrow();
  });

  it("still keeps the fields the response is actually FOR", () => {
    // A strip that took real profile data with it would be a worse bug than
    // the one it fixes.
    const parsed = userProfileResponseSchema.parse(profileDocument().toObject());

    expect(parsed.dailyProteinTargetGrams).toBe(154);
    expect(parsed.dailyWaterTargetOz).toBe(100);
    expect(parsed.nutritionEngineVersion).toBe("v1");
  });

  it("leaves the preferences readable on the DOCUMENT, where their endpoint reads them", () => {
    // ui-preferences.service reads profile.uiPreferences directly rather than
    // through toObject(), so stripping the plain-object form costs it nothing.
    const doc = profileDocument({
      uiPreferences: { progressSections: { weight: false } },
    });

    expect(doc.uiPreferences).toEqual({ progressSections: { weight: false } });
  });
});
