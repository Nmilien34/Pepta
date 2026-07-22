import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { resolveAccess } from "../services/access-decision.service";

const router = Router();

router.use(requireAuth);

// Idempotent: may resume a pending complimentary provisioning saga and
// reconcile stale RevenueCat state. The client calls it after auth, on boot,
// on foreground, after purchase/restore, and while polling setup.
router.post(
  "/resolve",
  asyncHandler(async (req, res) => {
    sendData(res, await resolveAccess(req.user!.id));
  }),
);

export default router;
