// Complimentary-access data: invitation/grant state machine, one-grant
// redemption tombstones, and the append-only audit trail.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export const COMPLIMENTARY_GRANT_STATUSES = [
  "pending",
  "provisioning",
  "retryable_failure",
  "active",
  "revoking",
  "revoked",
  "expired",
  "terminal_failure",
] as const;
export type ComplimentaryGrantStatus =
  (typeof COMPLIMENTARY_GRANT_STATUSES)[number];

export interface ComplimentaryAccessGrantDocument
  extends Document<Types.ObjectId> {
  emailNormalized: string;
  category: "creator" | "friend";
  reason: string;
  status: ComplimentaryGrantStatus;
  durationMonths: number;
  attemptCount: number;
  createdBy: string;
  // Lifecycle fields — absent until their event occurs (never placeholder null).
  userId?: Types.ObjectId;
  claimedAt?: Date;
  requestedAt?: Date;
  grantedAt?: Date;
  expiresAt?: Date;
  expiredAt?: Date;
  revokedAt?: Date;
  operationId?: string;
  nextAttemptAt?: Date;
  lastErrorCode?: string;
  leaseId?: string;
  leaseExpiresAt?: Date;
  // Operator-authorized Apple private-relay link (absent unless linked).
  identityLinkProvider?: "apple";
  identityLinkedAt?: Date;
  identityLinkedBy?: string;
  identityLinkReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const grantSchema = new Schema<ComplimentaryAccessGrantDocument>(
  {
    emailNormalized: { type: String, required: true, trim: true, lowercase: true, unique: true },
    category: { type: String, enum: ["creator", "friend"], required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: COMPLIMENTARY_GRANT_STATUSES,
      required: true,
      default: "pending",
    },
    durationMonths: { type: Number, required: true, default: 3 },
    attemptCount: { type: Number, required: true, default: 0 },
    createdBy: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    claimedAt: { type: Date },
    requestedAt: { type: Date },
    grantedAt: { type: Date },
    expiresAt: { type: Date },
    expiredAt: { type: Date },
    revokedAt: { type: Date },
    operationId: { type: String, trim: true },
    nextAttemptAt: { type: Date },
    lastErrorCode: { type: String, trim: true },
    leaseId: { type: String, trim: true },
    leaseExpiresAt: { type: Date },
    identityLinkProvider: { type: String, enum: ["apple"] },
    identityLinkedAt: { type: Date },
    identityLinkedBy: { type: String, trim: true },
    identityLinkReason: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false },
);

grantSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } },
);
grantSchema.index(
  { operationId: 1 },
  { unique: true, partialFilterExpression: { operationId: { $exists: true } } },
);
grantSchema.index({ status: 1, nextAttemptAt: 1 });
grantSchema.index({ leaseExpiresAt: 1 });

applyApiTransforms(grantSchema);

export const ComplimentaryAccessGrantModel =
  mongoose.model<ComplimentaryAccessGrantDocument>(
    "ComplimentaryAccessGrant",
    grantSchema,
  );

// Privacy-preserving one-grant enforcement: a keyed HMAC fingerprint of the
// normalized email survives account/grant deletion, so deleting and
// recreating an account can never reset the three-month benefit.
export interface ComplimentaryAccessRedemptionDocument
  extends Document<Types.ObjectId> {
  keyId: string;
  fingerprint: string;
  category: "creator" | "friend";
  redeemedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const redemptionSchema = new Schema<ComplimentaryAccessRedemptionDocument>(
  {
    keyId: { type: String, required: true, trim: true },
    fingerprint: { type: String, required: true, trim: true },
    category: { type: String, enum: ["creator", "friend"], required: true },
    redeemedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

redemptionSchema.index({ keyId: 1, fingerprint: 1 }, { unique: true });

applyApiTransforms(redemptionSchema);

export const ComplimentaryAccessRedemptionModel =
  mongoose.model<ComplimentaryAccessRedemptionDocument>(
    "ComplimentaryAccessRedemption",
    redemptionSchema,
  );

// Append-only audit trail. Never updated, never deleted by application code.
export interface AccessAuditEventDocument extends Document<Types.ObjectId> {
  grantId?: Types.ObjectId;
  previousStatus?: string;
  nextStatus?: string;
  actor: "admin" | "authentication" | "worker" | "webhook" | "system";
  operationId?: string;
  subject?: string; // masked email or user id — never a raw email
  reason?: string;
  errorCode?: string;
  at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const auditSchema = new Schema<AccessAuditEventDocument>(
  {
    grantId: { type: Schema.Types.ObjectId, ref: "ComplimentaryAccessGrant", index: true },
    previousStatus: { type: String, trim: true },
    nextStatus: { type: String, trim: true },
    actor: {
      type: String,
      enum: ["admin", "authentication", "worker", "webhook", "system"],
      required: true,
    },
    operationId: { type: String, trim: true },
    subject: { type: String, trim: true },
    reason: { type: String, trim: true },
    errorCode: { type: String, trim: true },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

applyApiTransforms(auditSchema);

export const AccessAuditEventModel = mongoose.model<AccessAuditEventDocument>(
  "AccessAuditEvent",
  auditSchema,
);
