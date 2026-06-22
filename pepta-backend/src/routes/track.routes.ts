import { logListQuerySchema } from '@pepta/shared';
import { Router } from 'express';
import type { z } from 'zod';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateQuery } from '../middleware/validate.middleware';
import { getTrack } from '../services/track.service';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
    validateQuery(logListQuerySchema),
    asyncHandler(async (req, res) => {
      sendData(
        res,
        await getTrack(req.user!.id, req.query as unknown as z.infer<typeof logListQuerySchema>),
      );
    }),
  );

export default router;
