// Durable, email-free cleanup queue for promotional revocation after account
// deletion. Holds ONLY the old RevenueCat App User ID + entitlement id — no
// email, no user document reference that must survive. Deletion never blocks
// on RevenueCat; this queue guarantees the promo is eventually revoked (or an
// operator resolves it) without leaking access forever.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export const COMPLIMENTARY_CLEANUP_STATUSES = [
  "pending",
  "processing",
  "retryable_failure",
  "terminal_failure",
] as const;

export type ComplimentaryCleanupStatus =
  (typeof COMPLIMENTARY_CLEANUP_STATUSES)[number];

export interface ComplimentaryAccessCleanupDocument
  extends Document<Types.ObjectId> {
  revenueCatAppUserId: string;
  entitlementId: string;
  status: ComplimentaryCleanupStatus;
  attemptCount: number;
  nextAttemptAt?: Date;
  lastErrorCode?: string;
  leaseId?: string;
  leaseExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cleanupSchema = new Schema<ComplimentaryAccessCleanupDocument>(
  {
    revenueCatAppUserId: { type: String, required: true, trim: true, index: true },
    entitlementId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: COMPLIMENTARY_CLEANUP_STATUSES,
      required: true,
      default: "pending",
    },
    attemptCount: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date },
    lastErrorCode: { type: String, trim: true },
    leaseId: { type: String, trim: true },
    leaseExpiresAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

cleanupSchema.index(
  { revenueCatAppUserId: 1, entitlementId: 1 },
  { unique: true },
);
cleanupSchema.index({ status: 1, nextAttemptAt: 1 });
cleanupSchema.index({ leaseExpiresAt: 1 });

applyApiTransforms(cleanupSchema);

export const ComplimentaryAccessCleanupModel =
  mongoose.model<ComplimentaryAccessCleanupDocument>(
    "ComplimentaryAccessCleanup",
    cleanupSchema,
  );
