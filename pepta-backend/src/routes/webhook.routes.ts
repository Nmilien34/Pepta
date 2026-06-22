import { revenueCatWebhookSchema } from '@pepta/shared';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import {
  applyRevenueCatWebhook,
  verifyRevenueCatSecret,
} from '../services/revenuecat.service';

const router = Router();

function requireRevenueCatSecret(req: Request, _res: Response, next: NextFunction): void {
  try {
    verifyRevenueCatSecret(req.get('authorization') ?? req.get('x-revenuecat-webhook-secret'));
    next();
  } catch (error) {
    next(error);
  }
}

router.post(
  '/revenuecat',
  requireRevenueCatSecret,
  validateBody(revenueCatWebhookSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await applyRevenueCatWebhook(req.body));
  }),
);

export default router;
