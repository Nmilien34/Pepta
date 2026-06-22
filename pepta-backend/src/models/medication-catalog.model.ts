import type {
  DoseUnit,
  DrugClass,
  MedicationFrequency,
  MedicationRoute,
} from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface MedicationCatalogDocument extends Document<Types.ObjectId> {
  slug: string;
  name: string;
  brand?: string;
  drugClass: DrugClass;
  route: MedicationRoute;
  defaultFrequency: MedicationFrequency;
  commonDoses: number[];
  halfLifeDays: number;
  doseUnit: DoseUnit;
  defaultDose?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const medicationCatalogSchema = new Schema<MedicationCatalogDocument>(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
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
    defaultFrequency: {
      type: String,
      enum: ["daily", "weekly", "biweekly", "custom"],
      required: true,
      default: "weekly",
    },
    commonDoses: {
      type: [Number],
      required: true,
      default: [],
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
    defaultDose: {
      type: Number,
      min: 0,
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

applyApiTransforms(medicationCatalogSchema);

export const MedicationCatalogModel = mongoose.model<MedicationCatalogDocument>(
  "MedicationCatalog",
  medicationCatalogSchema,
);
