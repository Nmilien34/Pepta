// Pure, testable orchestrator for Apple sign-in (Leanient's `appleSignIn.ts`
// pattern). All native + context dependencies are injected, so this file imports
// no React Native modules and can be unit-tested in plain Node.

import type { AppleAuth, User } from '@pepta/shared';

// The subset of an Apple credential we care about (shape of
// AppleAuthentication.signInAsync's result).
export interface AppleCredential {
  identityToken: string | null;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
}

export type AppleSignInOutcome = 'signed_in' | 'cancelled';

// Apple is only offered on iOS.
export function shouldRenderAppleSignIn(platform: string): boolean {
  return platform === 'ios';
}

// Apple returns the user's name only on the FIRST authorization. Normalize +
// drop empties so we never send blank strings to the backend.
export function mapAppleFullName(
  fullName: AppleCredential['fullName'],
): AppleAuth['fullName'] | undefined {
  if (!fullName) return undefined;
  const givenName = fullName.givenName?.trim();
  const familyName = fullName.familyName?.trim();
  if (!givenName && !familyName) return undefined;
  return {
    ...(givenName ? { givenName } : {}),
    ...(familyName ? { familyName } : {}),
  };
}

export function buildAppleAuthBody(credential: AppleCredential): AppleAuth {
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }
  const fullName = mapAppleFullName(credential.fullName);
  return {
    identityToken: credential.identityToken,
    ...(fullName ? { fullName } : {}),
  };
}

// Codes Apple/Expo use when the user backs out of the native sheet.
const APPLE_CANCEL_CODES = new Set(['ERR_REQUEST_CANCELED', 'ERR_CANCELED', '1001']);

export function isAppleSignInCancelled(error: unknown): boolean {
  const code = (error as { code?: string | number } | null)?.code;
  return code != null && APPLE_CANCEL_CODES.has(String(code));
}

export interface AppleSignInDeps {
  requestCredential(): Promise<AppleCredential>;
  signInWithApple(body: AppleAuth): Promise<User>;
}

// Returns 'cancelled' when the user dismisses the sheet; re-throws real errors
// (network, invalid token) for the screen to surface inline.
export async function runAppleSignIn(deps: AppleSignInDeps): Promise<AppleSignInOutcome> {
  let credential: AppleCredential;
  try {
    credential = await deps.requestCredential();
  } catch (error) {
    if (isAppleSignInCancelled(error)) return 'cancelled';
    throw error;
  }
  await deps.signInWithApple(buildAppleAuthBody(credential));
  return 'signed_in';
}
