import {
  userProfileInputSchema,
  userProfileResponseSchema,
  userResponseSchema,
  type UserProfileSettingsPatch,
} from "@pepta/shared";
import { NotFoundError } from "../lib/errors";
import { computeProfileTargets } from "../lib/profile-targets";
import { UserModel, UserProfileModel } from "../models";
import { serializeWithSchema } from "./serializers";

function documentObject(document: unknown): Record<string, unknown> {
  if (document && typeof document === "object") {
    const maybeDocument = document as { toObject?: unknown };
    if (typeof maybeDocument.toObject === "function") {
      const value = maybeDocument.toObject();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    }
    return document as Record<string, unknown>;
  }

  return {};
}

export async function getOrCreateUser(userId: string) {
  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $setOnInsert: {
        emailVerified: false,
        authProviders: [],
        entitlement: {
          status: "free",
          expiresAt: null,
          willRenew: false,
        },
        onboardingComplete: false,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    },
  );

  return user;
}

export async function getCurrentUser(userId: string) {
  const user = await getOrCreateUser(userId);

  if (typeof user.onboardingComplete !== "boolean") {
    const profileExists = await UserProfileModel.exists({ userId });
    if (profileExists) {
      user.onboardingComplete = true;
      user.onboardingCompletedAt ??= new Date();
      await user.save();
    }
  }

  return serializeWithSchema(userResponseSchema, user);
}

export async function updateProfileSettings(
  userId: string,
  patch: UserProfileSettingsPatch,
) {
  const existingDocument = await UserProfileModel.findOne({ userId });
  if (!existingDocument) {
    throw new NotFoundError("User profile not found");
  }

  const existing = documentObject(existingDocument);
  const merged: Record<string, unknown> = {
    ...existing,
    ...patch,
  };
  const profileInput = userProfileInputSchema.parse({
    sex: merged.sex,
    dateOfBirth: merged.dateOfBirth,
    ageYears: merged.ageYears,
    genderIdentity: merged.genderIdentity,
    medicationStatus: merged.medicationStatus,
    height: merged.height,
    heightUnit: merged.heightUnit,
    currentWeight: merged.currentWeight,
    weightUnit: merged.weightUnit,
    goalWeight: merged.goalWeight,
    goalWeightUnit: merged.goalWeightUnit,
    goalPace: merged.goalPace,
    activityLevel: merged.activityLevel,
    trainingStatus: merged.trainingStatus,
    goalType: merged.goalType,
    biggestWorry: merged.biggestWorry,
    doseUnitPreference: merged.doseUnitPreference,
    onboardingComplete: merged.onboardingComplete,
    journeyStartDate: merged.journeyStartDate,
    timezone: merged.timezone,
    sideEffectBaseline: merged.sideEffectBaseline,
  });
  const targets = computeProfileTargets(profileInput);
  const updatedProfile = await UserProfileModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...patch,
        ageYears: targets.ageYears,
        dailyCalorieTarget: targets.dailyCalorieTarget,
        dailyProteinTargetGrams: targets.dailyProteinTargetGrams,
        proteinGramsPerKg: targets.proteinGramsPerKg,
        targetWeeklyLossPercent: targets.targetWeeklyLossPercent,
        estimatedGoalDate: targets.estimatedGoalDate,
        dailyFiberTargetGrams: targets.dailyFiberTargetGrams,
        dailyWaterTargetOz: targets.dailyWaterTargetOz,
        dailyStepTarget: targets.dailyStepTarget,
        nutritionEngineVersion: targets.nutritionEngineVersion,
      },
    },
    { new: true, runValidators: true },
  );

  if (!updatedProfile) {
    throw new NotFoundError("User profile not found");
  }

  return serializeWithSchema(userProfileResponseSchema, updatedProfile);
}
