import { describe, expect, it, vi } from 'vitest';
import type { AppleAuth, User } from '@pepta/shared';
import {
  buildAppleAuthBody,
  isAppleSignInCancelled,
  mapAppleFullName,
  runAppleSignIn,
  shouldRenderAppleSignIn,
} from './appleSignIn';

const fakeUser = { id: 'u_1' } as unknown as User;

describe('shouldRenderAppleSignIn', () => {
  it('only offers Apple on iOS', () => {
    expect(shouldRenderAppleSignIn('ios')).toBe(true);
    expect(shouldRenderAppleSignIn('android')).toBe(false);
    expect(shouldRenderAppleSignIn('web')).toBe(false);
  });
});

describe('mapAppleFullName', () => {
  it('trims and keeps provided name parts', () => {
    expect(mapAppleFullName({ givenName: ' Ada ', familyName: 'Lovelace' })).toEqual({
      givenName: 'Ada',
      familyName: 'Lovelace',
    });
  });

  it('returns undefined when nothing usable is present', () => {
    expect(mapAppleFullName(null)).toBeUndefined();
    expect(mapAppleFullName({ givenName: '   ', familyName: undefined })).toBeUndefined();
  });
});

describe('buildAppleAuthBody', () => {
  it('builds a body with a token and optional name', () => {
    const body: AppleAuth = buildAppleAuthBody({
      identityToken: 'tok',
      fullName: { givenName: 'Ada' },
    });
    expect(body).toEqual({ identityToken: 'tok', fullName: { givenName: 'Ada' } });
  });

  it('omits fullName when absent', () => {
    expect(buildAppleAuthBody({ identityToken: 'tok', fullName: null })).toEqual({
      identityToken: 'tok',
    });
  });

  it('throws when there is no identity token', () => {
    expect(() => buildAppleAuthBody({ identityToken: null })).toThrow(/identity token/i);
  });
});

describe('isAppleSignInCancelled', () => {
  it('detects cancellation codes', () => {
    expect(isAppleSignInCancelled({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
    expect(isAppleSignInCancelled({ code: 1001 })).toBe(true);
    expect(isAppleSignInCancelled({ code: 'ERR_NETWORK' })).toBe(false);
    expect(isAppleSignInCancelled(new Error('boom'))).toBe(false);
  });
});

describe('runAppleSignIn', () => {
  it('signs in with the mapped credential on success', async () => {
    const signInWithApple = vi.fn(async () => fakeUser);
    const outcome = await runAppleSignIn({
      requestCredential: async () => ({ identityToken: 'tok', fullName: { givenName: 'Ada' } }),
      signInWithApple,
    });
    expect(outcome).toBe('signed_in');
    expect(signInWithApple).toHaveBeenCalledWith({ identityToken: 'tok', fullName: { givenName: 'Ada' } });
  });

  it('returns cancelled without calling the context when the user backs out', async () => {
    const signInWithApple = vi.fn(async () => fakeUser);
    const outcome = await runAppleSignIn({
      requestCredential: async () => {
        throw { code: 'ERR_REQUEST_CANCELED' };
      },
      signInWithApple,
    });
    expect(outcome).toBe('cancelled');
    expect(signInWithApple).not.toHaveBeenCalled();
  });

  it('re-throws real errors', async () => {
    await expect(
      runAppleSignIn({
        requestCredential: async () => {
          throw new Error('network down');
        },
        signInWithApple: async () => fakeUser,
      }),
    ).rejects.toThrow(/network down/);
  });
});
