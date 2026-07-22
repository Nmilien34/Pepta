// Referral attribution — creator/campaign codes and one-per-user claims.
// Attribution only: nothing here reads or writes subscription state.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

// A registered code (inserted by us, e.g. via mongosh — no admin surface yet).
// `code` is stored normalized: trimmed, uppercased, no spaces/dashes.
export interface ReferralCodeDocument extends Document<Types.ObjectId> {
  code: string;
  active: boolean;
  expiresAt?: Date | null;
  creatorName?: string;
  campaign?: string;
  createdAt: Date;
  updatedAt: Date;
}

const referralCodeSchema = new Schema<ReferralCodeDocument>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    creatorName: {
      type: String,
      trim: true,
    },
    campaign: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

applyApiTransforms(referralCodeSchema);

export const ReferralCodeModel = mongoose.model<ReferralCodeDocument>(
  "ReferralCode",
  referralCodeSchema,
);

// One claim per account — enforced by the unique userId index, which is also
// what makes concurrent double-claims safe (the race loser hits E11000).
export interface ReferralClaimDocument extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  codeId: Types.ObjectId;
  code: string;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const referralClaimSchema = new Schema<ReferralClaimDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    codeId: {
      type: Schema.Types.ObjectId,
      ref: "ReferralCode",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    claimedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

applyApiTransforms(referralClaimSchema);

export const ReferralClaimModel = mongoose.model<ReferralClaimDocument>(
  "ReferralClaim",
  referralClaimSchema,
);
