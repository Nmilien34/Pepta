import {
  progressPhotoConfirmInputSchema,
  progressPhotoInputSchema,
} from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData, sendNoContent } from "../lib/responses";
import { validateBody } from "../middleware/validate.middleware";
import {
  confirmProgressPhoto,
  createProgressPhotoUploadIntent,
  deleteProgressPhoto,
  getProgressPhotoViewUrl,
  listProgressPhotos,
} from "../services/progress-photo.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    sendData(res, await listProgressPhotos(req.user!.id));
  }),
);

router.post(
  "/upload-intent",
  validateBody(progressPhotoInputSchema),
  asyncHandler(async (req, res) => {
    sendData(
      res,
      await createProgressPhotoUploadIntent(req.user!.id, req.body),
      201,
    );
  }),
);

router.post(
  "/confirm",
  validateBody(progressPhotoConfirmInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await confirmProgressPhoto(req.user!.id, req.body));
  }),
);

router.get(
  "/:id/view-url",
  asyncHandler(async (req, res) => {
    sendData(
      res,
      await getProgressPhotoViewUrl(req.user!.id, req.params.id as string),
    );
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteProgressPhoto(req.user!.id, req.params.id as string);
    sendNoContent(res);
  }),
);

export default router;
