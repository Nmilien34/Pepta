import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';

export function createHealthRouter(healthCheck: () => Promise<boolean>): Router {
  const router = Router();

  router.get(
    '/healthz',
    asyncHandler(async (_req, res) => {
      const reachable = await healthCheck();
      sendData(res, {
        status: 'ok',
        database: reachable ? 'reachable' : 'unreachable',
      });
    }),
  );

  return router;
}
