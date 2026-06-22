import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthError } from '../lib/errors';

export interface SessionPayload {
  sub: string;
}

export function issueSessionJwt(userId: string): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
  };

  return jwt.sign({ sub: userId }, env.jwt.secret, options);
}

export function verifySessionJwt(token: string): SessionPayload {
  try {
    const decoded = jwt.verify(token, env.jwt.secret, { algorithms: ['HS256'] });

    if (typeof decoded === 'string') {
      throw new AuthError('Invalid session token payload');
    }

    const payload = decoded as JwtPayload;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new AuthError('Invalid session token subject');
    }

    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError('Invalid or expired session token');
  }
}
