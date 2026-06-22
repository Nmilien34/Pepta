import type { z } from "zod";
import type {
  activityLevelSchema,
  activityLogInputSchema,
  activityLogResponseSchema,
  appleAuthSchema,
  authProviderSchema,
  authResponseSchema,
  biggestWorrySchema,
  compoundInputSchema,
  compoundPatchSchema,
  compoundResponseSchema,
  cycleInputSchema,
  cycleResponseSchema,
  doseLogInputSchema,
  doseLogResponseSchema,
  doseUnitSchema,
  drugClassSchema,
  entitlementSchema,
  genderIdentitySchema,
  googleAuthSchema,
  goalTypeSchema,
  goalPaceSchema,
  heightUnitSchema,
  homeResponseSchema,
  insightSchema,
  legalAcceptanceSchema,
  logListQuerySchema,
  lifestyleTargetsSchema,
  mealLogInputSchema,
  mealLogResponseSchema,
  mealScanInputSchema,
  mealScanResponseSchema,
  mealVoiceInputSchema,
  medicationCatalogItemSchema,
  medicationFrequencySchema,
  medicationLevelResponseSchema,
  medicationRouteSchema,
  medicationStatusSchema,
  measurementInputSchema,
  measurementResponseSchema,
  onboardingCompleteInputSchema,
  onboardingResultResponseSchema,
  progressPhotoConfirmInputSchema,
  progressPhotoInputSchema,
  progressPhotoSchema,
  progressPhotoUploadIntentResponseSchema,
  progressResponseSchema,
  proteinLogInputSchema,
  proteinLogResponseSchema,
  researchArticleSchema,
  revenueCatWebhookSchema,
  scheduleInputSchema,
  schedulePatchSchema,
  scheduleResponseSchema,
  sexSchema,
  sideEffectTypeSchema,
  sideEffectLogInputSchema,
  sideEffectLogResponseSchema,
  stallDiagnosticInputSchema,
  stallDiagnosticResponseSchema,
  subscriptionStatusSchema,
  trackResponseSchema,
  trainingStatusSchema,
  userProfileInputSchema,
  userProfileSettingsPatchSchema,
  userProfileResponseSchema,
  userResponseSchema,
  waterLogInputSchema,
  waterLogResponseSchema,
  weeklyRetentionResponseSchema,
  weightUnitSchema,
  weightLogInputSchema,
  weightLogResponseSchema,
} from "../schemas";

export type ActivityLevel = z.infer<typeof activityLevelSchema>;
export type ActivityLogInput = z.infer<typeof activityLogInputSchema>;
export type ActivityLogResponse = z.infer<typeof activityLogResponseSchema>;
export type AppleAuth = z.infer<typeof appleAuthSchema>;
export type AuthProvider = z.infer<typeof authProviderSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type BiggestWorry = z.infer<typeof biggestWorrySchema>;
export type CompoundInput = z.infer<typeof compoundInputSchema>;
export type CompoundPatch = z.infer<typeof compoundPatchSchema>;
export type CompoundResponse = z.infer<typeof compoundResponseSchema>;
export type CycleInput = z.infer<typeof cycleInputSchema>;
export type CycleResponse = z.infer<typeof cycleResponseSchema>;
export type DoseLogInput = z.infer<typeof doseLogInputSchema>;
export type DoseLogResponse = z.infer<typeof doseLogResponseSchema>;
export type DoseUnit = z.infer<typeof doseUnitSchema>;
export type DrugClass = z.infer<typeof drugClassSchema>;
export type Entitlement = z.infer<typeof entitlementSchema>;
export type GenderIdentity = z.infer<typeof genderIdentitySchema>;
export type GoogleAuth = z.infer<typeof googleAuthSchema>;
export type GoalType = z.infer<typeof goalTypeSchema>;
export type GoalPace = z.infer<typeof goalPaceSchema>;
export type HeightUnit = z.infer<typeof heightUnitSchema>;
export type HomeResponse = z.infer<typeof homeResponseSchema>;
export type Insight = z.infer<typeof insightSchema>;
export type LegalAcceptance = z.infer<typeof legalAcceptanceSchema>;
export type LogListQuery = z.infer<typeof logListQuerySchema>;
export type LifestyleTargets = z.infer<typeof lifestyleTargetsSchema>;
export type MealLogInput = z.infer<typeof mealLogInputSchema>;
export type MealLogResponse = z.infer<typeof mealLogResponseSchema>;
export type MealScanInput = z.infer<typeof mealScanInputSchema>;
export type MealScanResponse = z.infer<typeof mealScanResponseSchema>;
export type MealVoiceInput = z.infer<typeof mealVoiceInputSchema>;
export type MedicationCatalogItem = z.infer<typeof medicationCatalogItemSchema>;
export type MedicationFrequency = z.infer<typeof medicationFrequencySchema>;
export type MedicationLevelResponse = z.infer<
  typeof medicationLevelResponseSchema
>;
export type MedicationRoute = z.infer<typeof medicationRouteSchema>;
export type MedicationStatus = z.infer<typeof medicationStatusSchema>;
export type MeasurementInput = z.infer<typeof measurementInputSchema>;
export type MeasurementResponse = z.infer<typeof measurementResponseSchema>;
export type OnboardingCompleteInput = z.infer<
  typeof onboardingCompleteInputSchema
>;
export type OnboardingResultResponse = z.infer<
  typeof onboardingResultResponseSchema
>;
export type ProgressPhotoConfirmInput = z.infer<
  typeof progressPhotoConfirmInputSchema
>;
export type ProgressPhotoInput = z.infer<typeof progressPhotoInputSchema>;
export type ProgressPhoto = z.infer<typeof progressPhotoSchema>;
export type ProgressPhotoUploadIntentResponse = z.infer<
  typeof progressPhotoUploadIntentResponseSchema
>;
export type ProgressResponse = z.infer<typeof progressResponseSchema>;
export type ProteinLogInput = z.infer<typeof proteinLogInputSchema>;
export type ProteinLogResponse = z.infer<typeof proteinLogResponseSchema>;
export type ResearchArticle = z.infer<typeof researchArticleSchema>;
export type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type SchedulePatch = z.infer<typeof schedulePatchSchema>;
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;
export type Sex = z.infer<typeof sexSchema>;
export type SideEffectType = z.infer<typeof sideEffectTypeSchema>;
export type SideEffectLogInput = z.infer<typeof sideEffectLogInputSchema>;
export type SideEffectLogResponse = z.infer<typeof sideEffectLogResponseSchema>;
export type StallDiagnosticInput = z.infer<typeof stallDiagnosticInputSchema>;
export type StallDiagnosticResponse = z.infer<
  typeof stallDiagnosticResponseSchema
>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type TrackResponse = z.infer<typeof trackResponseSchema>;
export type TrainingStatus = z.infer<typeof trainingStatusSchema>;
export type User = z.infer<typeof userResponseSchema>;
export type UserProfileInput = z.infer<typeof userProfileInputSchema>;
export type UserProfileSettingsPatch = z.infer<
  typeof userProfileSettingsPatchSchema
>;
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
export type WaterLogInput = z.infer<typeof waterLogInputSchema>;
export type WaterLogResponse = z.infer<typeof waterLogResponseSchema>;
export type WeeklyRetentionResponse = z.infer<
  typeof weeklyRetentionResponseSchema
>;
export type WeightUnit = z.infer<typeof weightUnitSchema>;
export type WeightLogInput = z.infer<typeof weightLogInputSchema>;
export type WeightLogResponse = z.infer<typeof weightLogResponseSchema>;
