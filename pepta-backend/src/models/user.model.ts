import type { AuthProvider, SubscriptionStatus } from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface LinkedAuthProviderDocument {
  provider: AuthProvider;
  providerUserId: string;
  linkedAt: Date;
}

export interface UserEntitlementDocument {
  status: SubscriptionStatus;
  expiresAt: Date | null;
  willRenew: boolean;
  revenueCatCustomerId?: string;
  revenueCatEntitlement?: string;
}

export interface UserLegalAcceptanceDocument {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Date;
}

export interface UserDocument extends Document<Types.ObjectId> {
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
  authProviders: LinkedAuthProviderDocument[];
  entitlement: UserEntitlementDocument;
  onboardingComplete?: boolean;
  onboardingCompletedAt?: Date;
  legalAcceptance?: UserLegalAcceptanceDocument;
  createdAt: Date;
  updatedAt: Date;
}

const linkedAuthProviderSchema = new Schema<LinkedAuthProviderDocument>(
  {
    provider: {
      type: String,
      enum: ["google", "apple"],
      required: true,
    },
    providerUserId: {
      type: String,
      required: true,
      trim: true,
    },
    linkedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  { _id: false },
);

const entitlementSchema = new Schema<UserEntitlementDocument>(
  {
    status: {
      type: String,
      enum: [
        "free",
        "trialing",
        "active",
        "active_canceled",
        "past_due",
        "canceled",
        "refunded",
      ],
      required: true,
      default: "free",
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    willRenew: {
      type: Boolean,
      required: true,
      default: false,
    },
    revenueCatCustomerId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
    },
    revenueCatEntitlement: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const legalAcceptanceSchema = new Schema<UserLegalAcceptanceDocument>(
  {
    termsVersion: {
      type: String,
      required: true,
      trim: true,
    },
    privacyVersion: {
      type: String,
      required: true,
      trim: true,
    },
    acceptedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    displayName: {
      type: String,
      trim: true,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    authProviders: {
      type: [linkedAuthProviderSchema],
      default: [],
    },
    entitlement: {
      type: entitlementSchema,
      required: true,
      default: () => ({}),
    },
    onboardingComplete: {
      type: Boolean,
      default: false,
      index: true,
    },
    onboardingCompletedAt: {
      type: Date,
    },
    legalAcceptance: {
      type: legalAcceptanceSchema,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
      emailVerified: true,
    },
  },
);

userSchema.index(
  {
    "authProviders.provider": 1,
    "authProviders.providerUserId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "authProviders.provider": { $exists: true },
      "authProviders.providerUserId": { $exists: true },
    },
  },
);

applyApiTransforms(userSchema);

export const UserModel = mongoose.model<UserDocument>("User", userSchema);
