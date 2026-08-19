import {
  favouriteInputSchema,
  favouritePhotoDiscardInputSchema,
  favouritePhotoIntentInputSchema,
} from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import {
  createFavouritePhotoIntent,
  discardFavouritePhoto,
  listFavourites,
  removeFavourite,
  saveFavourite,
} from '../services/favourite.service';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    sendData(res, await listFavourites(req.user!.id));
  }),
);

// Upsert on (userId, key) — see the service for why this is not a plain create.
router.post(
  '/',
  validateBody(favouriteInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await saveFavourite(req.user!.id, req.body));
  }),
);

router.post(
  '/photo-intent',
  validateBody(favouritePhotoIntentInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await createFavouritePhotoIntent(req.user!.id, req.body.contentType));
  }),
);

// A photo that was uploaded and then not used. POST rather than DELETE: the
// key contains slashes, and a body carries it without a round of encoding.
router.post(
  '/photo-discard',
  validateBody(favouritePhotoDiscardInputSchema),
  asyncHandler(async (req, res) => {
    await discardFavouritePhoto(req.user!.id, req.body.photoS3Key);
    sendData(res, { ok: true });
  }),
);

// Keyed by the favourite's own key rather than its id: the client builds the
// key itself and can un-star without ever having read the row back.
router.delete(
  '/:key',
  asyncHandler(async (req, res) => {
    await removeFavourite(req.user!.id, decodeURIComponent(req.params.key as string));
    sendData(res, { ok: true });
  }),
);

export default router;
