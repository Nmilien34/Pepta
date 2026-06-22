import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { verifySessionJwt } from './jwt';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    next(
      new AppError({
        code: 'AUTH_MISSING_TOKEN',
        message: 'Missing bearer token',
        statusCode: 401,
      }),
    );
    return;
  }

  const token = authorization.slice('Bearer '.length);
  const payload = verifySessionJwt(token);
  req.user = { id: payload.sub };
  next();
}
