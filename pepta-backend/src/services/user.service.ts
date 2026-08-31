import {
  ERROR_CODES,
  userProfileInputSchema,
  userProfileResponseSchema,
  userResponseSchema,
  type AuthProvider,
  type UserAccountPatch,
  type UserProfileSettingsPatch,
  type User,
} from "@pepta/shared";
import type { DiscoverySource } from "@pepta/shared";
import type { ProviderIdentity } from "../auth/google";
import { AppError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { prepareComplimentaryCleanupForDeletion } from "./complimentary-access-cleanup.service";
import { computeProfileTargets } from "../lib/profile-targets";
import {
  ActivityLogModel,
  CompoundModel,
  DiscoverySourceModel,
  CycleModel,
  DoseLogModel,
  FavouriteModel,
  FiberLogModel,
  InsightModel,
  MealLogModel,
  DismissedNudgeModel,
  MealScanModel,
  MeasurementModel,
  PepMemoryModel,
  PepPushDeliveryModel,
  ProcessedWebhookEventModel,
  ProgressPhotoModel,
  ProteinLogModel,
  PushTokenModel,
  ReferralClaimModel,
  RecipeModel,
  ScheduleModel,
  SideEffectLogModel,
  UserModel,
  UserProfileModel,
  WaterLogModel,
  WeeklyRetentionModel,
  WeightLogModel,
  type UserDocument,
} from "../models";
import {
  getMediaViewUrl,
  queueAllUserMediaForDeletion,
} from "./media.service";
import { sweepLegacyMediaForDeletion } from "./media-legacy.service";
import { serializeWithSchema } from "./serializers";
import { refreshGoogleAvatar } from "./provider-avatar.service";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function idToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function dateToIso(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value) && typeof value.toISOString === "function") {
    return value.toISOString();
  }

  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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

function normalizeEmail(email?: string): string | undefined {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function findProvider(
  user: UserDocument,
  provider: AuthProvider,
  providerUserId: string,
) {
  return user.authProviders.find(
    (authProvider) =>
      authProvider.provider === provider &&
      authProvider.providerUserId === providerUserId,
  );
}

function applyIdentityToUser(
  user: UserDocument,
  identity: ProviderIdentity,
): void {
  const email = normalizeEmail(identity.email);
  const provider = findProvider(
    user,
    identity.provider,
    identity.providerUserId,
  );

  if (email && !user.email) {
    user.email = email;
    user.emailVerified = identity.emailVerified === true;
  }

  if (email && user.email === email && identity.emailVerified) {
    user.emailVerified = true;
  }

  if (identity.name && user.displayName !== identity.name) {
    user.displayName = identity.name;
  }

  if (provider) {
    provider.linkedAt = new Date();
    return;
  }

  user.authProviders.push({
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    linkedAt: new Date(),
  });
}

function providerConflict(message: string): AppError {
  return new AppError({
    code: ERROR_CODES.conflict,
    message,
    statusCode: 409,
  });
}

export async function serializeUser(user: UserDocument): Promise<User> {
  const value = documentObject(user);
  const userId = idToString(value.id ?? value._id);
  const avatarMediaId = idToString(value.avatarMediaId);
  let avatarUrl: string | undefined;
  if (avatarMediaId) {
    avatarUrl = await getMediaViewUrl(userId, avatarMediaId).catch(
      () => undefined,
    );
  }
  const entitlement = isRecord(value.entitlement) ? value.entitlement : {};
  const authProviders = Array.isArray(value.authProviders)
    ? value.authProviders
    : [];
  const legalAcceptance = isRecord(value.legalAcceptance)
    ? value.legalAcceptance
    : undefined;
  const notificationPreferences = isRecord(value.notificationPreferences)
    ? value.notificationPreferences
    : {};
  const aiPushCopyConsent =
    notificationPreferences.aiPushCopyConsent === true;

  return userResponseSchema.parse({
    id: userId,
    email: optionalString(value.email),
    emailVerified: value.emailVerified === true,
    displayName: optionalString(value.displayName),
    avatarUrl,
    hasAvatar: Boolean(avatarMediaId),
    authProviders: authProviders.map((provider) => {
      const providerRecord = isRecord(provider) ? provider : {};

      return {
        provider: providerRecord.provider,
        providerUserId: providerRecord.providerUserId,
        linkedAt: dateToIso(providerRecord.linkedAt),
      };
    }),
    entitlement: {
      status: entitlement.status ?? "free",
      expiresAt: dateToIso(entitlement.expiresAt) ?? null,
      willRenew: entitlement.willRenew === true,
      revenueCatCustomerId: optionalString(entitlement.revenueCatCustomerId),
      revenueCatEntitlement: optionalString(entitlement.revenueCatEntitlement),
    },
    onboardingComplete: value.onboardingComplete === true,
    onboardingCompletedAt: dateToIso(value.onboardingCompletedAt),
    legalAcceptance: legalAcceptance
      ? {
          termsVersion: legalAcceptance.termsVersion,
          privacyVersion: legalAcceptance.privacyVersion,
          acceptedAt: dateToIso(legalAcceptance.acceptedAt),
        }
      : undefined,
    notificationPreferences: {
      aiPushCopyConsent,
      aiPushCopyConsentAt:
        dateToIso(notificationPreferences.aiPushCopyConsentAt) ?? null,
      aiPushCopyConsentRevokedAt:
        dateToIso(notificationPreferences.aiPushCopyConsentRevokedAt) ?? null,
    },
    createdAt: dateToIso(value.createdAt),
    updatedAt: dateToIso(value.updatedAt),
  });
}

interface UpsertUserFromIdentityResult {
  user: UserDocument;
  isNewUser: boolean;
}

async function refreshTrustedProviderAvatar(
  user: UserDocument,
  identity: ProviderIdentity,
): Promise<void> {
  if (identity.provider !== "google" || !identity.picture) return;
  try {
    await refreshGoogleAvatar(user, identity.picture);
  } catch (error) {
    logger.warn(
      {
        userId: user._id.toString(),
        provider: identity.provider,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "[auth] provider avatar refresh failed",
    );
  }
}

export async function upsertUserFromIdentityWithResult(
  identity: ProviderIdentity,
): Promise<UpsertUserFromIdentityResult> {
  const existingByProvider = await UserModel.findOne({
    authProviders: {
      $elemMatch: {
        provider: identity.provider,
        providerUserId: identity.providerUserId,
      },
    },
  });

  if (existingByProvider) {
    applyIdentityToUser(existingByProvider, identity);
    await existingByProvider.save();
    await refreshTrustedProviderAvatar(existingByProvider, identity);
    return { user: existingByProvider, isNewUser: false };
  }

  const email = normalizeEmail(identity.email);
  const emailIsVerified = identity.emailVerified === true;
  const existingByEmail =
    email && emailIsVerified
      ? await UserModel.findOne({ email, emailVerified: true })
      : null;

  if (existingByEmail) {
    applyIdentityToUser(existingByEmail, identity);
    await existingByEmail.save();
    await refreshTrustedProviderAvatar(existingByEmail, identity);
    return { user: existingByEmail, isNewUser: false };
  }

  const user = await UserModel.create({
    email,
    emailVerified: emailIsVerified,
    displayName: identity.name,
    authProviders: [
      {
        provider: identity.provider,
        providerUserId: identity.providerUserId,
        linkedAt: new Date(),
      },
    ],
    entitlement: {
      status: "free",
      expiresAt: null,
      willRenew: false,
    },
    onboardingComplete: false,
  });

  await refreshTrustedProviderAvatar(user, identity);

  return { user, isNewUser: true };
}

export async function upsertUserFromIdentity(
  identity: ProviderIdentity,
): Promise<UserDocument> {
  const result = await upsertUserFromIdentityWithResult(identity);
  return result.user;
}

export async function linkProviderIdentityToUser(
  userId: string,
  identity: ProviderIdentity,
): Promise<UserDocument> {
  const existingByProvider = await UserModel.findOne({
    authProviders: {
      $elemMatch: {
        provider: identity.provider,
        providerUserId: identity.providerUserId,
      },
    },
  });

  if (existingByProvider && existingByProvider._id.toString() !== userId) {
    throw providerConflict(
      "This sign-in method is already linked to another Pepta account.",
    );
  }

  const user = existingByProvider ?? (await UserModel.findById(userId));
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const hasDifferentIdentityForProvider = user.authProviders.some(
    (authProvider) =>
      authProvider.provider === identity.provider &&
      authProvider.providerUserId !== identity.providerUserId,
  );

  if (hasDifferentIdentityForProvider) {
    throw providerConflict(
      "This account already has that sign-in provider linked.",
    );
  }

  applyIdentityToUser(user, identity);
  await user.save();
  await refreshTrustedProviderAvatar(user, identity);
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

  return serializeUser(user);
}

export async function updateCurrentUser(
  userId: string,
  patch: UserAccountPatch,
): Promise<User> {
  const update: Record<string, unknown> = {};
  if ("displayName" in patch) {
    update.displayName = patch.displayName;
  }
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return serializeUser(user);
}

/**
 * Every collection whose rows belong to ONE user and die with the account.
 *
 * A LIST, not a hand-written fan-out, because the fan-out silently missed a
 * collection: discovery sources survived deletion and were still keyed to the
 * deleted user's id. Nothing failed and nothing logged — the line was simply
 * never added. `user.deletion-coverage.test.ts` walks the real model registry
 * and fails when a userId-bearing model appears in neither this list nor
 * RETAINED_WITH_USER_ID, so the next one cannot be forgotten quietly.
 */
interface UserOwnedModel {
  /** Mongoose sets this; it is what the coverage test matches on. */
  readonly modelName: string;
  deleteMany(filter: { userId: string }): PromiseLike<unknown>;
}

/**
 * A FUNCTION, not a module-level array. Building the list at import time made
 * importing this module touch every model, which broke every test that
 * partially mocks "../../models" — auth.service.test.ts went red on
 * CompoundModel, a model it has nothing to do with. Reading the models inside
 * the call keeps the old laziness: nothing is touched until a deletion runs.
 */
function userOwnedModels(): readonly UserOwnedModel[] {
  return [
    UserProfileModel,
    CompoundModel,
    ScheduleModel,
    CycleModel,
    WeightLogModel,
    DoseLogModel,
    MealLogModel,
    WaterLogModel,
    ProteinLogModel,
    FiberLogModel,
    FavouriteModel,
    ActivityLogModel,
    SideEffectLogModel,
    MeasurementModel,
    ProgressPhotoModel,
    MealScanModel,
    InsightModel,
    WeeklyRetentionModel,
    PushTokenModel,
    ReferralClaimModel,
    RecipeModel,
    PepMemoryModel,
    PepPushDeliveryModel,
    DismissedNudgeModel,
  // Added 2026-08-31. Its absence was the bug this list exists to prevent: a
  // deleted user's "how did you hear about us" answer stayed behind, keyed to
  // an id whose account was gone.
      DiscoverySourceModel,
  ];
}

/**
 * User-keyed rows that this fan-out must NOT touch, and why. Deleting any of
 * them here would be a bug, so each carries its reason rather than sitting in
 * an unexplained exclusion list.
 */
const PURGED_ELSEWHERE: Readonly<Record<string, string>> = {
  // queueAllUserMediaForDeletion marks these deletion_pending and clears their
  // links; a worker removes the S3 objects and then the rows. Deleting the
  // rows here would strand the objects they point at, permanently.
  MediaAsset: "media deletion queue (S3 objects must go before the rows)",
  // prepareComplimentaryCleanupForDeletion deletes the grant outright when no
  // remote call is possible, and otherwise queues a durable cleanup so the
  // RevenueCat revoke survives an outage. Deleting it here would lose that.
  ComplimentaryAccessGrant: "complimentary cleanup queue (revoke must outlive a RevenueCat outage)",
};

/**
 * Keyed by user, deliberately kept. Payment receipts outlive the account by
 * design (see stripPaymentReceiptsForDeletedUser) — they are stripped of the
 * user reference rather than deleted, because Apple disputes arrive later and
 * defending one needs the transaction, not the person.
 */
const RETAINED_WITH_USER_ID: Readonly<Record<string, string>> = {
  ProcessedWebhookEvent: "financial records for Apple disputes; user reference stripped instead",
};

/** Read by user.deletion-coverage.test.ts. */
export function deletionCoverage() {
  return {
    purged: userOwnedModels().map((model) => model.modelName),
    elsewhere: Object.keys(PURGED_ELSEWHERE),
    retained: Object.keys(RETAINED_WITH_USER_ID),
  };
}

/**
 * Strips a deleted account's payment receipts to a financial-records core.
 *
 * The receipts are KEPT — Apple disputes and chargebacks arrive after someone
 * deletes their account, and defending one needs the transaction, not the
 * person. What goes is everything that ties a receipt to this human: the
 * Pepta user reference. What stays is the money: transaction id, product,
 * price and currency, event type, store, environment, timestamps, and the
 * RevenueCat customer id the charge was actually made against.
 *
 * `detached` makes "this belonged to an account that no longer exists" a fact
 * on the row rather than something inferred from a null.
 */
async function stripPaymentReceiptsForDeletedUser(userId: string): Promise<void> {
  await ProcessedWebhookEventModel.updateMany(
    { $or: [{ userId }, { appUserId: userId }] },
    { $set: { userId: null, detached: true } },
  );
}

export async function deleteCurrentUser(userId: string): Promise<void> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Legacy raw-key sweep MUST run before the deleteMany fan-out below: the
  // raw keys live on the product rows, and once those are gone nothing can
  // ever rediscover the S3 objects they pointed at. No S3 calls in here.
  await sweepLegacyMediaForDeletion(userId);
  await queueAllUserMediaForDeletion(userId);

  await Promise.all(
    userOwnedModels().map((model) => model.deleteMany({ userId })),
  );

  // Payment receipts are RETAINED, stripped to a financial-records core.
  // Apple disputes and chargebacks arrive after a user deletes their account,
  // and defending one needs the transaction, not the person. Everything that
  // ties a receipt to this human goes; the money facts stay.
  await stripPaymentReceiptsForDeletedUser(userId);

  // Audit H1: after user-owned data is removed, record durable promotional
  // cleanup immediately before the user document disappears. RevenueCat
  // failure does not block deletion because the cleanup service queues first.
  await prepareComplimentaryCleanupForDeletion(user);
  await UserModel.deleteOne({ _id: userId });
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

/**
 * "Where did you find us?" (onboarding step 7). Upsert — replays from the
 * onboarding draft or a handleComplete retry are idempotent. Lives in its
 * own collection, never serialized into any client-facing response (the
 * user/profile response schemas are strict and bundled into shipped builds).
 */
export async function recordDiscoverySource(
  userId: string,
  source: DiscoverySource,
): Promise<void> {
  await DiscoverySourceModel.findOneAndUpdate(
    { userId },
    { $set: { source } },
    { upsert: true, runValidators: true },
  );
}

/**
 * Record a one-time nudge dismissal ("Not now"). Upsert, so the client can
 * retry the call — or fire it again after an offline queue flush — without
 * a duplicate-key error surfacing as a failed dismissal.
 */
export async function dismissNudge(userId: string, key: string): Promise<void> {
  await DismissedNudgeModel.findOneAndUpdate(
    { userId, key },
    { $setOnInsert: { userId, key } },
    { upsert: true, runValidators: true },
  );
}

export async function listDismissedNudges(userId: string): Promise<string[]> {
  const rows = await DismissedNudgeModel.find({ userId }).select({ key: 1 });
  return rows.map((row) => row.key);
}
