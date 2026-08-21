// Premium-route authorization. Reads the PERSISTED projection (no RevenueCat
// call per request) and evaluates source expiration at read time, so a
// modified client cannot use expired complimentary access against the API.
//
// Error mapping (shared contract):
//   confirmed inactive        → 403 ENTITLEMENT_REQUIRED  (paywall)
//   verification unavailable  → 503 ACCESS_VERIFICATION_UNAVAILABLE (retry,
//                               unless cached access is still within bounds)
//
// THIS GATE FAILS CLOSED. It used to call next() unconditionally whenever the
// RevenueCat server key was absent, treating that key as a rollout flag — and
// it is the ONLY entitlement check in the app (no route or service does its
// own). So an empty or mistyped REVENUECAT_SECRET_API_KEY — a rotation, a
// truncated secret store, a redeploy — silently made every premium route free
// to everyone, with nothing in the logs and a preflight that still reported
// RevenueCat "PASS". The key is now required in production (config/env.ts), and
// if it is somehow missing anyway, users with cached access keep working while
// everyone else is refused.

import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "@pepta/shared";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import { UserModel } from "../models/user.model";
import { decisionFromPersistedState } from "../services/access-decision.service";
import { isRevenueCatConfigured } from "./../services/revenuecat.client";

let warnedUnconfigured = false;

export async function requireActiveAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!isRevenueCatConfigured() && !warnedUnconfigured) {
      // Loud once per process: this is a misconfiguration, not a mode.
      warnedUnconfigured = true;
      logger.error(
        "[access] REVENUECAT_SECRET_API_KEY is not configured — entitlement is being enforced from persisted state only",
      );
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
