import { mealScanInputSchema, mealVoiceInputSchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import { analyzeMealScan, parseVoiceMeal } from '../services/meal-scan.service';

const router = Router();

router.use(requireAuth);

router.post(
  '/analyze',
  validateBody(mealScanInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await analyzeMealScan(req.body));
  }),
);

router.post(
  '/voice',
  validateBody(mealVoiceInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await parseVoiceMeal(req.body));
  }),
);

export default router;
