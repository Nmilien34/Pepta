import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { getWeeklyRetention } from '../services/muscle-retention.service';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    sendData(res, await getWeeklyRetention(req.user!.id));
  }),
);

export default router;
