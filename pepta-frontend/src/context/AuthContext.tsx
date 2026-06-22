import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppleAuth, AuthResponse, User } from '@pepta/shared';
import { api } from '../services/api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle(idToken: string): Promise<User>;
  signInWithApple(body: AppleAuth): Promise<User>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [isLoading] = useState(false);

  const finalizeAuth = useCallback((response: AuthResponse): User => {
    setAuth(response);
    api.setAuthToken(response.token);
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

  const logout = useCallback(() => {
    setAuth(null);
    api.setAuthToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      isLoading,
      isAuthenticated: Boolean(auth),
      signInWithGoogle,
      signInWithApple,
      logout,
    }),
    [auth, isLoading, logout, signInWithApple, signInWithGoogle],
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
