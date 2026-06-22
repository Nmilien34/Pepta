import { onboardingCompleteInputSchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import { completeOnboarding } from '../services/onboarding.service';

const router = Router();

router.use(requireAuth);

router.post(
  '/complete',
  validateBody(onboardingCompleteInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await completeOnboarding(req.user!.id, req.body), 201);
  }),
);

export default router;
