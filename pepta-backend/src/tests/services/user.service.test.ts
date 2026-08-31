import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processedUpdateMany: vi.fn(async () => ({ modifiedCount: 0 })),
  deleteS3Object: vi.fn(),
  prepareComplimentaryCleanupForDeletion: vi.fn(),
  queueAllUserMediaForDeletion: vi.fn(),
  sweepLegacyMediaForDeletion: vi.fn(),
  getMediaViewUrl: vi.fn(),
  modelDeleteMany: {
    ActivityLogModel: vi.fn(),
    CompoundModel: vi.fn(),
    CycleModel: vi.fn(),
    DiscoverySourceModel: vi.fn(),
    DismissedNudgeModel: vi.fn(),
    DoseLogModel: vi.fn(),
    FiberLogModel: vi.fn(),
    FavouriteModel: vi.fn(),
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
    RecipeModel: vi.fn(),
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
  refreshGoogleAvatar: vi.fn(),
  userCreate: vi.fn(),
  userDeleteOne: vi.fn(),
  userFindById: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
  userFindOne: vi.fn(),
}));

vi.mock("../../models", () => ({
  ActivityLogModel: { deleteMany: mocks.modelDeleteMany.ActivityLogModel },
  CompoundModel: { deleteMany: mocks.modelDeleteMany.CompoundModel },
  CycleModel: { deleteMany: mocks.modelDeleteMany.CycleModel },
  DiscoverySourceModel: {
    deleteMany: mocks.modelDeleteMany.DiscoverySourceModel,
    findOneAndUpdate: vi.fn(),
  },
  DoseLogModel: { deleteMany: mocks.modelDeleteMany.DoseLogModel },
  FiberLogModel: { deleteMany: mocks.modelDeleteMany.FiberLogModel },
  FavouriteModel: { deleteMany: mocks.modelDeleteMany.FavouriteModel },
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
  DismissedNudgeModel: {
    deleteMany: mocks.modelDeleteMany.DismissedNudgeModel,
  },
  ProcessedWebhookEventModel: {
    deleteMany: mocks.modelDeleteMany.ProcessedWebhookEventModel,
    updateMany: mocks.processedUpdateMany,
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
  RecipeModel: { deleteMany: mocks.modelDeleteMany.RecipeModel },
  ScheduleModel: { deleteMany: mocks.modelDeleteMany.ScheduleModel },
  SideEffectLogModel: {
    deleteMany: mocks.modelDeleteMany.SideEffectLogModel,
  },
  UserModel: {
    create: mocks.userCreate,
    deleteOne: mocks.userDeleteOne,
    findById: mocks.userFindById,
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
    findOne: mocks.userFindOne,
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

vi.mock("../../services/media.service", () => ({
  getMediaViewUrl: mocks.getMediaViewUrl,
  queueAllUserMediaForDeletion: mocks.queueAllUserMediaForDeletion,
}));

vi.mock("../../services/media-legacy.service", () => ({
  sweepLegacyMediaForDeletion: mocks.sweepLegacyMediaForDeletion,
}));

vi.mock("../../services/provider-avatar.service", () => ({
  refreshGoogleAvatar: mocks.refreshGoogleAvatar,
}));

import {
  deleteCurrentUser,
  serializeUser,
  upsertUserFromIdentityWithResult,
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
    mocks.queueAllUserMediaForDeletion.mockResolvedValue(undefined);
    mocks.sweepLegacyMediaForDeletion.mockResolvedValue({
      registered: 0,
      alreadyTracked: 0,
      nonConforming: 0,
    });
    mocks.getMediaViewUrl.mockResolvedValue("https://signed.example/avatar");
    mocks.mealLogFind.mockResolvedValue([]);
    mocks.mealScanFind.mockResolvedValue([]);
    mocks.progressPhotoFind.mockResolvedValue([]);
    mocks.refreshGoogleAvatar.mockResolvedValue(undefined);
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

  it("serializes only the active Pepta avatar as a signed URL", async () => {
    const mediaId = "507f1f77bcf86cd799439012";
    const result = await serializeUser(
      document({
        id: userId,
        email: "nick@pepta.app",
        emailVerified: true,
        avatarMediaId: mediaId,
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: true,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }) as never,
    );

    expect(mocks.getMediaViewUrl).toHaveBeenCalledWith(userId, mediaId);
    expect(result).toMatchObject({
      avatarUrl: "https://signed.example/avatar",
      hasAvatar: true,
    });
  });

  it("keeps the user readable when avatar signing fails", async () => {
    mocks.getMediaViewUrl.mockRejectedValueOnce(new Error("S3 unavailable"));
    const result = await serializeUser(
      document({
        id: userId,
        email: "nick@pepta.app",
        emailVerified: true,
        avatarMediaId: "507f1f77bcf86cd799439012",
        avatarUrl: "https://provider.example/should-not-leak",
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: true,
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
      }) as never,
    );

    expect(result.hasAvatar).toBe(true);
    expect(result.avatarUrl).toBeUndefined();
  });

  it("refreshes only the freshly verified Google picture and never fails identity persistence", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const user = {
      ...document({
        id: "507f1f77bcf86cd799439011",
        email: "nick@pepta.app",
        emailVerified: true,
        authProviders: [
          {
            provider: "google",
            providerUserId: "google-user",
            linkedAt: new Date(),
          },
        ],
      }),
      save,
    };
    mocks.userFindOne.mockResolvedValueOnce(user);
    mocks.refreshGoogleAvatar.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      upsertUserFromIdentityWithResult({
        provider: "google",
        providerUserId: "google-user",
        email: "nick@pepta.app",
        emailVerified: true,
        picture: "https://lh3.googleusercontent.com/a/photo",
      }),
    ).resolves.toMatchObject({ user, isNewUser: false });

    expect(save).toHaveBeenCalled();
    expect(mocks.refreshGoogleAvatar).toHaveBeenCalledWith(
      user,
      "https://lh3.googleusercontent.com/a/photo",
    );
  });

  it("queues all media before account deletion without calling S3 synchronously", async () => {
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

    await deleteCurrentUser(userId);

    expect(mocks.deleteS3Object).not.toHaveBeenCalled();
    expect(mocks.progressPhotoFind).not.toHaveBeenCalled();
    expect(mocks.modelDeleteMany.UserProfileModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.CompoundModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.MealLogModel).toHaveBeenCalledWith({
      userId,
    });
    // Was missing from the fan-out until 2026-08-31: a deleted user's
    // "how did you hear about us" answer outlived their account.
    expect(mocks.modelDeleteMany.DiscoverySourceModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.ProgressPhotoModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.FavouriteModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.RecipeModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.queueAllUserMediaForDeletion).toHaveBeenCalledWith(userId);
    // Payment receipts are RETAINED and stripped, not deleted: a chargeback
    // can arrive after the account is gone, and defending it needs the
    // transaction rather than the person.
    expect(mocks.modelDeleteMany.ProcessedWebhookEventModel).not.toHaveBeenCalled();
    expect(mocks.processedUpdateMany).toHaveBeenCalledWith(
      { $or: [{ userId }, { appUserId: userId }] },
      { $set: { userId: null, detached: true } },
    );
    expect(mocks.modelDeleteMany.ReferralClaimModel).toHaveBeenCalledWith({
      userId,
    });
    expect(mocks.modelDeleteMany.DismissedNudgeModel).toHaveBeenCalledWith({
      userId,
    });
    expect(
      mocks.prepareComplimentaryCleanupForDeletion,
    ).toHaveBeenCalledWith(expect.objectContaining({ _id: userId }));
    expect(mocks.queueAllUserMediaForDeletion).toHaveBeenCalledWith(userId);
    expect(
      mocks.queueAllUserMediaForDeletion.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.modelDeleteMany.FavouriteModel.mock.invocationCallOrder[0]!,
    );
    // The legacy raw-key sweep must read the product rows before ANY of the
    // deleteMany calls destroy them — once a row is gone, so is the only
    // record of its S3 key.
    expect(mocks.sweepLegacyMediaForDeletion).toHaveBeenCalledWith(userId);
    expect(
      mocks.sweepLegacyMediaForDeletion.mock.invocationCallOrder[0],
    ).toBeLessThan(
      Math.min(
        ...Object.values(mocks.modelDeleteMany)
          // ProcessedWebhookEventModel is no longer deleted, so it has no
          // invocation order to compare against.
          .map((mock) => mock.mock.invocationCallOrder[0])
          .filter((order): order is number => typeof order === "number"),
      ),
    );
    const cleanupOrder =
      mocks.prepareComplimentaryCleanupForDeletion.mock.invocationCallOrder[0]!;
    expect(
      Math.max(
        ...Object.values(mocks.modelDeleteMany)
          .map((mock) => mock.mock.invocationCallOrder[0])
          .filter((order): order is number => typeof order === "number"),
      ),
    ).toBeLessThan(cleanupOrder);
    expect(cleanupOrder).toBeLessThan(
      mocks.userDeleteOne.mock.invocationCallOrder[0]!,
    );
    expect(
      mocks.queueAllUserMediaForDeletion.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.userDeleteOne.mock.invocationCallOrder[0]!);
    expect(mocks.userDeleteOne).toHaveBeenCalledWith({ _id: userId });
  });
});
