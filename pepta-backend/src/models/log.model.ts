import type {
  ActivityLogInput,
  DoseLogInput,
  MealLogInput,
  MeasurementInput,
  ProteinLogInput,
  SideEffectLogInput,
  WaterLogInput,
  WeightLogInput,
} from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import {
  applyApiTransforms,
  applyLogIndexes,
  applySoftDeleteQueryMiddleware,
} from "./model-utils";

interface LogDocumentBase extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  datetime: Date;
  deletedAt: Date | null;
  idempotencyKey?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WeightLogDocument
  extends
    Omit<WeightLogInput, "datetime">,
    Omit<LogDocumentBase, "idempotencyKey"> {}

export interface DoseLogDocument
  extends Omit<DoseLogInput, "compoundId" | "datetime">, LogDocumentBase {
  compoundId: Types.ObjectId;
}

export interface MealLogDocument
  extends Omit<MealLogInput, "datetime">, LogDocumentBase {}

export interface WaterLogDocument
  extends Omit<WaterLogInput, "datetime">, LogDocumentBase {}

export interface ProteinLogDocument
  extends Omit<ProteinLogInput, "datetime">, LogDocumentBase {}

export interface ActivityLogDocument
  extends Omit<ActivityLogInput, "datetime">, LogDocumentBase {}

export interface SideEffectLogDocument
  extends
    Omit<SideEffectLogInput, "datetime" | "relatedDoseLogId">,
    LogDocumentBase {
  relatedDoseLogId?: Types.ObjectId;
}

export interface MeasurementDocument
  extends Omit<MeasurementInput, "datetime">, LogDocumentBase {}

const logBaseFields = {
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  datetime: {
    type: Date,
    required: true,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true,
  },
  idempotencyKey: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
  },
};

const weightLogSchema = new Schema<WeightLogDocument>(
  {
    userId: logBaseFields.userId,
    datetime: logBaseFields.datetime,
    deletedAt: logBaseFields.deletedAt,
    notes: logBaseFields.notes,
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum: ["lb", "kg"],
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const doseLogSchema = new Schema<DoseLogDocument>(
  {
    ...logBaseFields,
    compoundId: {
      type: Schema.Types.ObjectId,
      ref: "Compound",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum: ["mg", "mcg", "ml", "units"],
      required: true,
    },
    injectionSite: {
      type: String,
      enum: [
        "abdomen_left",
        "abdomen_right",
        "thigh_left",
        "thigh_right",
        "arm_left",
        "arm_right",
        "buttock_left",
        "buttock_right",
      ],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const mealLogSchema = new Schema<MealLogDocument>(
  {
    ...logBaseFields,
    foodName: {
      type: String,
      required: true,
      trim: true,
    },
    servingSize: {
      type: String,
      trim: true,
    },
    protein: {
      type: Number,
      required: true,
      min: 0,
    },
    calories: {
      type: Number,
      required: true,
      min: 0,
    },
    carbs: {
      type: Number,
      min: 0,
    },
    fat: {
      type: Number,
      min: 0,
    },
    fiber: {
      type: Number,
      min: 0,
    },
    source: {
      type: String,
      enum: ["scan", "voice", "search", "manual"],
      required: true,
    },
    photoS3Key: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const waterLogSchema = new Schema<WaterLogDocument>(
  {
    ...logBaseFields,
    amountOz: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const proteinLogSchema = new Schema<ProteinLogDocument>(
  {
    ...logBaseFields,
    grams: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const activityLogSchema = new Schema<ActivityLogDocument>(
  {
    ...logBaseFields,
    steps: {
      type: Number,
      min: 0,
    },
    workoutMinutes: {
      type: Number,
      min: 0,
    },
    resistanceTraining: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const sideEffectLogSchema = new Schema<SideEffectLogDocument>(
  {
    ...logBaseFields,
    types: {
      type: [String],
      enum: [
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
      ],
      required: true,
      default: [],
    },
    customType: {
      type: String,
      trim: true,
    },
    severity: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    relatedDoseLogId: {
      type: Schema.Types.ObjectId,
      ref: "DoseLog",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const measurementSchema = new Schema<MeasurementDocument>(
  {
    ...logBaseFields,
    type: {
      type: String,
      enum: [
        "waist",
        "hips",
        "chest",
        "arm",
        "thigh",
        "neck",
        "body_fat",
        "face_fullness",
      ],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const logSchemas = [
  { schema: weightLogSchema, hasIdempotencyKey: false },
  { schema: doseLogSchema, hasIdempotencyKey: true },
  { schema: mealLogSchema, hasIdempotencyKey: true },
  { schema: waterLogSchema, hasIdempotencyKey: true },
  { schema: proteinLogSchema, hasIdempotencyKey: true },
  { schema: activityLogSchema, hasIdempotencyKey: true },
  { schema: sideEffectLogSchema, hasIdempotencyKey: true },
  { schema: measurementSchema, hasIdempotencyKey: true },
];

for (const { schema, hasIdempotencyKey } of logSchemas) {
  applyLogIndexes(schema, hasIdempotencyKey);
  applySoftDeleteQueryMiddleware(schema);
  applyApiTransforms(schema);
}

export const WeightLogModel = mongoose.model<WeightLogDocument>(
  "WeightLog",
  weightLogSchema,
);
export const DoseLogModel = mongoose.model<DoseLogDocument>(
  "DoseLog",
  doseLogSchema,
);
export const MealLogModel = mongoose.model<MealLogDocument>(
  "MealLog",
  mealLogSchema,
);
export const WaterLogModel = mongoose.model<WaterLogDocument>(
  "WaterLog",
  waterLogSchema,
);
export const ProteinLogModel = mongoose.model<ProteinLogDocument>(
  "ProteinLog",
  proteinLogSchema,
);
export const ActivityLogModel = mongoose.model<ActivityLogDocument>(
  "ActivityLog",
  activityLogSchema,
);
export const SideEffectLogModel = mongoose.model<SideEffectLogDocument>(
  "SideEffectLog",
  sideEffectLogSchema,
);
export const MeasurementModel = mongoose.model<MeasurementDocument>(
  "Measurement",
  measurementSchema,
);
