import type { UserProfileInput } from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface UserProfileDocument
  extends UserProfileInput, Document<Types.ObjectId> {
  userId: Types.ObjectId;
  ageYears: number;
  dailyCalorieTarget: number;
  dailyProteinTargetGrams: number;
  proteinGramsPerKg: number;
  targetWeeklyLossPercent: number;
  estimatedGoalDate: string | null;
  dailyFiberTargetGrams: number;
  dailyWaterTargetOz: number;
  dailyStepTarget: number;
  nutritionEngineVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const userProfileSchema = new Schema<UserProfileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    sex: {
      type: String,
      enum: ["male", "female"],
    },
    dateOfBirth: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    ageYears: {
      type: Number,
      required: true,
      min: 18,
      max: 100,
    },
    genderIdentity: {
      type: String,
      enum: ["woman", "man", "nonbinary", "other", "prefer_not_to_say"],
    },
    medicationStatus: {
      type: String,
      enum: ["active", "starting_soon", "none"],
      required: true,
      default: "none",
      index: true,
    },
    height: {
      type: Number,
      required: true,
      min: 1,
    },
    heightUnit: {
      type: String,
      enum: ["in", "cm"],
      required: true,
    },
    currentWeight: {
      type: Number,
      required: true,
      min: 1,
    },
    weightUnit: {
      type: String,
      enum: ["lb", "kg"],
      required: true,
    },
    goalWeight: {
      type: Number,
      required: true,
      min: 1,
    },
    goalWeightUnit: {
      type: String,
      enum: ["lb", "kg"],
      required: true,
    },
    goalPace: {
      type: String,
      enum: ["gentle", "steady", "ambitious"],
      required: true,
    },
    activityLevel: {
      type: String,
      enum: ["sedentary", "light", "moderate", "active"],
      required: true,
    },
    trainingStatus: {
      type: String,
      enum: ["not_training", "beginner", "returning", "consistent"],
      required: true,
    },
    goalType: {
      type: String,
      enum: ["lose_fat", "maintain", "recomp"],
      required: true,
    },
    biggestWorry: {
      type: String,
      enum: [
        "losing_muscle",
        "ozempic_face",
        "side_effects",
        "stalling",
        "rebound",
        "energy",
      ],
      required: true,
    },
    doseUnitPreference: {
      type: String,
      enum: ["mg", "mcg", "ml", "units"],
      required: true,
      default: "mg",
    },
    onboardingComplete: {
      type: Boolean,
      required: true,
      default: false,
    },
    journeyStartDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: "America/New_York",
    },
    sideEffectBaseline: {
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
      default: [],
    },
    dailyCalorieTarget: {
      type: Number,
      required: true,
      min: 1,
    },
    dailyProteinTargetGrams: {
      type: Number,
      required: true,
      min: 1,
    },
    proteinGramsPerKg: {
      type: Number,
      required: true,
      min: 0,
    },
    targetWeeklyLossPercent: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedGoalDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    dailyFiberTargetGrams: {
      type: Number,
      required: true,
      min: 1,
    },
    dailyWaterTargetOz: {
      type: Number,
      required: true,
      min: 1,
    },
    dailyStepTarget: {
      type: Number,
      required: true,
      min: 0,
    },
    nutritionEngineVersion: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

applyApiTransforms(userProfileSchema);

export const UserProfileModel = mongoose.model<UserProfileDocument>(
  "UserProfile",
  userProfileSchema,
);
