import { mealLogInputSchema } from '@pepta/shared';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { mealLogService } from '../services/logs.service';
import { getMealLogScanDetail } from '../services/meal-scan.service';
import { createLogRouter } from './log-routes.factory';

const router = createLogRouter(mealLogInputSchema, mealLogService);

router.get(
  '/:id/scan',
  asyncHandler(async (req, res) => {
    sendData(res, await getMealLogScanDetail(req.user!.id, req.params.id as string));
  }),
);

export default router;
