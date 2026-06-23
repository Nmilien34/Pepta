import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors';

export function validateBody<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      next(new ValidationError('Invalid request body', parsed.error.flatten()));
      return;
    }

    req.body = parsed.data as z.infer<TSchema>;
    next();
  };
}

export function validateQuery<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);

    if (!parsed.success) {
      next(new ValidationError('Invalid query parameters', parsed.error.flatten()));
      return;
    }

    // Express 5 exposes `req.query` as a read-only getter, so assigning to it
    // throws (`Cannot set property query ... only a getter`) and 500s the request.
    // Redefine the property with the validated/coerced value instead.
    Object.defineProperty(req, 'query', {
      value: parsed.data as Request['query'],
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}
