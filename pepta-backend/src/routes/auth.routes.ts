import { Router } from 'express';
import { appleAuthSchema, googleAuthSchema } from '@pepta/shared';
import { appleSignInUnavailableError, isAppleSignInAvailable } from '../auth/apple';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

router.post(
  '/google',
  validateBody(googleAuthSchema),
  asyncHandler(async (_req, res) => {
    sendData(res, { status: 'not_implemented' }, 501);
  }),
);

router.post(
  '/apple',
  validateBody(appleAuthSchema),
  asyncHandler(async (_req, res) => {
    if (!isAppleSignInAvailable()) {
      throw appleSignInUnavailableError();
    }

    sendData(res, { status: 'not_implemented' }, 501);
  }),
);

export default router;
