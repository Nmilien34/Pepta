import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppleAuth, AuthResponse, User } from '@pepta/shared';
import { api } from '../services/api';
import { AUTH_STORAGE_KEY, parseStoredAuth, serializeAuth } from './authPersistence';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle(idToken: string): Promise<User>;
  signInWithApple(body: AppleAuth): Promise<User>;
  // Dev-only local session so the flow is traversable without the (deferred)
  // backend. Remove once real auth works end-to-end.
  devSignIn(): void;
  // Optimistically flip the local user to onboarding-complete (used after the
  // onboarding submit attempt). When the backend lands this is the optimistic
  // half; the server response confirms it.
  markOnboardingComplete(): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Persist (or clear) the session blob. Fire-and-forget — a storage hiccup must
// never block the UI; the in-memory state stays the source of truth this session.
function persistAuth(next: AuthResponse | null): void {
  if (next) {
    AsyncStorage.setItem(AUTH_STORAGE_KEY, serializeAuth(next)).catch(() => undefined);
  } else {
    AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => undefined);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate the saved session on launch (App.tsx shows a blank splash while
  // isLoading). A stale/corrupt blob parses to null → starts at sign-in.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then(parseStoredAuth)
      .then((stored) => {
        if (active && stored) {
          setAuth(stored);
          api.setAuthToken(stored.token);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const finalizeAuth = useCallback((response: AuthResponse): User => {
    setAuth(response);
    api.setAuthToken(response.token);
    persistAuth(response);
    return response.user;
  }, []);

  const signInWithGoogle = useCallback(
    async (idToken: string): Promise<User> => finalizeAuth(await api.signInWithGoogle({ idToken })),
    [finalizeAuth],
  );

  const signInWithApple = useCallback(
    async (body: AppleAuth): Promise<User> => finalizeAuth(await api.signInWithApple(body)),
    [finalizeAuth],
  );

  const devSignIn = useCallback(() => {
    const now = new Date().toISOString();
    finalizeAuth({
      token: 'dev-token',
      user: {
        id: 'dev-user',
        emailVerified: false,
        authProviders: [],
        entitlement: { status: 'free', expiresAt: null, willRenew: false },
        onboardingComplete: false,
        createdAt: now,
        updatedAt: now,
      },
    });
  }, [finalizeAuth]);

  const markOnboardingComplete = useCallback(() => {
    setAuth((current) => {
      if (!current) return current;
      const next: AuthResponse = {
        ...current,
        user: { ...current.user, onboardingComplete: true, onboardingCompletedAt: new Date().toISOString() },
      };
      persistAuth(next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    api.setAuthToken(null);
    persistAuth(null);
  }, []);

  // A 401 from any API call means the session is dead — sign the UI out so we
  // don't loop on a stale token (mirrors Leanient's unauthorized interceptor).
  useEffect(() => {
    api.setUnauthorizedHandler(() => logout());
    return () => api.setUnauthorizedHandler(undefined);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      isLoading,
      isAuthenticated: Boolean(auth),
      signInWithGoogle,
      signInWithApple,
      devSignIn,
      markOnboardingComplete,
      logout,
    }),
    [auth, isLoading, logout, signInWithApple, signInWithGoogle, devSignIn, markOnboardingComplete],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return value;
}
