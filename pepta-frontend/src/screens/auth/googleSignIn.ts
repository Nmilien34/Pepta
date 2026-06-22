// Pure, testable orchestrator for Google sign-in. Native deps injected; no React
// Native imports, so it unit-tests in plain Node.

import type { User } from '@pepta/shared';

// @react-native-google-signin returns `{ type, data: { idToken } }` on v13+ and
// `{ idToken }` on older versions — support both shapes. On v13+ a user
// dismissing the sheet resolves with `{ type: 'cancelled' }` rather than throwing.
export interface GoogleSignInResult {
  type?: string;
  idToken?: string | null;
  data?: { idToken?: string | null } | null;
}

export type GoogleSignInOutcome = 'signed_in' | 'cancelled';

export function extractGoogleIdToken(result: GoogleSignInResult | null | undefined): string {
  const idToken = result?.data?.idToken ?? result?.idToken ?? null;
  if (!idToken) {
    throw new Error('Google did not return an ID token.');
  }
  return idToken;
}

// Codes the library uses when the user dismisses the flow.
const GOOGLE_CANCEL_CODES = new Set(['SIGN_IN_CANCELLED', 'CANCELED', '-5', '12501']);

export function isGoogleSignInCancelled(error: unknown): boolean {
  const code = (error as { code?: string | number } | null)?.code;
  return code != null && GOOGLE_CANCEL_CODES.has(String(code));
}

export interface GoogleSignInDeps {
  hasPlayServices?(): Promise<boolean>;
  signIn(): Promise<GoogleSignInResult>;
  signInWithGoogle(idToken: string): Promise<User>;
}

export async function runGoogleSignIn(deps: GoogleSignInDeps): Promise<GoogleSignInOutcome> {
  try {
    if (deps.hasPlayServices) await deps.hasPlayServices();
    const result = await deps.signIn();
    if (result?.type === 'cancelled') return 'cancelled';
    await deps.signInWithGoogle(extractGoogleIdToken(result));
    return 'signed_in';
  } catch (error) {
    if (isGoogleSignInCancelled(error)) return 'cancelled';
    throw error;
  }
}
