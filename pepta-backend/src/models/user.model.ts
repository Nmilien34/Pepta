import type { AuthProvider, SubscriptionStatus } from "@pepta/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface LinkedAuthProviderDocument {
  provider: AuthProvider;
  providerUserId: string;
  linkedAt: Date;
  // Provider-specific verified-email proof for exact Google or Apple
  // complimentary-access claims. Server-only: omitted by serializeUser.
  verifiedEmailNormalized?: string;
  emailVerifiedAt?: Date;
}

// One currently-active access source in the reconciled projection — current
// facts only, never transaction history (RevenueCat owns history).
export interface AccessSourceDocument {
  kind: "promotional" | "app_store";
  active: boolean;
  expiresAt: Date | null;
  willRenew: boolean;
  productId?: string;
  environment?: "sandbox" | "production";
}

export interface UserEntitlementDocument {
  status: SubscriptionStatus;
  expiresAt: Date | null;
  willRenew: boolean;
  revenueCatCustomerId?: string;
  revenueCatAppUserIds?: string[];
  revenueCatEntitlement?: string;
  // Reconciled projection (design doc "Effective Entitlement Projection").
  // Exposed only through AccessDecision — serializeUser keeps the legacy shape.
  effectiveAccess?: "active" | "inactive";
  source?: "promotional" | "app_store" | "mixed" | "none";
  sources?: AccessSourceDocument[];
  lastVerifiedAt?: Date | null;
  verificationState?: "verified" | "stale" | "unavailable";
}

export interface UserLegalAcceptanceDocument {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Date;
}

export interface UserNotificationPreferencesDocument {
  aiPushCopyConsent: boolean;
  aiPushCopyConsentAt: Date | null;
  aiPushCopyConsentRevokedAt: Date | null;
}

export interface UserDocument extends Document<Types.ObjectId> {
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
  avatarKey?: string;
  authProviders: LinkedAuthProviderDocument[];
  entitlement: UserEntitlementDocument;
  onboardingComplete?: boolean;
  onboardingCompletedAt?: Date;
  legalAcceptance?: UserLegalAcceptanceDocument;
  notificationPreferences: UserNotificationPreferencesDocument;
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
    verifiedEmailNormalized: {
      type: String,
      trim: true,
      lowercase: true,
    },
    emailVerifiedAt: {
      type: Date,
    },
  },
  { _id: false },
);

const accessSourceSchema = new Schema<AccessSourceDocument>(
  {
    kind: {
      type: String,
      enum: ["promotional", "app_store"],
      required: true,
    },
    active: {
      type: Boolean,
      required: true,
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
    productId: {
      type: String,
      trim: true,
    },
    environment: {
      type: String,
      enum: ["sandbox", "production"],
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
    revenueCatAppUserIds: {
      type: [String],
      default: [],
      index: true,
    },
    revenueCatEntitlement: {
      type: String,
      trim: true,
    },
    effectiveAccess: {
      type: String,
      enum: ["active", "inactive"],
    },
    source: {
      type: String,
      enum: ["promotional", "app_store", "mixed", "none"],
    },
    sources: {
      type: [accessSourceSchema],
      default: undefined,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    verificationState: {
      type: String,
      enum: ["verified", "stale", "unavailable"],
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

const notificationPreferencesSchema =
  new Schema<UserNotificationPreferencesDocument>(
    {
      aiPushCopyConsent: {
        type: Boolean,
        required: true,
        default: false,
      },
      aiPushCopyConsentAt: {
        type: Date,
        default: null,
      },
      aiPushCopyConsentRevokedAt: {
        type: Date,
        default: null,
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
    avatarKey: {
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
    notificationPreferences: {
      type: notificationPreferencesSchema,
      required: true,
      default: () => ({}),
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
