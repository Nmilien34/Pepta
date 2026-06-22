export const ERROR_CODES = {
  authInvalidToken: "AUTH_INVALID_TOKEN",
  authMissingToken: "AUTH_MISSING_TOKEN",
  badRequest: "BAD_REQUEST",
  conflict: "CONFLICT",
  forbidden: "FORBIDDEN",
  internal: "INTERNAL",
  notFound: "NOT_FOUND",
  rateLimited: "RATE_LIMITED",
  serviceUnavailable: "SERVICE_UNAVAILABLE",
  validation: "VALIDATION",
} as const;

export const AUTH_PROVIDERS = ["google", "apple"] as const;
export const SEX_VALUES = ["male", "female"] as const;
export const HEIGHT_UNITS = ["in", "cm"] as const;
export const WEIGHT_UNITS = ["lb", "kg"] as const;
export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
] as const;
export const TRAINING_STATUSES = [
  "not_training",
  "beginner",
  "returning",
  "consistent",
] as const;
export const GOAL_TYPES = ["lose_fat", "maintain", "recomp"] as const;
export const GOAL_PACES = ["gentle", "steady", "ambitious"] as const;
export const BIGGEST_WORRIES = [
  "losing_muscle",
  "ozempic_face",
  "side_effects",
  "stalling",
  "rebound",
  "energy",
] as const;
export const DOSE_UNITS = ["mg", "mcg", "ml", "units"] as const;
export const DRUG_CLASSES = [
  "glp_1",
  "dual_glp_1_gip",
  "peptide",
  "other",
] as const;
export const MEDICATION_ROUTES = ["injection", "oral"] as const;
export const MEDICATION_FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "custom",
] as const;
export const MEDICATION_STATUSES = ["active", "starting_soon", "none"] as const;
export const GENDER_IDENTITIES = [
  "woman",
  "man",
  "nonbinary",
  "other",
  "prefer_not_to_say",
] as const;
export const COMPOUND_STATUSES = ["active", "paused", "completed"] as const;
export const INJECTION_SITES = [
  "abdomen_left",
  "abdomen_right",
  "thigh_left",
  "thigh_right",
  "arm_left",
  "arm_right",
  "buttock_left",
  "buttock_right",
] as const;
export const MEAL_LOG_SOURCES = ["scan", "voice", "search", "manual"] as const;
export const SIDE_EFFECT_TYPES = [
  "nausea",
  "constipation",
  "diarrhea",
  "fatigue",
  "headache",
  "reflux",
  "hair_loss",
  "bloating",
  "sulfur_burps",
  "appetite_suppression",
  "injection_site_reaction",
  "other",
] as const;
export const MEASUREMENT_TYPES = [
  "waist",
  "hips",
  "chest",
  "arm",
  "thigh",
  "neck",
  "body_fat",
  "face_fullness",
] as const;
export const SCHEDULE_FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "custom",
] as const;
export const INSIGHT_TYPES = [
  "medication_level",
  "dose_cycle",
  "side_effect_pattern",
  "protein_retention",
  "stall",
  "hydration",
] as const;
export const INSIGHT_SEVERITIES = [
  "info",
  "positive",
  "warning",
  "critical",
] as const;
export const RETENTION_DRIVERS = ["protein", "training", "pace"] as const;
export const RETENTION_VERDICTS = [
  "protected",
  "steady",
  "watch",
  "at_risk",
] as const;
export const PROGRESS_PHOTO_STATUSES = [
  "pending_upload",
  "uploaded",
  "deleted",
] as const;
export const PROGRESS_PHOTO_KINDS = ["body", "face"] as const;
export const RESEARCH_ARTICLE_CATEGORIES = [
  "glp_1",
  "muscle_retention",
  "nutrition",
  "side_effects",
  "peptides",
] as const;
export const SUBSCRIPTION_STATUSES = [
  "free",
  "trialing",
  "active",
  "active_canceled",
  "past_due",
  "canceled",
  "refunded",
] as const;
