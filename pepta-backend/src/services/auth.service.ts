import type { AppleAuth, AuthResponse } from "@pepta/shared";
import { ERROR_CODES } from "@pepta/shared";
import { verifyAppleIdentityToken } from "../auth/apple";
import {
  verifyGoogleIdToken,
  type ProviderIdentity,
} from "../auth/google";
import { bindVerifiedProviderEmail } from "./provider-identity-binding.service";
import { issueSessionJwt } from "../auth/jwt";
import { DEMO_ACCOUNT } from "../config/demoAccount";
import { AppError, AuthError } from "../lib/errors";
import { logger } from "../lib/logger";
import { UserModel, type UserDocument } from "../models/user.model";
import { serializeUser, upsertUserFromIdentityWithResult } from "./user.service";

/**
 * App Store review demo login (guideline 2.1a). Verifies the fixed demo
 * credentials and returns a session for the pre-seeded demo account. Run
 * `npm run seed:demo` first so the account and its data exist. This is the only
 * email/password path and it is scoped to the single demo account.
 */
export async function signInWithReviewAccount(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const matches =
    email.trim().toLowerCase() === DEMO_ACCOUNT.email &&
    password === DEMO_ACCOUNT.password;
  if (!matches) {
    throw new AuthError("Invalid email or password.");
  }

  const user = await UserModel.findOne({ email: DEMO_ACCOUNT.email });
  if (!user) {
    throw new AppError({
      code: ERROR_CODES.serviceUnavailable,
      message: "Demo account is not available. Run the seed script.",
      statusCode: 503,
    });
  }

  return {
    token: issueSessionJwt(user._id.toString()),
    user: serializeUser(user),
    isNewUser: false,
  };
}

function buildAppleDisplayName(
  fullName: AppleAuth["fullName"],
): string | undefined {
  if (!fullName) {
    return undefined;
  }

  const parts = [fullName.givenName, fullName.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" ") : undefined;
}

async function persistVerifiedIdentity(
  user: UserDocument,
  identity: ProviderIdentity,
): Promise<void> {
  if (!identity.emailVerified || !identity.email) return;

  try {
    await bindVerifiedProviderEmail({
      userId: user._id,
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email: identity.email,
      verifiedAt: new Date(),
    });
  } catch (error) {
    logger.error(
      {
        userId: String(user._id),
        provider: identity.provider,
      },
      "[auth] verified provider email binding failed",
    );
    throw error;
  }
}

export async function signInWithGoogle(idToken: string): Promise<AuthResponse> {
  const identity = await verifyGoogleIdToken(idToken);
  const { user, isNewUser } = await upsertUserFromIdentityWithResult(identity);
  // Provider-specific proof for complimentary-access claims. A persistence
  // failure fails the sign-in (audit M1): a session without proof would
  // mis-route an approved user to identity-verification/paywall UX.
  await persistVerifiedIdentity(user, identity);
  const userId = user._id.toString();

  return {
    token: issueSessionJwt(userId),
    user: serializeUser(user),
    isNewUser,
  };
}

export async function signInWithApple(input: AppleAuth): Promise<AuthResponse> {
  const identity = await verifyAppleIdentityToken(input.identityToken);
  const { user, isNewUser } = await upsertUserFromIdentityWithResult({
    ...identity,
    name: buildAppleDisplayName(input.fullName) ?? identity.name,
  });
  // Apple supplies the email only on FIRST authorization — persist the
  // subject-bound proof durably so later sessions keep it. Same fail-closed
  // rule as Google: no silent sessions without persisted proof.
  await persistVerifiedIdentity(user, identity);
  const userId = user._id.toString();

  return {
    token: issueSessionJwt(userId),
    user: serializeUser(user),
    isNewUser,
  };
}
