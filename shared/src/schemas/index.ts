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
  SCHEDULE_TIMINGS,
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
// Self-reported acquisition channel ("Where did you find us?", onboarding
// step 7). Deliberately NOT a profile/user field: those response schemas are
// strict AND bundled into shipped builds, so a new response key would blank
// old clients. It lives in its own collection behind its own endpoint.
export const discoverySourceSchema = z.enum([
  "app_store",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "friends",
  "other",
]);
export const discoverySourceInputSchema = z
  .object({ source: discoverySourceSchema })
  .strict();
// DATA HEALTH — the app noticing the user's own records are incomplete or
// contradictory, and asking them to fix it once.
//
// Rides in its own collection behind its own endpoint rather than on
// HomeResponse, because that schema is strict and bundled into every shipped
// build — a new key there would hard-fail Home on 1.0.4/1.0.5 clients.
//
// KEY SHAPE: "<detector>:<subjectId>:<factHash>". Three segments, and the third
// is what makes "dismissed until the facts change" free: the hash covers the
// facts the card was shown for, so a new duplicate (or a changed schedule)
// produces a DIFFERENT key that no dismissal row matches, and the card returns
// on its own. Nothing has to expire or be invalidated.
export const nudgeKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-z0-9-]+:[A-Za-z0-9]+:[a-f0-9]{12}$/,
    "Expected <detector>:<subjectId>:<factHash>",
  );
export const nudgeDismissInputSchema = z.object({ key: nudgeKeySchema }).strict();
export const dismissedNudgesResponseSchema = z
  .object({ dismissed: z.array(nudgeKeySchema) })
  .strict();

export const dataHealthDetectorSchema = z.enum([
  "duplicate-compounds",
  "missing-dose-time",
  "unidentified-medication",
]);

/**
 * One card's FACTS. Deliberately no title/body/cta: copy lives in the client so
 * a wording change is an OTA, not a deploy, and the server never becomes a
 * templating engine. A new detector adds one variant here and one copy block
 * in the app.
 */
export const dataHealthCardSchema = z.discriminatedUnion("detector", [
  z.object({
    detector: z.literal("duplicate-compounds"),
    key: nudgeKeySchema,
    // Two or more compounds that normalize to the same name + route. The
    // chooser renders these side by side; the differences ARE the decision.
    candidates: z.array(
      z.object({
        compoundId: z.string(),
        name: z.string(),
        route: z.string().nullable(),
        plannedDose: z.number().nullable(),
        doseUnit: z.string(),
        doseCount: z.number().int(),
        scheduleSummary: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  }),
  z.object({
    detector: z.literal("missing-dose-time"),
    key: nudgeKeySchema,
    scheduleId: z.string(),
    compoundId: z.string(),
    compoundName: z.string(),
    frequency: z.string(),
  }),
  z.object({
    detector: z.literal("unidentified-medication"),
    key: nudgeKeySchema,
    compoundId: z.string(),
    doseCount: z.number().int(),
  }),
]);

export const dataHealthResponseSchema = z
  .object({ card: dataHealthCardSchema.nullable() })
  .strict();

/** Merge losers INTO keeper. Explicit ids on both sides — never inferred. */
export const mergeCompoundsInputSchema = z
  .object({
    keepCompoundId: z.string().min(1),
    mergeCompoundIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

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
    // The user's chosen name for the Pep companion. Lives on the profile, not
    // on the device: it replaces "Pep" in push-notification titles, which are
    // composed server-side. Defaults to "Pep" when unset.
    companionName: z.string().trim().min(1).max(16).optional(),
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
    // The user's goal in their own words, when they pick "Other" on the goal
    // turn. Purely descriptive: nutrition targets never read it, because a
    // sentence cannot yield a protein multiplier or a calorie deficit. The
    // computable goalType is derived from their start and goal weights
    // instead (see goalIntent.ts).
    goalNote: z.string().trim().min(1).max(80).optional(),
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
    // The user's chosen name for the Pep companion. Lives on the profile, not
    // on the device: it replaces "Pep" in push-notification titles, which are
    // composed server-side. Defaults to "Pep" when unset.
    companionName: z.string().trim().min(1).max(16).optional(),
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
    /** Their goal in their own words; never feeds the nutrition maths. */
    goalNote: z.string().trim().min(1).max(80).optional(),
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
    // null = deliberately not modelled. "Research peptide" is a catch-all
    // covering molecules whose half-lives span minutes to days, so any single
    // number there is a fabrication — clients suppress the curve instead
    // (2026-08-11). Safe to widen: nothing shipped calls this endpoint.
    halfLifeDays: z.number().positive().nullish(),
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
    // null/absent = "not modelled" (custom meds where the user skipped it):
    // the level curve is SUPPRESSED for such compounds — never fabricated
    // from a default. COMPAT (2026-08-07): old shipped clients bundle a
    // schema where this is required, so /home omits unmodelled compounds
    // for callers that don't send the capability param (tz-param precedent).
    halfLifeDays: z.number().positive().nullish(),
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
    // Side effects felt around THIS shot (competitor-review ask). Contextual
    // metadata on the dose record — the standalone side-effect log (with
    // severity) remains the tracking source for insights.
    sideEffects: z.array(sideEffectTypeSchema).max(12).optional(),
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
    photoMediaId: idSchema.optional(),
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
    // On/off pattern (design-lab schedule frames): rest windows are DERIVED
    // from these, so the calendar band and paused reminders can never
    // disagree. Optional — legacy cycles without a pattern stay valid.
    weeksOn: z.number().int().min(1).max(52).optional(),
    weeksOff: z.number().int().min(1).max(52).optional(),
    repeats: z.boolean().optional(),
  })
  .strict();

export const cycleResponseSchema = cycleInputSchema.extend({
  id: idSchema,
  userId: idSchema,
  active: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// User-local wall-clock time, 24h "HH:MM". Stored as local time (not UTC) so
// "10:00 PM before bed" survives timezone moves and DST; the backend converts
// via the profile timezone when projecting nextDoseAt.
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24h)");

export const scheduleTimingSchema = z.enum(SCHEDULE_TIMINGS);

export const scheduleInputSchema = z
  .object({
    compoundId: idSchema,
    frequency: scheduleFrequencySchema,
    intervalDays: z.number().int().positive().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
    nextDoseAt: isoDateTimeSchema.optional(),
    active: z.boolean().default(true),
    // Protocol timing (competitor-review ask): explicit dose times — up to 3
    // for split dosing (e.g. BPC-157 AM/PM) — plus the user's own context.
    timesOfDay: z.array(timeOfDaySchema).max(3).optional(),
    timing: scheduleTimingSchema.optional(),
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

/**
 * Windows for the medication-level chart.
 *
 * Shared rather than duplicated because the label and the span have to agree:
 * a control that says "90d" over a 7-day curve is the bug this replaces — the
 * old segmented control was decoration, hardcoded to its first option, above a
 * chart the backend only ever drew +/-7 days.
 *
 * "all" has no fixed span: it runs from the user's first logged dose, so the
 * server resolves it against their data.
 */
export const levelRangeKeySchema = z.enum(["week", "month", "quarter", "all"]);

export const LEVEL_RANGE_DAYS: Record<
  Exclude<z.infer<typeof levelRangeKeySchema>, "all">,
  number
> = { week: 7, month: 30, quarter: 90 };

/**
 * How far past `now` each window projects. It does not scale with the window:
 * the projection is decay plus the schedule, and a year of it would be a year
 * of guesswork drawn at the same weight as the fortnight anyone can act on.
 */
export const LEVEL_RANGE_DAYS_AFTER = 14;

/**
 * Optional, NOT defaulted. Its absence is the signal that the caller is a
 * build shipped before ranges existed, which must keep receiving the bare
 * array it parses — the same gating the timezone param uses.
 */
export const levelRangeQuerySchema = z
  .object({ range: levelRangeKeySchema.optional() })
  .strict();

export const medicationLevelsResponseSchema = z
  .object({
    range: levelRangeKeySchema,
    /** What the server actually drew — "all" resolves to a real span. */
    daysBefore: z.number().positive(),
    daysAfter: z.number().positive(),
    levels: z.array(medicationLevelResponseSchema),
    /**
     * Every dose inside the window, so each rise on the curve can be marked.
     *
     * Carried here rather than read from /track, which looks back 30 days: on
     * a 90-day or all-time chart the curve would run three months while the
     * markers explaining it stopped a third of the way in.
     */
    doses: z
      .array(z.object({ compoundId: idSchema, datetime: isoDateTimeSchema }).strict())
      .default([]),
  })
  .strict();

/**
 * Display preferences — what the app SHOWS, never what it stores.
 *
 * ITS OWN ENDPOINT, NOT A FIELD ON THE PROFILE. userProfileResponseSchema is
 * .strict(), so a new key there is rejected outright by every shipped build.
 * A new route is the same escape this codebase already uses for favourite
 * photo intents and level ranges.
 *
 * Keys are open: a client that hides a card the server has never heard of
 * still round-trips its choice, and a client that has never heard of a stored
 * key ignores it. Nothing here is health data, so nothing here needs a
 * migration when a card is added or renamed.
 */
export const uiPreferencesSchema = z
  .object({
    /** Progress "What to show": section key → visible. */
    progressSections: z.record(z.string(), z.boolean()).default({}),
  })
  .strict();

export const uiPreferencesResponseSchema = z
  .object({
    preferences: uiPreferencesSchema,
    updatedAt: isoDateTimeSchema.nullable(),
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
    // Activity totals, server-computed over the full range so they are never
    // capped by the /track payload window. Present only for clients that sent
    // a `tz` with GET /home — the schema is strict, so shipped builds without
    // these keys must never receive them.
    steps: z.number().nonnegative().optional(),
    workoutMinutes: z.number().nonnegative().optional(),
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
    photoMediaId: idSchema.optional(),
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
    // Added 2026-08-13 for Track's activity feed. Weight is one of the most
    // logged things a GLP-1 user has and was the only kind missing here —
    // Home only ever carried latestWeight, a single value, not a history.
    // SAFE TO ADD: this schema is .strip(), so a client that predates the
    // field drops it rather than failing. Optional with a default so a NEW
    // client still parses an OLD backend's response during the deploy gap.
    weightLogs: z.array(weightLogResponseSchema).default([]),
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

// ── Referral attribution ─────────────────────────────────────────────────────
// Creator/campaign attribution only — claiming NEVER touches subscription
// state, paywall eligibility, or premium access. The backend is the authority:
// unregistered codes 404, normalization happens server-side (trim, uppercase,
// strip spaces/dashes/underscores), and an account can claim exactly one code
// (a different second code = 409; re-claiming the same code is idempotent).
export const referralClaimRequestSchema = z
  .object({
    code: z.string().trim().min(2).max(64),
  })
  .strict();
export const referralClaimResponseSchema = z
  .object({
    // The normalized code that was recorded (e.g. "PEP20").
    code: z.string().min(1),
    // True when this user had already claimed this exact code before.
    alreadyClaimed: z.boolean(),
  })
  .strict();

// ── Access decision (complimentary + subscription gate) ──────────────────────
// The single authenticated contract behind POST /me/access/resolve. RevenueCat
// stays the source of truth; this is the reconciled decision. Invariants the
// refinements enforce: active/cached access carries ≥1 source, "mixed" means
// both kinds are present, and single-source labels match their sources.
export const accessSourceKindSchema = z.enum(["promotional", "app_store"]);
export const accessSourceSchema = z
  .object({
    kind: accessSourceKindSchema,
    expiresAt: z.string().datetime().nullable(),
    willRenew: z.boolean(),
    productId: z.string().min(1).optional(),
    environment: z.enum(["sandbox", "production"]).optional(),
  })
  .strict();

const accessSourceLabelSchema = z.enum(["promotional", "app_store", "mixed"]);

function sourceLabelMatches(
  label: z.infer<typeof accessSourceLabelSchema>,
  sources: Array<z.infer<typeof accessSourceSchema>>,
): boolean {
  const kinds = new Set(sources.map((s) => s.kind));
  if (label === "mixed") return kinds.has("promotional") && kinds.has("app_store");
  return kinds.size === 1 && kinds.has(label);
}

export const accessDecisionSchema = z
  .discriminatedUnion("state", [
    z
      .object({
        state: z.literal("active"),
        source: accessSourceLabelSchema,
        sources: z.array(accessSourceSchema).min(1),
        expiresAt: z.string().datetime().nullable(),
        willRenew: z.boolean(),
        lastVerifiedAt: z.string().datetime(),
      })
      .strict(),
    z
      .object({
        state: z.literal("inactive"),
        reason: z.enum(["never_entitled", "expired", "revoked"]),
        lastVerifiedAt: z.string().datetime(),
      })
      .strict(),
    z
      .object({
        state: z.literal("provisioning"),
        retryAfterMs: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        state: z.literal("identity_verification_required"),
        provider: z.literal("google"),
        reason: z.literal("invited_email_requires_verified_google"),
      })
      .strict(),
    z
      .object({
        state: z.literal("temporarily_unavailable"),
        retryAfterMs: z.number().int().positive(),
        cachedAccess: z
          .object({
            source: accessSourceLabelSchema,
            sources: z.array(accessSourceSchema).min(1),
            validUntil: z.string().datetime(),
            willRenew: z.boolean(),
            lastVerifiedAt: z.string().datetime(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  ])
  // discriminatedUnion members must stay plain objects, so the cross-field
  // invariants live here: labels must match their source lists.
  .superRefine((value, ctx) => {
    if (value.state === "active" && !sourceLabelMatches(value.source, value.sources)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source"],
        message: "source label must match the source list",
      });
    }
    if (
      value.state === "temporarily_unavailable" &&
      value.cachedAccess &&
      !sourceLabelMatches(value.cachedAccess.source, value.cachedAccess.sources)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cachedAccess", "source"],
        message: "cached source label must match the source list",
      });
    }
  });

// ---------------------------------------------------------------------------
// User media — opaque ownership records, never caller-selected S3 keys.
//
// The app uploads through a short-lived policy, then confirms only the media
// id. Product inputs can carry that id, but storage keys stay backend-only.
// ---------------------------------------------------------------------------

export const mediaIntentSchema = z.enum([
  "avatar",
  "progress_photo",
  "favourite_photo",
  "meal_photo",
]);

export const mediaContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

export const mediaUploadIntentInputSchema = z
  .object({
    intent: mediaIntentSchema,
    contentType: mediaContentTypeSchema,
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const mediaUploadIntentResponseSchema = z
  .object({
    mediaId: idSchema,
    uploadUrl: z.string().url(),
    fields: z.record(z.string()),
    expiresAt: isoDateTimeSchema,
  })
  .strict();

export const mediaConfirmInputSchema = z
  .object({ mediaId: idSchema })
  .strict();

export const mediaReadyResponseSchema = z
  .object({
    mediaId: idSchema,
    status: z.literal("ready"),
  })
  .strict();

export const mediaDiscardInputSchema = mediaConfirmInputSchema;

// ---------------------------------------------------------------------------
// Favourites — the foods and drinks the user saved, with the portion.
//
// SERVER-BACKED so they follow the account rather than the handset: a
// favourite is the user's own data, not presentation state, and losing it to a
// reinstall would be losing something they curated.
//
// THE PORTION IS PART OF THE IDENTITY. `key` is kind + name + portion, built
// on the client and sent up, which makes create idempotent under retry and
// keeps two sizes of one food as two favourites. Logging one replays the exact
// numbers that were saved, so a favourite whose portion could drift would be a
// favourite that logs the wrong thing.
// ---------------------------------------------------------------------------

export const favouriteKindSchema = z.enum(["food", "drink"]);

export const favouriteInputSchema = z
  .object({
    /** kind:name-slug:portion-slug — stable, and the idempotency key. */
    key: z.string().trim().min(1).max(200),
    kind: favouriteKindSchema,
    name: z.string().trim().min(1).max(120),
    /** May be empty: some drinks carry no portion wording. */
    portion: z.string().trim().max(120).default(""),
    protein: z.number().nonnegative().optional(),
    calories: z.number().nonnegative().optional(),
    fiber: z.number().nonnegative().optional(),
    /** Drinks only — what tapping Log adds. */
    ounces: z.number().positive().optional(),
    /**
     * Where it came from. Only "recipe" is shown (as a badge) — a favourite
     * saved from a recipe logs several foods at once, which is worth knowing
     * before you tap Log.
     */
    source: z.enum(["item", "recipe"]).default("item"),
    /** An owned, verified media record. Raw storage keys never cross here. */
    photoMediaId: idSchema.optional(),
  })
  .strict();

export const favouriteResponseSchema = favouriteInputSchema.extend({
  id: idSchema,
  /** Signed, short-lived. Absent when the item has no photo. */
  photoUrl: z.string().nullable().default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const favouritesResponseSchema = z
  .object({
    favourites: z.array(favouriteResponseSchema),
    /**
     * The first-run offers, seeded server-side and owned by nobody — the same
     * shape as a favourite so saving one is a copy rather than a translation.
     * Rows rather than a constant in the bundle, so they can be corrected or
     * extended without an app release.
     */
    suggestions: z.array(favouriteResponseSchema).default([]),
  })
  .strict();

export type FavouriteKind = z.infer<typeof favouriteKindSchema>;
// z.input, not z.infer: the schema defaults `portion` and `source`, and
// callers should be free to omit what they do not know. The service reads the
// PARSED body, where the defaults have already been applied.
export type FavouriteInput = z.input<typeof favouriteInputSchema>;
export type FavouriteResponse = z.infer<typeof favouriteResponseSchema>;
export type FavouritesResponse = z.infer<typeof favouritesResponseSchema>;

// ---------------------------------------------------------------------------
// Recipes — a combination you eat often, logged in one tap.
//
// No method and no steps: this is not a cookbook. It is a saved list of foods
// whose totals are DERIVED from its ingredients rather than stored beside
// them. Storing a total invites the two to disagree the moment someone edits a
// portion, and the number people act on would be the stale one.
//
// STARTERS live in the same collection with no owner. They ship seeded so the
// screen is useful before anyone has saved anything, and being rows rather
// than a constant in the bundle means they can be corrected or extended
// without an app release.
//
// Logging a recipe writes the same entry a fresh meal log would — a shortcut,
// not a different kind of record.
// ---------------------------------------------------------------------------

export const recipeIngredientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    /** "1 scoop", "3 large" — free text, shown as written. */
    amount: z.string().trim().max(60).default(""),
    protein: z.number().nonnegative(),
    calories: z.number().nonnegative(),
    fiber: z.number().nonnegative().optional(),
  })
  .strict();

export const recipeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    ingredients: z.array(recipeIngredientSchema).min(1).max(40),
    photoMediaId: idSchema.optional(),
  })
  .strict();

export const recipeResponseSchema = recipeInputSchema.extend({
  id: idSchema,
  /** True for the seeded ones, which belong to nobody and cannot be edited. */
  isStarter: z.boolean(),
  photoUrl: z.string().url().nullable().default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const recipesResponseSchema = z
  .object({
    recipes: z.array(recipeResponseSchema),
    starters: z.array(recipeResponseSchema),
  })
  .strict();

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeResponse = z.infer<typeof recipeResponseSchema>;
export type RecipesResponse = z.infer<typeof recipesResponseSchema>;

// ---------------------------------------------------------------------------
// Recipe composition — the intelligence layer on New recipe.
//
// A NEW ENDPOINT rather than a key on mealScanAnalysisSchema. Those response
// schemas are strict and bundled into shipped builds, so adding a field would
// make every app already on a phone reject the whole payload. Recipes ask a
// different question anyway: a meal log wants one set of totals, a recipe
// wants the PARTS, because its totals are summed from them and the user is
// invited to adjust the portions.
// ---------------------------------------------------------------------------

export const recipeComposeInputSchema = z
  .object({
    /** What the user said or typed: "two eggs, oats and a scoop of whey". */
    text: z.string().trim().min(1).max(600),
    /** A name the user already has in mind; the model may improve on it. */
    name: z.string().trim().max(120).optional(),
  })
  .strict();

/** The proposal. Nothing is saved until the user accepts it. */
export const recipeComposeResponseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    ingredients: z.array(recipeIngredientSchema).min(1).max(40),
    /** 0..1. Low means the screen should say so rather than imply precision. */
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type RecipeComposeInput = z.infer<typeof recipeComposeInputSchema>;
export type RecipeComposeResponse = z.infer<typeof recipeComposeResponseSchema>;

export type UiPreferences = z.infer<typeof uiPreferencesSchema>;
export type UiPreferencesInput = z.input<typeof uiPreferencesSchema>;
export type UiPreferencesResponse = z.infer<typeof uiPreferencesResponseSchema>;
export type LevelRangeKey = z.infer<typeof levelRangeKeySchema>;
export type LevelRangeQuery = z.input<typeof levelRangeQuerySchema>;
export type MedicationLevelsResponse = z.infer<typeof medicationLevelsResponseSchema>;
