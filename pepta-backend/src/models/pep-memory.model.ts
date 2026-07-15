import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";
import type { PepPushCopySource } from "./pep-push-delivery.model";

export interface PepMemoryDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  contextVersion: string;
  sourceUpdatedAt: Date;
  refreshedAt: Date;
  nextDoseWindow: {
    compoundName: string;
    nextDoseAt: Date;
    hoursUntilNextDose: number;
  } | null;
  nutritionGaps: {
    proteinGramsRemaining: number | null;
    waterOzRemaining: number | null;
    fiberGramsRemaining: number | null;
  };
  recentSideEffects: Array<{
    types: string[];
    severity: number;
    when: Date;
    label: string;
    supportTip: string;
    clinicianPrompt: boolean;
  }>;
  lastMealPattern: {
    foodName: string;
    protein: number;
    calories: number;
    when: Date;
  } | null;
  latestWeightTrend: {
    latestValue: number;
    unit: string;
    when: Date;
  } | null;
  currentPriority: {
    priorityId: string;
    importance: "high" | "normal";
    pushEligible: boolean;
    windowKey: string;
    reason: string;
    title: string;
    body: string;
  } | null;
  lastNotification: {
    priorityId: string;
    windowKey: string;
    sentAt: Date;
    source: PepPushCopySource;
  } | null;
  aiSummary: {
    text: string;
    generatedAt: Date;
    copyVersion: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const nextDoseWindowSchema = new Schema(
  {
    compoundName: { type: String, required: true, trim: true },
    nextDoseAt: { type: Date, required: true },
    hoursUntilNextDose: { type: Number, required: true },
  },
  { _id: false },
);

const nutritionGapsSchema = new Schema(
  {
    proteinGramsRemaining: { type: Number, default: null },
    waterOzRemaining: { type: Number, default: null },
    fiberGramsRemaining: { type: Number, default: null },
  },
  { _id: false },
);

const sideEffectMemorySchema = new Schema(
  {
    types: { type: [String], required: true, default: [] },
    severity: { type: Number, required: true, min: 1, max: 5 },
    when: { type: Date, required: true },
    label: { type: String, required: true, trim: true },
    supportTip: { type: String, required: true, trim: true, maxlength: 240 },
    clinicianPrompt: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const mealPatternSchema = new Schema(
  {
    foodName: { type: String, required: true, trim: true },
    protein: { type: Number, required: true, min: 0 },
    calories: { type: Number, required: true, min: 0 },
    when: { type: Date, required: true },
  },
  { _id: false },
);

const weightTrendSchema = new Schema(
  {
    latestValue: { type: Number, required: true },
    unit: { type: String, required: true, trim: true },
    when: { type: Date, required: true },
  },
  { _id: false },
);

const prioritySchema = new Schema(
  {
    priorityId: { type: String, required: true, trim: true },
    importance: { type: String, enum: ["high", "normal"], required: true },
    pushEligible: { type: Boolean, required: true },
    windowKey: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    body: { type: String, required: true, trim: true, maxlength: 240 },
  },
  { _id: false },
);

const lastNotificationSchema = new Schema(
  {
    priorityId: { type: String, required: true, trim: true },
    windowKey: { type: String, required: true, trim: true },
    sentAt: { type: Date, required: true },
    source: {
      type: String,
      enum: ["ai", "deterministic"],
      required: true,
    },
  },
  { _id: false },
);

const aiSummarySchema = new Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 1200 },
    generatedAt: { type: Date, required: true },
    copyVersion: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const pepMemorySchema = new Schema<PepMemoryDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    contextVersion: {
      type: String,
      required: true,
      default: "pep-memory-v1",
      trim: true,
    },
    sourceUpdatedAt: { type: Date, required: true, index: true },
    refreshedAt: { type: Date, required: true, index: true },
    nextDoseWindow: { type: nextDoseWindowSchema, default: null },
    nutritionGaps: {
      type: nutritionGapsSchema,
      required: true,
      default: () => ({}),
    },
    recentSideEffects: {
      type: [sideEffectMemorySchema],
      required: true,
      default: [],
    },
    lastMealPattern: { type: mealPatternSchema, default: null },
    latestWeightTrend: { type: weightTrendSchema, default: null },
    currentPriority: { type: prioritySchema, default: null },
    lastNotification: { type: lastNotificationSchema, default: null },
    aiSummary: { type: aiSummarySchema, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

applyApiTransforms(pepMemorySchema);

export const PepMemoryModel = mongoose.model<PepMemoryDocument>(
  "PepMemory",
  pepMemorySchema,
);
