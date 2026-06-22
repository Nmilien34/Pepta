import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profileFindOne: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
}));

vi.mock("../../models", () => ({
  UserModel: {
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
  },
  UserProfileModel: {
    exists: vi.fn(),
    findOne: mocks.profileFindOne,
    findOneAndUpdate: mocks.profileFindOneAndUpdate,
  },
}));

import { updateProfileSettings } from "../../services/user.service";

type ModelUpdate = {
  $set?: Record<string, unknown>;
};

function document(value: Record<string, unknown>) {
  return {
    _id: value.id,
    ...value,
    toObject: () => value,
  };
}

const userId = "user-1";
const existingProfile = {
  id: "profile-1",
  userId,
  sex: "female",
  ageYears: 99,
  dateOfBirth: "1986-06-21",
  genderIdentity: "woman",
  medicationStatus: "active",
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
  biggestWorry: "side_effects",
  doseUnitPreference: "mg",
  onboardingComplete: true,
  journeyStartDate: "2026-06-01",
  timezone: "America/New_York",
  sideEffectBaseline: [],
  dailyCalorieTarget: 1510,
  dailyProteinTargetGrams: 136,
  proteinGramsPerKg: 2,
  targetWeeklyLossPercent: 0.75,
  estimatedGoalDate: "2027-03-01",
  dailyFiberTargetGrams: 30,
  dailyWaterTargetOz: 90,
  dailyStepTarget: 7000,
  nutritionEngineVersion: "nutrition-v2",
  createdAt: "2026-06-21T00:00:00.000Z",
  updatedAt: "2026-06-21T00:00:00.000Z",
};

function getProfileUpdate(): ModelUpdate {
  const call = mocks.profileFindOneAndUpdate.mock.calls[0] as
    | [unknown, ModelUpdate, unknown]
    | undefined;
  expect(call).toBeDefined();
  return call?.[1] ?? {};
}

describe("user service profile settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileFindOne.mockResolvedValue(document(existingProfile));
    mocks.profileFindOneAndUpdate.mockImplementation(
      (_filter: unknown, update: ModelUpdate) =>
        Promise.resolve(
          document({
            ...existingProfile,
            ...(update.$set ?? {}),
          }),
        ),
    );
  });

  it("recomputes nutrition and lifestyle targets when editable profile fields change", async () => {
    const result = await updateProfileSettings(userId, {
      currentWeight: 170,
      dateOfBirth: "1986-06-21",
      sideEffectBaseline: ["constipation"],
    });

    const update = getProfileUpdate().$set ?? {};
    expect(update).toEqual(
      expect.objectContaining({
        currentWeight: 170,
        ageYears: 40,
        dailyFiberTargetGrams: 38,
        dailyWaterTargetOz: 101,
        dailyStepTarget: 7000,
        nutritionEngineVersion: "nutrition-v2",
      }),
    );
    expect(result.dailyWaterTargetOz).toBe(101);
    expect(result.dailyFiberTargetGrams).toBe(38);
  });
});
