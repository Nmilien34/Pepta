// Saved recipes, and the seeded starters.
//
// ONE COLLECTION, not two. A starter is a recipe with no owner: the shapes are
// identical, "save this starter as mine" is then a copy rather than a
// translation, and the list endpoint reads one collection instead of merging
// two. userId is null for starters, which is also what makes them shared.
//
// Totals are NOT stored — see the shared schema. Only the ingredients are.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface RecipeIngredientSub {
  name: string;
  amount: string;
  protein: number;
  calories: number;
  fiber?: number;
}

export interface RecipeDocument extends Document<Types.ObjectId> {
  /** Null for starters, which belong to everybody. */
  userId: Types.ObjectId | null;
  name: string;
  ingredients: RecipeIngredientSub[];
  photoMediaId?: Types.ObjectId;
  /** Stable id for a seeded recipe, so re-seeding updates rather than duplicates. */
  starterKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ingredientSchema = new Schema<RecipeIngredientSub>(
  {
    name: { type: String, required: true },
    amount: { type: String, required: true, default: "" },
    protein: { type: Number, required: true },
    calories: { type: Number, required: true },
    fiber: { type: Number },
  },
  { _id: false },
);

const recipeSchema = new Schema<RecipeDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true },
    ingredients: { type: [ingredientSchema], required: true },
    photoMediaId: { type: Schema.Types.ObjectId, ref: "MediaAsset" },
    starterKey: { type: String },
  },
  { timestamps: true },
);

// Sparse: only starters carry the key, so user recipes are exempt from the
// uniqueness rather than colliding on a missing field.
recipeSchema.index({ starterKey: 1 }, { unique: true, sparse: true });
recipeSchema.index({ userId: 1, createdAt: -1 });

export const RecipeModel = mongoose.model<RecipeDocument>("Recipe", recipeSchema);
