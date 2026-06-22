import { progressPhotoConfirmInputSchema, progressPhotoInputSchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import {
  confirmProgressPhoto,
  createProgressPhotoUploadIntent,
  listProgressPhotos,
} from '../services/progress-photo.service';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    sendData(res, await listProgressPhotos(req.user!.id));
  }),
);

router.post(
  '/upload-intent',
  validateBody(progressPhotoInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await createProgressPhotoUploadIntent(req.user!.id, req.body), 201);
  }),
);

router.post(
  '/confirm',
  validateBody(progressPhotoConfirmInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await confirmProgressPhoto(req.user!.id, req.body));
  }),
);

export default router;
