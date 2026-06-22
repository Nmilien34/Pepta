import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, InternalError, NotFoundError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError =
    error instanceof AppError
      ? error
      : new InternalError(error instanceof Error ? error.message : 'Unknown error');
  const message = appError.expose ? appError.message : 'Internal server error';
  const details = appError.expose ? appError.details : undefined;

  if (appError.statusCode >= 500) {
    logger.error({ requestId: req.requestId, error }, '[error] request failed');
  } else {
    logger.warn(
      {
        requestId: req.requestId,
        error: {
          code: appError.code,
          message: appError.message,
        },
      },
      '[error] request rejected',
    );
  }

  res.status(appError.statusCode).json({
    error: {
      code: appError.code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  });
};
