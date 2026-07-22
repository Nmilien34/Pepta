import { referralClaimRequestSchema } from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { createInMemoryRateLimiter } from "../middleware/rate-limit.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { claimReferralCode } from "../services/referral.service";

const router = Router();

router.use(requireAuth);
router.use(
  createInMemoryRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message: "Too many referral-code attempts",
    keyBy: "userOrIp",
  }),
);

router.post(
  "/claim",
  validateBody(referralClaimRequestSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await claimReferralCode(req.user!.id, req.body));
  }),
);

export default router;
