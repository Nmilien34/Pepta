// Premium-route authorization. Reads the PERSISTED projection (no RevenueCat
// call per request) and evaluates source expiration at read time, so a
// modified client cannot use expired complimentary access against the API.
//
// Error mapping (shared contract):
//   confirmed inactive        → 403 ENTITLEMENT_REQUIRED  (paywall)
//   verification unavailable  → 503 ACCESS_VERIFICATION_UNAVAILABLE (retry,
//                               unless cached access is still within bounds)
// Enforcement is active only when the RevenueCat server key is configured —
// that key is the rollout flag for the whole access system.

import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "@pepta/shared";
import { AppError } from "../lib/errors";
import { UserModel } from "../models/user.model";
import { decisionFromPersistedState } from "../services/access-decision.service";
import { isRevenueCatConfigured } from "./../services/revenuecat.client";

export async function requireActiveAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!isRevenueCatConfigured()) {
      next();
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new AppError({
        code: ERROR_CODES.authMissingToken,
        message: "Authentication required",
        statusCode: 401,
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError({
        code: ERROR_CODES.authInvalidToken,
        message: "Unknown user",
        statusCode: 401,
      });
    }

    const decision = decisionFromPersistedState(user.entitlement);

    if (decision.state === "active") {
      next();
      return;
    }

    if (decision.state === "temporarily_unavailable") {
      if (decision.cachedAccess) {
        // Bounded offline honor: within validUntil the user keeps working.
        next();
        return;
      }
      throw new AppError({
        code: ERROR_CODES.accessVerificationUnavailable,
        message: "Access cannot be verified right now. Try again shortly.",
        statusCode: 503,
      });
    }

    throw new AppError({
      code: ERROR_CODES.entitlementRequired,
      message: "An active Pepta Plus subscription is required.",
      statusCode: 403,
    });
  } catch (error) {
    next(error);
  }
}
