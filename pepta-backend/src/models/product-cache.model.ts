import type {
  MealProductCitation,
  MealScanAnalysis,
  MealProductScanMetadata,
} from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface ProductNutritionCacheDocument
  extends Document<Types.ObjectId> {
  cacheKey: string;
  source: MealProductScanMetadata["source"];
  barcode?: string;
  brand?: string;
  productName?: string;
  analysis: MealScanAnalysis;
  citations: MealProductCitation[];
  createdAt: Date;
  updatedAt: Date;
}

const productCitationSchema = new Schema<MealProductCitation>(
  {
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false, versionKey: false },
);

const productAnalysisSchema = new Schema<MealScanAnalysis>(
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

const productNutritionCacheSchema =
  new Schema<ProductNutritionCacheDocument>(
    {
      cacheKey: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        index: true,
      },
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
      barcode: { type: String, trim: true, index: true },
      brand: { type: String, trim: true },
      productName: { type: String, trim: true },
      analysis: { type: productAnalysisSchema, required: true },
      citations: { type: [productCitationSchema], default: [] },
    },
    {
      timestamps: true,
      versionKey: false,
    },
  );

productNutritionCacheSchema.index({ updatedAt: 1 });

applyApiTransforms(productNutritionCacheSchema);

export const ProductNutritionCacheModel =
  mongoose.model<ProductNutritionCacheDocument>(
    "ProductNutritionCache",
    productNutritionCacheSchema,
  );
