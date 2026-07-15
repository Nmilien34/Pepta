import type { PushPlatform } from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface PushTokenDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  token: string;
  platform: PushPlatform;
  deviceId?: string;
  appVersion?: string;
  enabled: boolean;
  lastSeenAt: Date;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const pushTokenSchema = new Schema<PushTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
    deviceId: {
      type: String,
      trim: true,
    },
    appVersion: {
      type: String,
      trim: true,
    },
    enabled: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    disabledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

pushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

applyApiTransforms(pushTokenSchema);

export const PushTokenModel = mongoose.model<PushTokenDocument>(
  "PushToken",
  pushTokenSchema,
);
