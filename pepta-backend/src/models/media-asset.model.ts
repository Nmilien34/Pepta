import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";

export type MediaSource =
  | "direct_upload"
  | "meal_scan"
  | "provider_import";
export type MediaIntent =
  | "avatar"
  | "progress_photo"
  | "favourite_photo"
  | "meal_photo";
export type MediaStatus =
  | "pending_upload"
  | "processing"
  | "ready"
  | "deletion_pending"
  | "deleted";
export type MediaLinkKind =
  | "avatar"
  | "progress_photo"
  | "favourite"
  | "meal_log"
  | "recipe";

export interface MediaLink {
  kind: MediaLinkKind;
  resourceId: string;
  attachedAt: Date;
}

export interface MediaAssetDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  source: MediaSource;
  intent: MediaIntent;
  status: MediaStatus;
  stagingKey?: string;
  storageKey?: string;
  declaredContentType: string;
  declaredSizeBytes: number;
  contentType?: "image/jpeg";
  byteSize?: number;
  width?: number;
  height?: number;
  links: MediaLink[];
  expiresAt?: Date;
  deleteAttemptCount: number;
  nextDeleteAttemptAt?: Date;
  deleteLeaseUntil?: Date;
  lastDeleteErrorCode?: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const mediaLinkSchema = new Schema<MediaLink>(
  {
    kind: {
      type: String,
      required: true,
      enum: ["avatar", "progress_photo", "favourite", "meal_log", "recipe"],
    },
    resourceId: { type: String, required: true, maxlength: 200 },
    attachedAt: { type: Date, required: true },
  },
  { _id: false },
);

const mediaAssetSchema = new Schema<MediaAssetDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: ["direct_upload", "meal_scan", "provider_import"],
    },
    intent: {
      type: String,
      required: true,
      enum: ["avatar", "progress_photo", "favourite_photo", "meal_photo"],
    },
    status: {
      type: String,
      required: true,
      enum: [
        "pending_upload",
        "processing",
        "ready",
        "deletion_pending",
        "deleted",
      ],
    },
    stagingKey: {
      type: String,
      required(this: MediaAssetDocument) {
        return this.source === "direct_upload";
      },
      maxlength: 500,
    },
    storageKey: { type: String, maxlength: 500 },
    declaredContentType: { type: String, required: true, maxlength: 100 },
    declaredSizeBytes: { type: Number, required: true, min: 1 },
    contentType: { type: String, enum: ["image/jpeg"] },
    byteSize: { type: Number, min: 1 },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
    links: {
      type: [mediaLinkSchema],
      default: [],
      validate: {
        validator: (links: MediaLink[]) => links.length <= 8,
        message: "A media asset cannot have more than 8 links",
      },
    },
    expiresAt: { type: Date },
    deleteAttemptCount: { type: Number, required: true, default: 0, min: 0 },
    nextDeleteAttemptAt: { type: Date },
    deleteLeaseUntil: { type: Date },
    lastDeleteErrorCode: { type: String, maxlength: 120 },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

mediaAssetSchema.index({ userId: 1, status: 1 });
mediaAssetSchema.index({ userId: 1, intent: 1 });
mediaAssetSchema.index({ expiresAt: 1, status: 1 });
mediaAssetSchema.index({
  status: 1,
  nextDeleteAttemptAt: 1,
  deleteLeaseUntil: 1,
});

export const MediaAssetModel = mongoose.model<MediaAssetDocument>(
  "MediaAsset",
  mediaAssetSchema,
);
