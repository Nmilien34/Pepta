import { levelRangeQuerySchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateQuery } from '../middleware/validate.middleware';
import {
  getMedicationLevels,
  getMedicationLevelsForRange,
} from '../services/medication-level.service';

const router = Router();

router.use(requireAuth);

// TWO SHAPES, GATED ON THE REQUEST — the timezone-param precedent. `?range=`
// returns the envelope the chart needs (what window was actually drawn, which
// "all" only knows after reading the user's first dose). Without it, the bare
// array that builds shipped before ranges existed already parse. Answering
// every caller with the envelope would break those builds on a strict parse.
router.get(
  '/',
  validateQuery(levelRangeQuerySchema),
  asyncHandler(async (req, res) => {
    const range = (req.query as { range?: 'week' | 'month' | 'quarter' | 'all' }).range;
    sendData(
      res,
      range
        ? await getMedicationLevelsForRange(req.user!.id, range)
        : await getMedicationLevels(req.user!.id),
    );
  }),
);

export default router;
