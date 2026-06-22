// Pure (de)serialization for the persisted auth session. No RN imports → the
// AsyncStorage I/O lives in AuthContext; this just validates the stored blob
// against the shared schema so a stale/corrupt value reads as "logged out"
// instead of crashing the app.

import { authResponseSchema, type AuthResponse } from '@pepta/shared';

// Versioned key — bump if the stored shape ever needs a hard reset.
export const AUTH_STORAGE_KEY = 'pepta.auth.v1';

export function serializeAuth(auth: AuthResponse): string {
  return JSON.stringify(auth);
}

export function parseStoredAuth(raw: string | null | undefined): AuthResponse | null {
  if (!raw) return null;
  try {
    const parsed = authResponseSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
