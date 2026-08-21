import {
  mediaConfirmInputSchema,
  mediaDiscardInputSchema,
  mediaUploadIntentInputSchema,
} from "@pepta/shared";
import { Router } from "express";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { createInMemoryRateLimiter } from "../middleware/rate-limit.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  confirmMediaUpload,
  createMediaUploadIntent,
  discardMedia,
} from "../services/media.service";

const router = Router();
const uploadIntentLimiter = createInMemoryRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: "Too many media upload attempts",
  keyBy: "userOrIp",
});

router.post(
  "/upload-intent",
  uploadIntentLimiter,
  validateBody(mediaUploadIntentInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await createMediaUploadIntent(req.user!.id, req.body));
  }),
);

router.post(
  "/confirm",
  validateBody(mediaConfirmInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await confirmMediaUpload(req.user!.id, req.body));
  }),
);

router.post(
  "/discard",
  validateBody(mediaDiscardInputSchema),
  asyncHandler(async (req, res) => {
    await discardMedia(req.user!.id, req.body.mediaId);
    sendData(res, { ok: true });
  }),
);

export default router;
