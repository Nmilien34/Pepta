import { describe, expect, it } from 'vitest';
import type { AuthResponse } from '@pepta/shared';
import { parseStoredAuth, serializeAuth } from './authPersistence';

const auth: AuthResponse = {
  token: 'tok_123',
  user: {
    id: 'u1',
    emailVerified: true,
    authProviders: [],
    entitlement: { status: 'free', expiresAt: null, willRenew: false },
    onboardingComplete: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
} as AuthResponse;

describe('parseStoredAuth', () => {
  it('round-trips a valid session', () => {
    expect(parseStoredAuth(serializeAuth(auth))).toEqual(auth);
  });

  it('returns null for empty / malformed / schema-invalid input', () => {
    expect(parseStoredAuth(null)).toBeNull();
    expect(parseStoredAuth('')).toBeNull();
    expect(parseStoredAuth('{not json')).toBeNull();
    expect(parseStoredAuth(JSON.stringify({ token: 'x' }))).toBeNull(); // missing user
    expect(parseStoredAuth(JSON.stringify({ token: 'x', user: { id: 'u' } }))).toBeNull(); // incomplete user
  });
});
