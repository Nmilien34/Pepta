import type { CompoundInput, ScheduleInput } from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import {
  applyApiTransforms,
  applySoftDeleteQueryMiddleware,
} from "./model-utils";

export interface CompoundDocument
  extends Omit<CompoundInput, "medicationCatalogId">, Document<Types.ObjectId> {
  userId: Types.ObjectId;
  medicationCatalogId?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleDocument
  extends
    Omit<ScheduleInput, "compoundId" | "nextDoseAt">,
    Document<Types.ObjectId> {
  userId: Types.ObjectId;
  compoundId: Types.ObjectId;
  nextDoseAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CycleDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  name: string;
  compoundIds: Types.ObjectId[];
  startDate: string;
  endDate?: string;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const compoundSchema = new Schema<CompoundDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    medicationCatalogId: {
      type: Schema.Types.ObjectId,
      ref: "MedicationCatalog",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    drugClass: {
      type: String,
      enum: ["glp_1", "dual_glp_1_gip", "peptide", "other"],
      required: true,
    },
    route: {
      type: String,
      enum: ["injection", "oral"],
      required: true,
      default: "injection",
    },
    deviceType: {
      type: String,
      enum: ["single_dose_pen", "auto_injector", "syringe_vial", "other"],
    },
    halfLifeDays: {
      type: Number,
      required: true,
      min: 0,
    },
    doseUnit: {
      type: String,
      enum: ["mg", "mcg", "ml", "units"],
      required: true,
    },
    plannedDose: {
      type: Number,
      min: 0,
    },
    concentration: {
      type: Number,
      min: 0,
    },
    concentrationUnit: {
      type: String,
      trim: true,
    },
    startDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    status: {
      type: String,
      enum: ["active", "paused", "completed"],
      required: true,
      default: "active",
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

compoundSchema.index({ userId: 1, status: 1, deletedAt: 1 });
applySoftDeleteQueryMiddleware(compoundSchema);

const scheduleSchema = new Schema<ScheduleDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    compoundId: {
      type: Schema.Types.ObjectId,
      ref: "Compound",
      required: true,
      index: true,
    },
    frequency: {
      type: String,
      enum: ["daily", "weekly", "biweekly", "custom"],
      required: true,
    },
    intervalDays: {
      type: Number,
      min: 1,
    },
    daysOfWeek: {
      type: [Number],
      default: [],
    },
    nextDoseAt: {
      type: Date,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

scheduleSchema.index({ userId: 1, compoundId: 1, active: 1 });

const cycleSchema = new Schema<CycleDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    compoundIds: {
      type: [Schema.Types.ObjectId],
      ref: "Compound",
      required: true,
      default: [],
    },
    startDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    endDate: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

cycleSchema.index({ userId: 1, active: 1, startDate: -1 });

applyApiTransforms(compoundSchema);
applyApiTransforms(scheduleSchema);
applyApiTransforms(cycleSchema);

export const CompoundModel = mongoose.model<CompoundDocument>(
  "Compound",
  compoundSchema,
);
export const ScheduleModel = mongoose.model<ScheduleDocument>(
  "Schedule",
  scheduleSchema,
);
export const CycleModel = mongoose.model<CycleDocument>("Cycle", cycleSchema);
