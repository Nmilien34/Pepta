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
  mediaId: Types.ObjectId;
  captureDate: string;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "image/webp";
  sizeBytes?: number;
  kind: "body" | "face";
  faceFullness?: number;
  status: "pending_upload" | "uploaded" | "deleted";
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MealScanDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  photoMediaId: Types.ObjectId;
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
  /** True when headline/body came from the model rather than the fallback. */
  aiCopy: boolean;
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

/**
 * A RECEIPT for a payment-provider event we have finished processing.
 *
 * Two jobs. It is the idempotency key that stops a redelivered event being
 * applied twice — and it is the only record on our side that a charge ever
 * reached us. It used to carry neither the money nor the person: no event
 * type, product, transaction or price, and not the resolved Mongo user, only
 * whatever app_user_id the event happened to use. That made a missing purchase
 * uninvestigable.
 *
 * Retention: kept after the account is deleted, stripped to the financial-record
 * core (see stripProcessedWebhookEventsForDeletedUser). Apple disputes and
 * chargebacks arrive after deletion, and defending one needs the transaction,
 * not the person.
 */
export interface ProcessedWebhookEventDocument extends Document<Types.ObjectId> {
  provider: "revenuecat";
  eventId: string;
  /** The provider's own customer id — survives account deletion. */
  appUserId?: string;
  /** Resolved Pepta user. Cleared when the account is deleted. */
  userId?: Types.ObjectId | null;
  eventType?: string;
  productId?: string;
  transactionId?: string;
  /** As charged, in the purchase currency. */
  price?: number | null;
  currency?: string;
  environment?: string;
  store?: string;
  periodType?: string;
  /** True once the account this belonged to was deleted and PII stripped. */
  detached?: boolean;
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
    mediaId: {
      type: Schema.Types.ObjectId,
      ref: "MediaAsset",
      required: true,
      unique: true,
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
    status: {
      type: String,
      enum: ["pending_upload", "uploaded", "deleted"],
      required: true,
      default: "pending_upload",
      index: true,
    },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

progressPhotoSchema.index({ userId: 1, captureDate: -1, status: 1 });
progressPhotoSchema.index({ status: 1, expiresAt: 1 });

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
    photoMediaId: {
      type: Schema.Types.ObjectId,
      ref: "MediaAsset",
      required: true,
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
    // Whether headline/body were WRITTEN BY THE MODEL or are the deterministic
    // fallback. Internal only — it never reaches the API response.
    //
    // Without it a cached row cannot say where its copy came from, and the
    // background sweeps (which deliberately run with AI prose off) would fill
    // the cache with fallback text that then satisfied the freshness check for
    // a consented reader — so consented users saw boilerplate for the whole
    // TTL and effectively never got the AI copy they opted into.
    aiCopy: {
      type: Boolean,
      required: true,
      default: false,
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
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    eventType: { type: String, trim: true, index: true },
    productId: { type: String, trim: true },
    transactionId: { type: String, trim: true, index: true },
    price: { type: Number, default: null },
    currency: { type: String, trim: true },
    environment: { type: String, trim: true },
    store: { type: String, trim: true },
    periodType: { type: String, trim: true },
    detached: { type: Boolean, default: false },
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

// NO TTL. This was expiring after 90 days, which is inside the window where an
// Apple dispute or a "I paid and have no access" support request still
// arrives — and it is the only local record of the charge.

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
