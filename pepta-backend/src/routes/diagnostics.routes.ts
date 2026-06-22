import { stallDiagnosticInputSchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import { getStallDiagnostic } from '../services/stall-diagnostic.service';

const router = Router();

router.use(requireAuth);

router.post(
  '/stall',
  validateBody(stallDiagnosticInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await getStallDiagnostic(req.user!.id, req.body));
  }),
);

export default router;
