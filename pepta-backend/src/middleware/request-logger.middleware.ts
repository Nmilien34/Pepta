import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = req.get('x-request-id') ?? randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
      '[request] complete',
    );
  });

  next();
};
