import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { getHome } from '../services/home.service';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    sendData(
      res,
      await getHome(req.user!.id, new Date(), req.query.range, {
        allowAIInsightProse: req.get("x-pepta-ai-consent") === "true",
        tz: req.query.tz,
        // Capability param: only clients whose bundled schema tolerates a
        // null halfLifeDays may receive unmodelled compounds.
        includeUnmodeledCompounds: req.query.unmodeled === "1",
      }),
    );
  }),
);

export default router;
