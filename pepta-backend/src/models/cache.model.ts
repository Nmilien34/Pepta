import type {
  MealProductScanMetadata,
  MealScanAnalysis,
  MealScanCoachContent,
} from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface ProgressPhotoDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  captureDate: string;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "image/webp";
  sizeBytes?: number;
  kind: "body" | "face";
  faceFullness?: number;
  s3Key: string;
  status: "pending_upload" | "uploaded" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

export interface MealScanDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  photoS3Key: string;
  imageMimeType: "image/jpeg" | "image/png" | "image/webp";
  analysis: MealScanAnalysis | null;
  coachContent: MealScanCoachContent | null;
  product?: MealProductScanMetadata | null;
  note?: string | null;
  idempotencyKey?: string;
  visionEngineVersion: string;
  coachContentVersion?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsightDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  type:
    | "medication_level"
    | "dose_cycle"
    | "side_effect_pattern"
    | "protein_retention"
    | "stall"
    | "hydration";
  headline: string;
  body: string;
  severity: "info" | "positive" | "warning" | "critical";
  cta?: string;
  deterministicSignal: Record<string, unknown>;
  generatedAt: Date;
  copyVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeeklyRetentionDriverDocument {
  type: "protein" | "training" | "pace";
  label: string;
  score: number;
  contribution: number;
}

export interface WeeklyRetentionDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  weekOf: string;
  score: number;
  verdict: "protected" | "steady" | "watch" | "at_risk";
  verdictProse: string;
  drivers: WeeklyRetentionDriverDocument[];
  penaltyApplied?: boolean;
  engineVersion: string;
  copyVersion: string | null;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchArticleDocument extends Document<Types.ObjectId> {
  slug: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category:
    | "glp_1"
    | "muscle_retention"
    | "nutrition"
    | "side_effects"
    | "peptides";
  publishedAt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessedWebhookEventDocument extends Document<Types.ObjectId> {
  provider: "revenuecat";
  eventId: string;
  appUserId?: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const progressPhotoSchema = new Schema<ProgressPhotoDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    captureDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    contentType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/heic", "image/webp"],
      required: true,
    },
    sizeBytes: {
      type: Number,
      min: 1,
    },
    kind: {
      type: String,
      enum: ["body", "face"],
      required: true,
      default: "body",
    },
    faceFullness: {
      type: Number,
      min: 1,
      max: 5,
    },
    s3Key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending_upload", "uploaded", "deleted"],
      required: true,
      default: "pending_upload",
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

progressPhotoSchema.index({ userId: 1, captureDate: -1, status: 1 });

const mealScanAnalysisSchema = new Schema<MealScanAnalysis>(
  {
    foodName: { type: String, required: true, trim: true },
    servingSize: { type: String, required: true, trim: true },
    protein: { type: Number, required: true, min: 0 },
    calories: { type: Number, required: true, min: 0 },
    carbs: { type: Number, required: true, min: 0 },
    fat: { type: Number, required: true, min: 0 },
    fiber: { type: Number, required: true, min: 0 },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false, versionKey: false },
);

const mealScanAdjustedMacrosSchema = new Schema(
  {
    protein: { type: Number, required: true, min: 0 },
    calories: { type: Number, required: true, min: 0 },
    carbs: { type: Number, required: true, min: 0 },
    fat: { type: Number, required: true, min: 0 },
    fiber: { type: Number, required: true, min: 0 },
  },
  { _id: false, versionKey: false },
);

const mealScanSwapSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    additionalProtein: { type: Number, required: true, min: 0 },
    additionalCalories: { type: Number, required: true, min: 0 },
    adjustedMacros: { type: mealScanAdjustedMacrosSchema, required: true },
  },
  { _id: false, versionKey: false },
);

const mealScanCoachContentSchema = new Schema<MealScanCoachContent>(
  {
    mode: { type: String, enum: ["affirmation", "swap"], required: true },
    callout: { type: String, required: true, trim: true },
    swap: { type: mealScanSwapSchema, default: null },
    copyVersion: { type: String, required: true, trim: true },
  },
  { _id: false, versionKey: false },
);

const mealProductCitationSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false, versionKey: false },
);

const mealProductScanMetadataSchema = new Schema<MealProductScanMetadata>(
  {
    mode: { type: String, enum: ["product_scan", "barcode"], required: true },
    barcode: { type: String, trim: true },
    brand: { type: String, trim: true },
    productName: { type: String, trim: true },
    source: {
      type: String,
      enum: [
        "cache",
        "open_food_facts",
        "openai_web_search",
        "together_vision",
        "manual_label",
      ],
      required: true,
    },
    citations: { type: [mealProductCitationSchema], default: [] },
  },
  { _id: false, versionKey: false },
);

const mealScanSchema = new Schema<MealScanDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    photoS3Key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    imageMimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp"],
      required: true,
    },
    analysis: {
      type: mealScanAnalysisSchema,
      default: null,
    },
    coachContent: {
      type: mealScanCoachContentSchema,
      default: null,
    },
    product: {
      type: mealProductScanMetadataSchema,
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: null,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    },
    visionEngineVersion: {
      type: String,
      required: true,
      trim: true,
    },
    coachContentVersion: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

mealScanSchema.index({ userId: 1, createdAt: -1 });
mealScanSchema.index(
  { userId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

const insightSchema = new Schema<InsightDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "medication_level",
        "dose_cycle",
        "side_effect_pattern",
        "protein_retention",
        "stall",
        "hydration",
      ],
      required: true,
      index: true,
    },
    headline: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ["info", "positive", "warning", "critical"],
      required: true,
    },
    cta: {
      type: String,
      trim: true,
    },
    deterministicSignal: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    generatedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    copyVersion: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

insightSchema.index({ userId: 1, type: 1, generatedAt: -1 });

const weeklyRetentionDriverSchema = new Schema<WeeklyRetentionDriverDocument>(
  {
    type: {
      type: String,
      enum: ["protein", "training", "pace"],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    contribution: {
      type: Number,
      required: true,
    },
  },
  { _id: false },
);

const weeklyRetentionSchema = new Schema<WeeklyRetentionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    weekOf: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    verdict: {
      type: String,
      enum: ["protected", "steady", "watch", "at_risk"],
      required: true,
    },
    verdictProse: {
      type: String,
      required: true,
      trim: true,
    },
    drivers: {
      type: [weeklyRetentionDriverSchema],
      required: true,
      default: [],
    },
    penaltyApplied: {
      type: Boolean,
    },
    engineVersion: {
      type: String,
      required: true,
    },
    copyVersion: {
      type: String,
      default: null,
    },
    generatedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

weeklyRetentionSchema.index({ userId: 1, weekOf: 1 }, { unique: true });

const researchArticleSchema = new Schema<ResearchArticleDocument>(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "glp_1",
        "muscle_retention",
        "nutrition",
        "side_effects",
        "peptides",
      ],
      required: true,
      index: true,
    },
    publishedAt: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const processedWebhookEventSchema = new Schema<ProcessedWebhookEventDocument>(
  {
    provider: {
      type: String,
      enum: ["revenuecat"],
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    appUserId: {
      type: String,
      trim: true,
      index: true,
    },
    processedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

processedWebhookEventSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 },
);

applyApiTransforms(progressPhotoSchema);
applyApiTransforms(mealScanSchema);
applyApiTransforms(insightSchema);
applyApiTransforms(weeklyRetentionSchema);
applyApiTransforms(researchArticleSchema);
applyApiTransforms(processedWebhookEventSchema);

export const ProgressPhotoModel = mongoose.model<ProgressPhotoDocument>(
  "ProgressPhoto",
  progressPhotoSchema,
);
export const MealScanModel = mongoose.model<MealScanDocument>(
  "MealScan",
  mealScanSchema,
);
export const InsightModel = mongoose.model<InsightDocument>(
  "Insight",
  insightSchema,
);
export const WeeklyRetentionModel = mongoose.model<WeeklyRetentionDocument>(
  "WeeklyRetention",
  weeklyRetentionSchema,
);
export const ResearchArticleModel = mongoose.model<ResearchArticleDocument>(
  "ResearchArticle",
  researchArticleSchema,
);
export const ProcessedWebhookEventModel =
  mongoose.model<ProcessedWebhookEventDocument>(
    "ProcessedWebhookEvent",
    processedWebhookEventSchema,
  );
