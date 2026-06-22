import { logListQuerySchema } from '@pepta/shared';
import type { Router } from 'express';
import { Router as createRouter } from 'express';
import type { z } from 'zod';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody, validateQuery } from '../middleware/validate.middleware';

interface LogRouteService<TCreate, TResponse> {
  create(userId: string, body: TCreate): Promise<TResponse>;
  list(userId: string, query?: z.infer<typeof logListQuerySchema>): Promise<TResponse[]>;
  softDelete(userId: string, id: string): Promise<TResponse>;
}

export function createLogRouter<TSchema extends z.ZodTypeAny, TResponse>(
  bodySchema: TSchema,
  service: LogRouteService<z.infer<TSchema>, TResponse>,
): Router {
  const router = createRouter();

  router.use(requireAuth);

  router.get(
    '/',
    validateQuery(logListQuerySchema),
    asyncHandler(async (req, res) => {
      sendData(
        res,
        await service.list(
          req.user!.id,
          req.query as unknown as z.infer<typeof logListQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/',
    validateBody(bodySchema),
    asyncHandler(async (req, res) => {
      sendData(res, await service.create(req.user!.id, req.body), 201);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      sendData(res, await service.softDelete(req.user!.id, req.params.id as string));
    }),
  );

  return router;
}
