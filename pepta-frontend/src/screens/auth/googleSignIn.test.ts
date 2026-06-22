import { describe, expect, it, vi } from 'vitest';
import type { User } from '@pepta/shared';
import {
  extractGoogleIdToken,
  isGoogleSignInCancelled,
  runGoogleSignIn,
} from './googleSignIn';

const fakeUser = { id: 'u_1' } as unknown as User;

describe('extractGoogleIdToken', () => {
  it('reads the v13+ nested shape', () => {
    expect(extractGoogleIdToken({ data: { idToken: 'abc' } })).toBe('abc');
  });

  it('reads the legacy flat shape', () => {
    expect(extractGoogleIdToken({ idToken: 'xyz' })).toBe('xyz');
  });

  it('throws when no token is present', () => {
    expect(() => extractGoogleIdToken({ data: { idToken: null } })).toThrow(/ID token/i);
    expect(() => extractGoogleIdToken(null)).toThrow(/ID token/i);
  });
});

describe('isGoogleSignInCancelled', () => {
  it('detects cancellation codes', () => {
    expect(isGoogleSignInCancelled({ code: 'SIGN_IN_CANCELLED' })).toBe(true);
    expect(isGoogleSignInCancelled({ code: 12501 })).toBe(true);
    expect(isGoogleSignInCancelled({ code: 'DEVELOPER_ERROR' })).toBe(false);
  });
});

describe('runGoogleSignIn', () => {
  it('checks play services, signs in, and forwards the token', async () => {
    const calls: string[] = [];
    const signInWithGoogle = vi.fn(async () => fakeUser);
    const outcome = await runGoogleSignIn({
      hasPlayServices: async () => {
        calls.push('play');
        return true;
      },
      signIn: async () => {
        calls.push('signIn');
        return { data: { idToken: 'tok' } };
      },
      signInWithGoogle,
    });
    expect(outcome).toBe('signed_in');
    expect(calls).toEqual(['play', 'signIn']);
    expect(signInWithGoogle).toHaveBeenCalledWith('tok');
  });

  it('returns cancelled when the library throws a cancel code', async () => {
    const signInWithGoogle = vi.fn(async () => fakeUser);
    const outcome = await runGoogleSignIn({
      signIn: async () => {
        throw { code: 'SIGN_IN_CANCELLED' };
      },
      signInWithGoogle,
    });
    expect(outcome).toBe('cancelled');
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it('returns cancelled when the v13+ result is a cancelled response', async () => {
    const signInWithGoogle = vi.fn(async () => fakeUser);
    const outcome = await runGoogleSignIn({
      signIn: async () => ({ type: 'cancelled', data: null }),
      signInWithGoogle,
    });
    expect(outcome).toBe('cancelled');
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it('re-throws real errors', async () => {
    await expect(
      runGoogleSignIn({
        signIn: async () => ({ data: { idToken: 'tok' } }),
        signInWithGoogle: async () => {
          throw new Error('backend offline');
        },
      }),
    ).rejects.toThrow(/backend offline/);
  });
});
