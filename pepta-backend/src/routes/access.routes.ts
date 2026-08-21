import { revenueCatLinkInputSchema } from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { createInMemoryRateLimiter } from "../middleware/rate-limit.middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import {
  linkRevenueCatAppUserId,
  resolveAccess,
} from "../services/access-decision.service";
import { validateBody } from "../middleware/validate.middleware";

const router = Router();

router.use(requireAuth);
router.use(
  createInMemoryRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: "Too many access resolutions",
    keyBy: "userOrIp",
  }),
);

// Idempotent: may resume a pending complimentary provisioning saga and
// reconcile stale RevenueCat state. The client calls it after auth, on boot,
// on foreground, after purchase/restore, and while polling setup.
router.post(
  "/resolve",
  asyncHandler(async (req, res) => {
    sendData(res, await resolveAccess(req.user!.id));
  }),
);

// The device reporting which RevenueCat customer it is. Returns the resolved
// decision so the caller needs one round trip, not two.
router.post(
  "/link",
  validateBody(revenueCatLinkInputSchema),
  asyncHandler(async (req, res) => {
    await linkRevenueCatAppUserId(req.user!.id, req.body.appUserId);
    sendData(res, await resolveAccess(req.user!.id));
  }),
);

export default router;
