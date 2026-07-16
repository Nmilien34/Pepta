import { z } from "zod";
import {
  ACTIVITY_LEVELS,
  AUTH_PROVIDERS,
  BIGGEST_WORRIES,
  COMPOUND_STATUSES,
  DOSE_UNITS,
  DRUG_CLASSES,
  ERROR_CODES,
  GENDER_IDENTITIES,
  GOAL_PACES,
  GOAL_TYPES,
  HEIGHT_UNITS,
  INJECTION_SITES,
  INSIGHT_SEVERITIES,
  INSIGHT_TYPES,
  MEDICATION_FREQUENCIES,
  INJECTION_DEVICE_TYPES,
  MEDICATION_ROUTES,
  MEDICATION_STATUSES,
  MEAL_LOG_SOURCES,
  MEASUREMENT_TYPES,
  PROGRESS_PHOTO_KINDS,
  PROGRESS_PHOTO_STATUSES,
  RESEARCH_ARTICLE_CATEGORIES,
  RETENTION_DRIVERS,
  RETENTION_VERDICTS,
  SCHEDULE_FREQUENCIES,
  SEX_VALUES,
  SIDE_EFFECT_TYPES,
  SUBSCRIPTION_STATUSES,
  TRAINING_STATUSES,
  WEIGHT_UNITS,
} from "../constants";

export const idSchema = z.string().min(1);
export const isoDateTimeSchema = z.string().datetime();
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const authProviderSchema = z.enum(AUTH_PROVIDERS);
export const sexSchema = z.enum(SEX_VALUES);
export const heightUnitSchema = z.enum(HEIGHT_UNITS);
export const weightUnitSchema = z.enum(WEIGHT_UNITS);
export const activityLevelSchema = z.enum(ACTIVITY_LEVELS);
export const trainingStatusSchema = z.enum(TRAINING_STATUSES);
export const goalTypeSchema = z.enum(GOAL_TYPES);
export const goalPaceSchema = z.enum(GOAL_PACES);
export const biggestWorrySchema = z.enum(BIGGEST_WORRIES);
export const doseUnitSchema = z.enum(DOSE_UNITS);
export const drugClassSchema = z.enum(DRUG_CLASSES);
export const medicationRouteSchema = z.enum(MEDICATION_ROUTES);
export const injectionDeviceTypeSchema = z.enum(INJECTION_DEVICE_TYPES);
export const medicationFrequencySchema = z.enum(MEDICATION_FREQUENCIES);
export const medicationStatusSchema = z.enum(MEDICATION_STATUSES);
export const genderIdentitySchema = z.enum(GENDER_IDENTITIES);
export const compoundStatusSchema = z.enum(COMPOUND_STATUSES);
export const injectionSiteSchema = z.enum(INJECTION_SITES);
export const mealLogSourceSchema = z.enum(MEAL_LOG_SOURCES);
export const sideEffectTypeSchema = z.enum(SIDE_EFFECT_TYPES);
export const measurementTypeSchema = z.enum(MEASUREMENT_TYPES);
export const scheduleFrequencySchema = z.enum(SCHEDULE_FREQUENCIES);
export const insightTypeSchema = z.enum(INSIGHT_TYPES);
export const insightSeveritySchema = z.enum(INSIGHT_SEVERITIES);
export const retentionDriverSchema = z.enum(RETENTION_DRIVERS);
export const retentionVerdictSchema = z.enum(RETENTION_VERDICTS);
export const progressPhotoStatusSchema = z.enum(PROGRESS_PHOTO_STATUSES);
export const progressPhotoKindSchema = z.enum(PROGRESS_PHOTO_KINDS);
export const researchArticleCategorySchema = z.enum(
  RESEARCH_ARTICLE_CATEGORIES,
);
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export const pushPlatformSchema = z.enum(["ios", "android", "web"]);

export const apiErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

export const apiResponseSchema = <TData extends z.ZodTypeAny>(data: TData) =>
  z.object({ data }).strict();

export const apiErrorResponseSchema = z
  .object({ error: apiErrorSchema })
  .strict();

export const linkedAuthProviderSchema = z
  .object({
    provider: authProviderSchema,
    providerUserId: z.string().min(1),
    linkedAt: isoDateTimeSchema,
  })
  .strict();

export const entitlementSchema = z
  .object({
    status: subscriptionStatusSchema,
    expiresAt: isoDateTimeSchema.nullable(),
    willRenew: z.boolean(),
    revenueCatCustomerId: z.string().min(1).optional(),
    revenueCatEntitlement: z.string().min(1).optional(),
  })
  .strict();

export const legalAcceptanceSchema = z
  .object({
    termsVersion: z.string().trim().min(1),
    privacyVersion: z.string().trim().min(1),
    acceptedAt: isoDateTimeSchema,
  })
  .strict();

export const notificationPreferencesResponseSchema = z
  .object({
    aiPushCopyConsent: z.boolean(),
    aiPushCopyConsentAt: isoDateTimeSchema.nullable(),
    aiPushCopyConsentRevokedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const notificationPreferencesPatchSchema = z
  .object({
    aiPushCopyConsent: z.boolean(),
  })
  .strict();

export const pushTokenRegistrationRequestSchema = z
  .object({
    token: z.string().trim().min(1),
    platform: pushPlatformSchema,
    deviceId: z.string().trim().min(1).optional(),
    appVersion: z.string().trim().min(1).optional(),
  })
  .strict();

export const pushTokenRegistrationResponseSchema = z
  .object({
    token: z.string().trim().min(1),
    platform: pushPlatformSchema,
    enabled: z.boolean(),
    lastSeenAt: isoDateTimeSchema,
  })
  .strict();

export const userResponseSchema = z
  .object({
    id: idSchema,
    email: z.string().email().optional(),
    emailVerified: z.boolean(),
    displayName: z.string().min(1).optional(),
    avatarUrl: z.string().url().optional(),
    hasAvatar: z.boolean().default(false),
    authProviders: z.array(linkedAuthProviderSchema),
    entitlement: entitlementSchema,
    onboardingComplete: z.boolean(),
    onboardingCompletedAt: isoDateTimeSchema.optional(),
    legalAcceptance: legalAcceptanceSchema.optional(),
    notificationPreferences: notificationPreferencesResponseSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const avatarContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export const avatarUploadIntentRequestSchema = z
  .object({
    contentType: avatarContentTypeSchema,
    sizeBytes: z.number().int().positive().optional(),
  })
  .strict();

export const avatarUploadIntentResponseSchema = z
  .object({
    key: z.string().min(1),
    uploadUrl: z.string().url(),
    expiresAt: isoDateTimeSchema,
  })
  .strict();

export const avatarConfirmRequestSchema = z
  .object({
    key: z.string().min(1),
  })
  .strict();

export const avatarViewUrlResponseSchema = z
  .object({
    viewUrl: z.string().url().nullable(),
    expiresAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const userAccountPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    avatarUrl: z.string().url().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one account field is required",
  });

export const googleAuthSchema = z
  .object({
    idToken: z.string().min(1),
  })
  .strict();

export const appleFullNameSchema = z
  .object({
    givenName: z.string().trim().min(1).optional(),
    familyName: z.string().trim().min(1).optional(),
  })
  .strict();

export const appleAuthSchema = z
  .object({
    identityToken: z.string().min(1),
    fullName: appleFullNameSchema.optional(),
  })
  .strict();

export const authResponseSchema = z
  .object({
    token: z.string().min(1),
    user: userResponseSchema,
    isNewUser: z.boolean().optional(),
  })
  .strict();

const baseUserProfileInputSchema = z
  .object({
    sex: sexSchema.optional(),
    dateOfBirth: dateOnlySchema.optional(),
    ageYears: z.number().int().min(18).max(100).optional(),
    genderIdentity: genderIdentitySchema.optional(),
    medicationStatus: medicationStatusSchema.default("none"),
    height: z.number().positive(),
    heightUnit: heightUnitSchema,
    currentWeight: z.number().positive(),
    weightUnit: weightUnitSchema,
    goalWeight: z.number().positive(),
    goalWeightUnit: weightUnitSchema,
    goalPace: goalPaceSchema,
    activityLevel: activityLevelSchema,
    trainingStatus: trainingStatusSchema,
    goalType: goalTypeSchema,
    biggestWorry: biggestWorrySchema,
    doseUnitPreference: doseUnitSchema.default("mg"),
    onboardingComplete: z.boolean().default(false),
    journeyStartDate: dateOnlySchema,
    timezone: z.string().trim().min(1).default("America/New_York"),
    sideEffectBaseline: z.array(sideEffectTypeSchema).default([]),
  })
  .strict();

export const userProfileInputSchema = baseUserProfileInputSchema.refine(
  (profile) =>
    profile.dateOfBirth !== undefined || profile.ageYears !== undefined,
  {
    message: "dateOfBirth or ageYears is required",
    path: ["dateOfBirth"],
  },
);

export const userProfileResponseSchema = baseUserProfileInputSchema.extend({
  ageYears: z.number().int().min(18).max(100),
  id: idSchema,
  userId: idSchema,
  dailyCalorieTarget: z.number().int().positive(),
  dailyProteinTargetGrams: z.number().int().positive(),
  proteinGramsPerKg: z.number().positive(),
  targetWeeklyLossPercent: z.number().nonnegative(),
  estimatedGoalDate: dateOnlySchema.nullable(),
  dailyFiberTargetGrams: z.number().int().positive(),
  dailyWaterTargetOz: z.number().int().positive(),
  dailyStepTarget: z.number().int().nonnegative(),
  nutritionEngineVersion: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const userProfileSettingsPatchSchema = z
  .object({
    sex: sexSchema.optional(),
    dateOfBirth: dateOnlySchema.optional(),
    ageYears: z.number().int().min(18).max(100).optional(),
    genderIdentity: genderIdentitySchema.optional(),
    medicationStatus: medicationStatusSchema.optional(),
    height: z.number().positive().optional(),
    heightUnit: heightUnitSchema.optional(),
    currentWeight: z.number().positive().optional(),
    weightUnit: weightUnitSchema.optional(),
    goalWeight: z.number().positive().optional(),
    goalWeightUnit: weightUnitSchema.optional(),
    goalPace: goalPaceSchema.optional(),
    activityLevel: activityLevelSchema.optional(),
    trainingStatus: trainingStatusSchema.optional(),
    goalType: goalTypeSchema.optional(),
    biggestWorry: biggestWorrySchema.optional(),
    doseUnitPreference: doseUnitSchema.optional(),
    journeyStartDate: dateOnlySchema.optional(),
    timezone: z.string().trim().min(1).optional(),
    sideEffectBaseline: z.array(sideEffectTypeSchema).optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one profile field is required",
  });

export const medicationCatalogItemSchema = z
  .object({
    id: idSchema,
    slug: z.string().min(1),
    name: z.string().min(1),
    brand: z.string().min(1).optional(),
    drugClass: drugClassSchema,
    route: medicationRouteSchema.default("injection"),
    defaultFrequency: medicationFrequencySchema.default("weekly"),
    commonDoses: z.array(z.number().positive()).default([]),
    halfLifeDays: z.number().positive(),
    doseUnit: doseUnitSchema,
    defaultDose: z.number().positive().optional(),
    active: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const compoundInputSchema = z
  .object({
    medicationCatalogId: idSchema.optional(),
    name: z.string().trim().min(1),
    drugClass: drugClassSchema,
    route: medicationRouteSchema.default("injection"),
    // How the user injects (pen vs vial etc.) — optional; oral compounds omit it.
    deviceType: injectionDeviceTypeSchema.optional(),
    halfLifeDays: z.number().positive(),
    doseUnit: doseUnitSchema,
    plannedDose: z.number().positive().optional(),
    concentration: z.number().positive().optional(),
    concentrationUnit: z.string().trim().min(1).optional(),
    startDate: dateOnlySchema,
    status: compoundStatusSchema.default("active"),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const compoundResponseSchema = compoundInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const compoundPatchSchema = compoundInputSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one compound field is required",
  });

export const weightLogInputSchema = z
  .object({
    value: z.number().positive(),
    unit: weightUnitSchema,
    datetime: isoDateTimeSchema,
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const weightLogResponseSchema = weightLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const doseLogInputSchema = z
  .object({
    compoundId: idSchema,
    amount: z.number().positive(),
    unit: doseUnitSchema,
    injectionSite: injectionSiteSchema.optional(),
    datetime: isoDateTimeSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const doseLogResponseSchema = doseLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const mealLogInputSchema = z
  .object({
    foodName: z.string().trim().min(1),
    servingSize: z.string().trim().min(1).optional(),
    protein: z.number().nonnegative(),
    calories: z.number().nonnegative(),
    carbs: z.number().nonnegative().optional(),
    fat: z.number().nonnegative().optional(),
    fiber: z.number().nonnegative().optional(),
    source: mealLogSourceSchema,
    datetime: isoDateTimeSchema,
    photoS3Key: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const mealLogResponseSchema = mealLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const waterLogInputSchema = z
  .object({
    amountOz: z.number().positive(),
    datetime: isoDateTimeSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const waterLogResponseSchema = waterLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const proteinLogInputSchema = z
  .object({
    grams: z.number().positive(),
    source: z.string().trim().min(1).optional(),
    datetime: isoDateTimeSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const proteinLogResponseSchema = proteinLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const fiberLogInputSchema = z
  .object({
    grams: z.number().positive(),
    source: z.string().trim().min(1).optional(),
    datetime: isoDateTimeSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const fiberLogResponseSchema = fiberLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const activityLogInputSchema = z
  .object({
    steps: z.number().int().nonnegative().optional(),
    workoutMinutes: z.number().int().nonnegative().optional(),
    resistanceTraining: z.boolean().default(false),
    datetime: isoDateTimeSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const activityLogResponseSchema = activityLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const sideEffectLogInputSchema = z
  .object({
    types: z.array(sideEffectTypeSchema).min(1),
    customType: z.string().trim().min(1).optional(),
    severity: z.number().int().min(1).max(5),
    datetime: isoDateTimeSchema,
    relatedDoseLogId: idSchema.optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const sideEffectLogResponseSchema = sideEffectLogInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const measurementInputSchema = z
  .object({
    type: measurementTypeSchema,
    value: z.number().nonnegative(),
    unit: z.string().trim().min(1),
    datetime: isoDateTimeSchema,
    idempotencyKey: z.string().trim().min(1).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const measurementResponseSchema = measurementInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const cycleInputSchema = z
  .object({
    name: z.string().trim().min(1),
    compoundIds: z.array(idSchema).min(1),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export const cycleResponseSchema = cycleInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const scheduleInputSchema = z
  .object({
    compoundId: idSchema,
    frequency: scheduleFrequencySchema,
    intervalDays: z.number().int().positive().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    nextDoseAt: isoDateTimeSchema.optional(),
    active: z.boolean().default(true),
  })
  .strict();

export const scheduleResponseSchema = scheduleInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const schedulePatchSchema = scheduleInputSchema
  .omit({ compoundId: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one schedule field is required",
  });

export const lifestyleTargetsSchema = z
  .object({
    dailyWaterTargetOz: z.number().int().positive(),
    dailyFiberTargetGrams: z.number().int().positive(),
    dailyStepTarget: z.number().int().nonnegative(),
    adjustedFor: z.array(sideEffectTypeSchema),
  })
  .strict();

export const onboardingCompleteInputSchema = z
  .object({
    profile: userProfileInputSchema,
    compound: compoundInputSchema.optional(),
    schedule: scheduleInputSchema.omit({ compoundId: true }).optional(),
    lastDose: doseLogInputSchema.omit({ compoundId: true }).optional(),
    baselineWeight: weightLogInputSchema,
    sideEffectBaseline: z.array(sideEffectTypeSchema).default([]),
    legalAcceptance: legalAcceptanceSchema.optional(),
  })
  .strict();

export const onboardingResultResponseSchema = z
  .object({
    profile: userProfileResponseSchema,
    lifestyleTargets: lifestyleTargetsSchema,
    planHighlights: z.array(z.string().trim().min(1)),
  })
  .strict();

export const medicationLevelPointSchema = z
  .object({
    datetime: isoDateTimeSchema,
    level: z.number().nonnegative(),
  })
  .strict();

export const medicationLevelResponseSchema = z
  .object({
    compoundId: idSchema,
    compoundName: z.string().min(1),
    halfLifeDays: z.number().positive(),
    currentEstimate: z.number().nonnegative(),
    peakEstimate: z.number().nonnegative(),
    troughEstimate: z.number().nonnegative(),
    curve: z.array(medicationLevelPointSchema),
    nextDoseAt: isoDateTimeSchema.nullable(),
    hoursUntilNextDose: z.number().nonnegative().nullable(),
    estimateBasis: z.literal("relative-dose-equivalent"),
    engineVersion: z.string().min(1),
  })
  .strict();

export const insightSchema = z
  .object({
    id: idSchema,
    type: insightTypeSchema,
    headline: z.string().min(1),
    body: z.string().min(1),
    severity: insightSeveritySchema,
    cta: z.string().min(1).optional(),
    deterministicSignal: z.record(z.unknown()),
    generatedAt: isoDateTimeSchema,
    copyVersion: z.string().min(1).optional(),
  })
  .strict();

export const weeklyRetentionDriverSchema = z
  .object({
    type: retentionDriverSchema,
    label: z.string().min(1),
    score: z.number().min(0).max(100),
    contribution: z.number(),
  })
  .strict();

export const weeklyRetentionResponseSchema = z
  .object({
    weekOf: dateOnlySchema,
    score: z.number().min(0).max(100),
    verdict: retentionVerdictSchema,
    verdictProse: z.string().min(1),
    drivers: z.array(weeklyRetentionDriverSchema),
    penaltyApplied: z.boolean().optional(),
    engineVersion: z.string().min(1),
    copyVersion: z.string().min(1).nullable(),
  })
  .strict();

export const homeRangeKeySchema = z.enum(["today", "week", "month", "year"]);

export const homeRangeTotalsSchema = z
  .object({
    key: homeRangeKeySchema,
    label: z.string().min(1),
    proteinGrams: z.number().nonnegative(),
    fiberGrams: z.number().nonnegative(),
    calories: z.number().nonnegative(),
    waterOz: z.number().nonnegative(),
    dayCount: z.number().int().positive(),
    hasData: z.boolean(),
  })
  .strict();

export const stallDiagnosticInputSchema = z
  .object({
    lookbackDays: z.number().int().min(14).max(90).default(30),
  })
  .strict();

export const stallDiagnosticResponseSchema = z
  .object({
    stalled: z.boolean(),
    daysWeightFlat: z.number().int().nonnegative(),
    deterministicReasons: z.array(z.string().min(1)),
    explanation: z.string().min(1),
    suggestedFix: z.string().min(1),
    engineVersion: z.string().min(1),
    copyVersion: z.string().min(1).nullable(),
  })
  .strict();

export const mealScanInputSchema = z
  .object({
    imageData: z.string().min(1),
    imageMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    capturedAt: isoDateTimeSchema.optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const mealProductScanInputSchema = mealScanInputSchema;

export const mealBarcodeInputSchema = z
  .object({
    barcode: z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, "Expected a numeric barcode"),
    scannedAt: isoDateTimeSchema.optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export const mealVoiceInputSchema = z
  .object({
    transcript: z.string().trim().min(1),
    recordedAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const mealTranscriptionInputSchema = z
  .object({
    audioData: z.string().trim().min(1),
    audioMimeType: z.enum([
      "audio/m4a",
      "audio/mp4",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/webm",
      "audio/x-m4a",
    ]),
  })
  .strict();

export const mealTranscriptResponseSchema = z
  .object({
    transcript: z.string().trim().min(1),
  })
  .strict();

export const mealScanModeSchema = z.enum(["affirmation", "swap"]);

export const mealScanAnalysisSchema = z
  .object({
    foodName: z.string().trim().min(1),
    servingSize: z.string().trim().min(1),
    protein: z.number().nonnegative(),
    calories: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    fiber: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const mealScanAdjustedMacrosSchema = z
  .object({
    protein: z.number().nonnegative(),
    calories: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    fiber: z.number().nonnegative(),
  })
  .strict();

export const mealScanCoachContentSchema = z
  .object({
    mode: mealScanModeSchema,
    callout: z.string().trim().min(1),
    swap: z
      .object({
        description: z.string().trim().min(1),
        additionalProtein: z.number().nonnegative(),
        additionalCalories: z.number().nonnegative(),
        adjustedMacros: mealScanAdjustedMacrosSchema,
      })
      .strict()
      .nullable(),
    copyVersion: z.string().trim().min(1),
  })
  .strict();

export const mealProductCitationSchema = z
  .object({
    title: z.string().trim().min(1),
    url: z.string().url(),
  })
  .strict();

export const mealProductScanMetadataSchema = z
  .object({
    mode: z.enum(["product_scan", "barcode"]),
    barcode: z.string().trim().min(1).optional(),
    brand: z.string().trim().min(1).optional(),
    productName: z.string().trim().min(1).optional(),
    source: z.enum([
      "cache",
      "open_food_facts",
      "openai_web_search",
      "together_vision",
      "manual_label",
    ]),
    citations: z.array(mealProductCitationSchema).default([]),
  })
  .strict();

export const mealScanResponseSchema = z
  .object({
    scanId: idSchema,
    photoS3Key: z.string().min(1).optional(),
    analysis: mealScanAnalysisSchema,
    coachContent: mealScanCoachContentSchema.nullable(),
    note: z.string().trim().min(1).optional(),
    visionEngineVersion: z.string().min(1),
    product: mealProductScanMetadataSchema.optional(),
  })
  .strict();

export const mealLogScanDetailResponseSchema = z
  .object({
    photoViewUrl: z.string().nullable(),
    analysis: mealScanAnalysisSchema.nullable(),
    coachContent: mealScanCoachContentSchema.nullable(),
    note: z.string().trim().min(1).nullable(),
  })
  .strict();

export const progressPhotoInputSchema = z
  .object({
    captureDate: dateOnlySchema,
    contentType: z.enum([
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/webp",
    ]),
    sizeBytes: z.number().int().positive().optional(),
    kind: progressPhotoKindSchema.default("body"),
    faceFullness: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export const progressPhotoSchema = progressPhotoInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  s3Key: z.string().min(1),
  status: progressPhotoStatusSchema,
  viewUrl: z.string().url().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const progressPhotoUploadIntentResponseSchema = z
  .object({
    photo: progressPhotoSchema,
    uploadUrl: z.string().url(),
    expiresAt: isoDateTimeSchema,
  })
  .strict();

export const progressPhotoConfirmInputSchema = z
  .object({
    photoId: idSchema,
    sizeBytes: z.number().int().positive().optional(),
  })
  .strict();

export const researchArticleSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    url: z.string().url(),
    source: z.string().min(1),
    category: researchArticleCategorySchema,
    publishedAt: dateOnlySchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const homeResponseSchema = z
  .object({
    profile: userProfileResponseSchema.nullable(),
    activeCompounds: z.array(compoundResponseSchema),
    medicationLevels: z.array(medicationLevelResponseSchema),
    selectedRange: homeRangeKeySchema.default("today"),
    rangeTotals: homeRangeTotalsSchema.optional(),
    rangeAvailability: z.record(homeRangeKeySchema, z.boolean()).optional(),
    todayProteinGrams: z.number().nonnegative(),
    todayFiberGrams: z.number().nonnegative(),
    todayCalories: z.number().nonnegative(),
    todayWaterOz: z.number().nonnegative(),
    streakDays: z.number().int().nonnegative(),
    setupProgress: z
      .object({
        loggedItems: z.number().int().nonnegative(),
        required: z.number().int().positive(),
        unlocked: z.boolean(),
      })
      .strict(),
    nextDose: z
      .object({
        compoundId: idSchema,
        compoundName: z.string().min(1),
        nextDoseAt: isoDateTimeSchema,
        hoursUntilNextDose: z.number().nonnegative(),
      })
      .strict()
      .nullable(),
    latestWeight: weightLogResponseSchema.nullable(),
    insights: z.array(insightSchema),
    weeklyRetention: weeklyRetentionResponseSchema.nullable(),
    sectionErrors: z.record(z.string()).default({}),
  })
  // Response schema: tolerate unknown/extra server fields (strip, not strict) so
  // adding a field on the backend doesn't hard-crash an older client.
  .strip();

export const trackResponseSchema = z
  .object({
    doseLogs: z.array(doseLogResponseSchema),
    mealLogs: z.array(mealLogResponseSchema),
    waterLogs: z.array(waterLogResponseSchema),
    proteinLogs: z.array(proteinLogResponseSchema),
    activityLogs: z.array(activityLogResponseSchema),
    sideEffectLogs: z.array(sideEffectLogResponseSchema),
    measurements: z.array(measurementResponseSchema),
    sectionErrors: z.record(z.string()).default({}),
  })
  // Response schema: tolerate unknown/extra server fields (strip, not strict) so
  // adding a field on the backend doesn't hard-crash an older client.
  .strip();

export const progressResponseSchema = z
  .object({
    weights: z.array(weightLogResponseSchema),
    measurements: z.array(measurementResponseSchema),
    progressPhotos: z.array(progressPhotoSchema),
    weeklyRetention: z.array(weeklyRetentionResponseSchema),
    sectionErrors: z.record(z.string()).default({}),
  })
  // Response schema: tolerate unknown/extra server fields (strip, not strict) so
  // adding a field on the backend doesn't hard-crash an older client.
  .strip();

export const revenueCatWebhookSchema = z
  .object({
    event: z
      .object({
        // RevenueCat sends `null` (not omission) for fields that don't apply to
        // a given event — e.g. `entitlement_id: null`, `expiration_at_ms: null`.
        // `.optional()` accepts `undefined` but REJECTS `null`, so every declared
        // field except `type` must be `.nullish()` (null | undefined). The handler
        // is already null-tolerant (uniqueNonEmptyStrings takes null, `?? []`, the
        // `typeof === 'number'` guard). Same null-vs-undefined trap as the stored
        // Mongoose snapshot fields.
        id: z.string().min(1).nullish(),
        type: z.string().min(1),
        app_user_id: z.string().min(1).nullish(),
        original_app_user_id: z.string().min(1).nullish(),
        aliases: z.array(z.string().min(1)).nullish(),
        transferred_from: z.array(z.string().min(1)).nullish(),
        transferred_to: z.array(z.string().min(1)).nullish(),
        transaction_id: z.string().min(1).nullish(),
        product_id: z.string().min(1).nullish(),
        entitlement_id: z.string().min(1).nullish(),
        period_type: z.string().min(1).nullish(),
        expiration_at_ms: z.number().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export const logListQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export const errorCodeSchema = z.enum([
  ERROR_CODES.authInvalidToken,
  ERROR_CODES.authMissingToken,
  ERROR_CODES.badRequest,
  ERROR_CODES.conflict,
  ERROR_CODES.forbidden,
  ERROR_CODES.internal,
  ERROR_CODES.notFound,
  ERROR_CODES.rateLimited,
  ERROR_CODES.serviceUnavailable,
  ERROR_CODES.validation,
]);

// --- Pep chat (POST /coach/chat) ---------------------------------------------
// The mascot's back-and-forth chat. Grounded server-side in the user's own
// tracking data; clinical questions are refused and redirected to the
// prescriber (mirrors Leanient's constrained coach-chat guardrails).
export const pepChatRoleSchema = z.enum(["user", "pep"]);
export const pepChatMessageSchema = z
  .object({
    role: pepChatRoleSchema,
    text: z.string().trim().min(1).max(600),
  })
  .strict();
export const pepChatRequestSchema = z
  .object({
    messages: z.array(pepChatMessageSchema).min(1).max(16),
  })
  .strict();
export const pepChatResponseSchema = z
  .object({
    reply: z.string().min(1),
    refused: z.boolean(),
  })
  .strict();
