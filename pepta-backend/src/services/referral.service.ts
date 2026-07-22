// Referral claiming — attribution only. The backend is the single authority:
// arbitrary codes are rejected, normalization is defined here, and an account
// can hold exactly one claim. Nothing in this module touches RevenueCat,
// subscription status, or entitlements.

import { ERROR_CODES } from "@pepta/shared";
import type { ReferralClaimInput, ReferralClaimResponse } from "@pepta/shared";
import { AppError, NotFoundError, ValidationError } from "../lib/errors";
import {
  ReferralClaimModel,
  ReferralCodeModel,
} from "../models/referral.model";

// Post-normalization shape: letters/digits only, 2–32 chars. Separators the
// user may type (spaces, dashes, underscores) are stripped, so "pep-20" and
// "PEP 20" both claim PEP20.
const NORMALIZED_CODE = /^[A-Z0-9]{2,32}$/;

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s_-]+/g, "");
}

function alreadyClaimedError(): AppError {
  return new AppError({
    code: ERROR_CODES.conflict,
    message: "A referral code was already used on this account.",
    statusCode: 409,
  });
}

export async function claimReferralCode(
  userId: string,
  input: ReferralClaimInput,
): Promise<ReferralClaimResponse> {
  const code = normalizeReferralCode(input.code);
  if (!NORMALIZED_CODE.test(code)) {
    throw new ValidationError(
      "That code doesn’t look right — double-check it and try again.",
    );
  }

  // Idempotent for the same code; a different second code is refused.
  const existing = await ReferralClaimModel.findOne({ userId }).lean();
  if (existing) {
    if (existing.code === code) return { code, alreadyClaimed: true };
    throw alreadyClaimedError();
  }

  const codeDoc = await ReferralCodeModel.findOne({ code, active: true }).lean();
  const expired =
    codeDoc?.expiresAt != null && codeDoc.expiresAt.getTime() < Date.now();
  if (!codeDoc || expired) {
    throw new NotFoundError(
      "We couldn’t find that code. Check the spelling — or skip for now.",
    );
  }

  try {
    await ReferralClaimModel.create({
      userId,
      codeId: codeDoc._id,
      code,
      claimedAt: new Date(),
    });
  } catch (error) {
    // Unique-userId race: two claims landed together. Resolve like the
    // sequential path would have.
    if ((error as { code?: number }).code === 11000) {
      const raced = await ReferralClaimModel.findOne({ userId }).lean();
      if (raced?.code === code) return { code, alreadyClaimed: true };
      throw alreadyClaimedError();
    }
    throw error;
  }

  return { code, alreadyClaimed: false };
}
