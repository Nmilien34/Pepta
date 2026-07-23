import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteS3Object: vi.fn(),
  prepareComplimentaryCleanupForDeletion: vi.fn(),
  modelDeleteMany: {
    ActivityLogModel: vi.fn(),
    CompoundModel: vi.fn(),
    CycleModel: vi.fn(),
    DoseLogModel: vi.fn(),
    FiberLogModel: vi.fn(),
    InsightModel: vi.fn(),
    MealLogModel: vi.fn(),
    MealScanModel: vi.fn(),
    MeasurementModel: vi.fn(),
    PepMemoryModel: vi.fn(),
    PepPushDeliveryModel: vi.fn(),
    ProcessedWebhookEventModel: vi.fn(),
    ProgressPhotoModel: vi.fn(),
    ProteinLogModel: vi.fn(),
    PushTokenModel: vi.fn(),
    ReferralClaimModel: vi.fn(),
    ScheduleModel: vi.fn(),
    SideEffectLogModel: vi.fn(),
    UserProfileModel: vi.fn(),
    WaterLogModel: vi.fn(),
    WeeklyRetentionModel: vi.fn(),
    WeightLogModel: vi.fn(),
  },
  mealLogFind: vi.fn(),
  mealScanFind: vi.fn(),
  profileFindOne: vi.fn(),
  profileFindOneAndUpdate: vi.fn(),
  progressPhotoFind: vi.fn(),
  userDeleteOne: vi.fn(),
  userFindById: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
}));

vi.mock("../../models", () => ({
  ActivityLogModel: { deleteMany: mocks.modelDeleteMany.ActivityLogModel },
  CompoundModel: { deleteMany: mocks.modelDeleteMany.CompoundModel },
  CycleModel: { deleteMany: mocks.modelDeleteMany.CycleModel },
  DoseLogModel: { deleteMany: mocks.modelDeleteMany.DoseLogModel },
  FiberLogModel: { deleteMany: mocks.modelDeleteMany.FiberLogModel },
  InsightModel: { deleteMany: mocks.modelDeleteMany.InsightModel },
  MealLogModel: {
    deleteMany: mocks.modelDeleteMany.MealLogModel,
    find: mocks.mealLogFind,
  },
  MealScanModel: {
    deleteMany: mocks.modelDeleteMany.MealScanModel,
    find: mocks.mealScanFind,
  },
  MeasurementModel: { deleteMany: mocks.modelDeleteMany.MeasurementModel },
  PepMemoryModel: {
    deleteMany: mocks.modelDeleteMany.PepMemoryModel,
  },
  PepPushDeliveryModel: {
    deleteMany: mocks.modelDeleteMany.PepPushDeliveryModel,
  },
  ProcessedWebhookEventModel: {
    deleteMany: mocks.modelDeleteMany.ProcessedWebhookEventModel,
  },
  ProgressPhotoModel: {
    deleteMany: mocks.modelDeleteMany.ProgressPhotoModel,
    find: mocks.progressPhotoFind,
  },
  ProteinLogModel: { deleteMany: mocks.modelDeleteMany.ProteinLogModel },
  PushTokenModel: { deleteMany: mocks.modelDeleteMany.PushTokenModel },
  ReferralClaimModel: {
    deleteMany: mocks.modelDeleteMany.ReferralClaimModel,
  },
  ScheduleModel: { deleteMany: mocks.modelDeleteMany.ScheduleModel },
  SideEffectLogModel: {
    deleteMany: mocks.modelDeleteMany.SideEffectLogModel,
  },
  UserModel: {
    deleteOne: mocks.userDeleteOne,
    findById: mocks.userFindById,
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
  },
  UserProfileModel: {
    deleteMany: mocks.modelDeleteMany.UserProfileModel,
    exists: vi.fn(),
    findOne: mocks.profileFindOne,
    findOneAndUpdate: mocks.profileFindOneAndUpdate,
  },
  WaterLogModel: { deleteMany: mocks.modelDeleteMany.WaterLogModel },
  WeeklyRetentionModel: {
    deleteMany: mocks.modelDeleteMany.WeeklyRetentionModel,
  },
  WeightLogModel: { deleteMany: mocks.modelDeleteMany.WeightLogModel },
}));

vi.mock("../../services/s3.service", () => ({
  deleteS3Object: mocks.deleteS3Object,
}));

vi.mock("../../services/complimentary-access-cleanup.service", () => ({
  prepareComplimentaryCleanupForDeletion:
    mocks.prepareComplimentaryCleanupForDeletion,
}));

import {
  deleteCurrentUser,
  updateCurrentUser,
  updateProfileSettings,
} from "../../services/user.service";

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

describe("user service account settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(mocks.modelDeleteMany).forEach((fn) => {
      fn.mockResolvedValue({ deletedCount: 1 });
    });
    mocks.deleteS3Object.mockResolvedValue(undefined);
    mocks.prepareComplimentaryCleanupForDeletion.mockResolvedValue(undefined);
    mocks.mealLogFind.mockResolvedValue([]);
    mocks.mealScanFind.mockResolvedValue([]);
    mocks.progressPhotoFind.mockResolvedValue([]);
    mocks.userDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.userFindById.mockResolvedValue(
      document({
        id: userId,
        email: "nick@pepta.app",
        emailVerified: true,
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: true,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }),
    );
    mocks.userFindByIdAndUpdate.mockImplementation(
      (_id: unknown, update: ModelUpdate) =>
        Promise.resolve(
          document({
            id: userId,
            email: "nick@pepta.app",
            emailVerified: true,
            displayName: update.$set?.displayName,
            authProviders: [],
            entitlement: { status: "free", expiresAt: null, willRenew: false },
            onboardingComplete: true,
            createdAt: "2026-06-21T00:00:00.000Z",
            updatedAt: "2026-06-21T00:00:00.000Z",
          }),
        ),
    );
  });

  it("updates the current user's display name", async () => {
    const result = await updateCurrentUser(userId, {
      displayName: "Nico Pepta",
    });

    expect(mocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      { $set: { displayName: "Nico Pepta" } },
      { new: true, runValidators: true },
    );
    expect(result.displayName).toBe("Nico Pepta");
  });

  it("deletes the user, user-owned data, and known S3 images", async () => {
    mocks.progressPhotoFind.mockResolvedValue([
      { s3Key: "pepta/progress/user-1/front.jpg" },
    ]);
    mocks.mealScanFind.mockResolvedValue([
      { photoS3Key: "pepta/meal-scans/user-1/scan.jpg" },
    ]);
    mocks.mealLogFind.mockResolvedValue([
      { photoS3Key: "pepta/meal-logs/user-1/manual.jpg" },
      { photoS3Key: "pepta/meal-scans/user-1/scan.jpg" },
      { photoS3Key: "" },
    ]);
    mocks.userFindById.mockResolvedValue(
      document({
        id: userId,
        email: "nick@pepta.app",
        emailVerified: true,
        avatarKey: "pepta/avatars/user-1/avatar.jpg",
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: true,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }),
    );

    await deleteCurrentUser(userId);

    expect(mocks.deleteS3Object.mock.calls.map(([key]) => key).sort()).toEqual([
      "pepta/avatars/user-1/avatar.jpg",
      "pepta/meal-logs/user-1/manual.jpg",
      "pepta/meal-scans/user-1/scan.jpg",
      "pepta/progress/user-1/front.jpg",
    ]);
    expect(mocks.modelDeleteMany.UserProfileModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.CompoundModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.MealLogModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.ProgressPhotoModel).toHaveBeenCalledWith({
      userId,
    });
    expect(
      mocks.modelDeleteMany.ProcessedWebhookEventModel,
    ).toHaveBeenCalledWith({
      appUserId: userId,
    });
    expect(mocks.modelDeleteMany.ReferralClaimModel).toHaveBeenCalledWith({
      userId,
    });
    expect(
      mocks.prepareComplimentaryCleanupForDeletion,
    ).toHaveBeenCalledWith(expect.objectContaining({ _id: userId }));
    const cleanupOrder =
      mocks.prepareComplimentaryCleanupForDeletion.mock.invocationCallOrder[0]!;
    expect(
      Math.max(
        ...Object.values(mocks.modelDeleteMany).map(
          (mock) => mock.mock.invocationCallOrder[0]!,
        ),
      ),
    ).toBeLessThan(cleanupOrder);
    expect(cleanupOrder).toBeLessThan(
      mocks.userDeleteOne.mock.invocationCallOrder[0]!,
    );
    expect(mocks.userDeleteOne).toHaveBeenCalledWith({ _id: userId });
  });
});
