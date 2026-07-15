import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export type PepPushCopySource = "ai" | "deterministic";

export interface PepPushDeliveryDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  priorityId: string;
  windowKey: string;
  source: PepPushCopySource;
  sentAt: Date;
  tokenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const pepPushDeliverySchema = new Schema<PepPushDeliveryDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    priorityId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    windowKey: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ["ai", "deterministic"],
      required: true,
    },
    sentAt: {
      type: Date,
      required: true,
      index: true,
    },
    tokenCount: {
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

pepPushDeliverySchema.index(
  { userId: 1, priorityId: 1, windowKey: 1 },
  { unique: true },
);

applyApiTransforms(pepPushDeliverySchema);

export const PepPushDeliveryModel = mongoose.model<PepPushDeliveryDocument>(
  "PepPushDelivery",
  pepPushDeliverySchema,
);
