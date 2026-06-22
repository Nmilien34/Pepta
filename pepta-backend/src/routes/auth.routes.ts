import { Router } from "express";
import { appleAuthSchema, googleAuthSchema } from "@pepta/shared";
import {
  appleSignInUnavailableError,
  isAppleSignInAvailable,
} from "../auth/apple";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import { signInWithApple, signInWithGoogle } from "../services/auth.service";

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

export default router;
