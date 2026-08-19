import { favouriteInputSchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import {
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
