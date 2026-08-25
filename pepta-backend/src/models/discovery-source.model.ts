// Self-reported acquisition channel ("Where did you find us?", onboarding
// step 7). Its OWN collection on purpose: the user/profile response schemas
// are strict and bundled into shipped app builds, so a new key on either
// document would make old clients reject the whole response. Nothing
// client-facing ever serializes this — it exists for Mongo queries and the
// AppsFlyer cross-check.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import type { DiscoverySource } from "@pepta/shared";

export interface DiscoverySourceDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  source: DiscoverySource;
  createdAt: Date;
  updatedAt: Date;
}

const discoverySourceSchema = new Schema<DiscoverySourceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    source: {
      // KEEP IN SYNC with discoverySourceSchema in @pepta/shared. Drift lets a
      // body validate and then fail to save, which loses the answer after the
      // user has been shown the sent-bubble confirmation.
      // discovery-source.model.test.ts asserts the two lists are identical.
      type: String,
      enum: [
        "app_store",
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "reddit",
        "friends",
        "other",
      ],
      required: true,
    },
  },
  { timestamps: true },
);

export const DiscoverySourceModel = mongoose.model<DiscoverySourceDocument>(
  "DiscoverySource",
  discoverySourceSchema,
);
