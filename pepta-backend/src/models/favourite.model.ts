// Saved foods and drinks, with the portion.
//
// Its own collection rather than a field on the profile: the list grows
// unbounded with use, and a profile document that has to be rewritten every
// time someone stars a snack is the wrong shape.
//
// The uniqueness is on (userId, key) where key already encodes kind + name +
// portion. That is what makes create idempotent under retry — a double-tapped
// star, or a request the client resent after a timeout, cannot produce two
// rows — and it is why two portions of one food stay two favourites.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export interface FavouriteDocument extends Document<Types.ObjectId> {
  /** Null for the seeded first-run offers, which belong to everybody. */
  userId: Types.ObjectId | null;
  key: string;
  starterKey?: string;
  kind: "food" | "drink";
  name: string;
  portion: string;
  protein?: number;
  calories?: number;
  fiber?: number;
  ounces?: number;
  source: "item" | "recipe";
  createdAt: Date;
  updatedAt: Date;
}

const favouriteSchema = new Schema<FavouriteDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    /** Set only on seeded offers, so re-seeding updates rather than duplicates. */
    starterKey: { type: String },
    key: { type: String, required: true },
    kind: { type: String, required: true, enum: ["food", "drink"] },
    name: { type: String, required: true },
    portion: { type: String, required: true, default: "" },
    protein: { type: Number },
    calories: { type: Number },
    fiber: { type: Number },
    ounces: { type: Number },
    source: { type: String, required: true, enum: ["item", "recipe"], default: "item" },
  },
  { timestamps: true },
);

favouriteSchema.index({ userId: 1, key: 1 }, { unique: true });
favouriteSchema.index({ starterKey: 1 }, { unique: true, sparse: true });
// The list is read newest-first every time it is opened.
favouriteSchema.index({ userId: 1, createdAt: -1 });

export const FavouriteModel = mongoose.model<FavouriteDocument>(
  "Favourite",
  favouriteSchema,
);
