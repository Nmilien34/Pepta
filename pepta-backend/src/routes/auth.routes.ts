import { Router } from "express";
import { appleAuthSchema, ERROR_CODES, googleAuthSchema } from "@pepta/shared";
import {
  appleSignInUnavailableError,
  isAppleSignInAvailable,
} from "../auth/apple";
import { asyncHandler } from "../lib/async-handler";
import { AppError } from "../lib/errors";
import { sendData } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import {
  signInWithApple,
  signInWithGoogle,
  signInWithReviewAccount,
} from "../services/auth.service";

const router = Router();

router.post(
  "/google",
  validateBody(googleAuthSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await signInWithGoogle(req.body.idToken));
  }),
);

router.post(
  "/apple",
  validateBody(appleAuthSchema),
  asyncHandler(async (req, res) => {
    if (!isAppleSignInAvailable()) {
      throw appleSignInUnavailableError();
    }

    sendData(res, await signInWithApple(req.body));
  }),
);

// Demo login for App Store review (guideline 2.1a). Email + password sign-in
// scoped server-side to the seeded demo account; not a general password path.
router.post(
  "/demo",
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") {
      throw new AppError({
        code: ERROR_CODES.validation,
        message: "Email and password are required.",
        statusCode: 400,
      });
    }
    sendData(res, await signInWithReviewAccount(body.email, body.password));
  }),
);

export default router;
