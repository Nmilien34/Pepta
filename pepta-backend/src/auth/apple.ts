import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env';
import { AppError, AuthError } from '../lib/errors';
import type { ProviderIdentity } from './google';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = new URL('https://appleid.apple.com/auth/keys');

const appleJwks = createRemoteJWKSet(APPLE_KEYS_URL, {
  timeoutDuration: 5000,
});

function optionalString(payload: JWTPayload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function emailVerified(payload: JWTPayload): boolean {
  return payload.email_verified === true || payload.email_verified === 'true';
}

export function isAppleSignInAvailable(): boolean {
  return env.apple !== null;
}

export function appleSignInUnavailableError(): AppError {
  return new AppError({
    code: 'APPLE_SIGN_IN_NOT_AVAILABLE',
    message: 'Apple Sign-In is not currently available.',
    statusCode: 503,
  });
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<ProviderIdentity> {
  if (!env.apple) {
    throw appleSignInUnavailableError();
  }

  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: env.apple.clientId,
    });

    if (!payload.sub) {
      throw new AuthError('Apple identity token is missing a subject');
    }

    return {
      provider: 'apple',
      providerUserId: payload.sub,
      email: optionalString(payload, 'email'),
      emailVerified: emailVerified(payload),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AuthError('Apple sign-in could not be verified');
  }
}
