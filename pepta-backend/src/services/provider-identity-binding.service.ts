// Subject-bound provider verified-email proof (Apple design §Provider-
// Verified Email Binding). One conditional update matches the Pepta user,
// provider name, AND the authenticated provider subject, then writes only
// that exact array entry — a token for one subject can never decorate a
// different subject's entry, and nothing outside a freshly verified provider
// token may call this. `emailVerifiedAt` refreshes on every verified
// authentication, even when the address is unchanged (Apple sends the email
// only on first authorization, so the stored proof must stay durable).

import type { Types } from "mongoose";
import { ERROR_CODES } from "@pepta/shared";
import type { AuthProvider } from "@pepta/shared";
import { AppError } from "../lib/errors";
import { UserModel } from "../models/user.model";

export interface VerifiedProviderEmailInput {
  userId: Types.ObjectId | string;
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  verifiedAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function bindVerifiedProviderEmail(
  input: VerifiedProviderEmailInput,
): Promise<void> {
  const emailNormalized = normalizeEmail(input.email);

  const result = await UserModel.updateOne(
    {
      _id: input.userId,
      authProviders: {
        $elemMatch: {
          provider: input.provider,
          providerUserId: input.providerUserId,
        },
      },
    },
    {
      $set: {
        "authProviders.$.verifiedEmailNormalized": emailNormalized,
        "authProviders.$.emailVerifiedAt": input.verifiedAt,
      },
    },
  );

  if (result.matchedCount !== 1) {
    // The provider entry must exist after upsert; a miss means the proof was
    // NOT persisted — callers must fail the sign-in rather than continue.
    throw new AppError({
      code: ERROR_CODES.internal,
      message: "Verified provider email could not be bound",
      statusCode: 500,
      expose: false,
    });
  }
}
