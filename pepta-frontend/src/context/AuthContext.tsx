import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppleAuth, AuthResponse, User } from "@pepta/shared";
import { api } from "../services/api";
import { appsFlyer } from "../services/appsflyer";
import { revenueCat } from "../services/revenueCat";
import {
  AUTH_STORAGE_KEY,
  parseStoredAuth,
  serializeAuth,
} from "./authPersistence";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle(idToken: string): Promise<User>;
  signInWithApple(body: AppleAuth): Promise<User>;
  signInWithDemo(email: string, password: string): Promise<User>;
  // Dev-only local session so the flow is traversable without the (deferred)
  // backend. Remove once real auth works end-to-end.
  devSignIn(): void;
  // Optimistically flip the local user to onboarding-complete (used after the
  // onboarding submit attempt). When the backend lands this is the optimistic
  // half; the server response confirms it.
  markOnboardingComplete(): void;
  updateCachedUser(user: User): void;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthMethod = "apple" | "demo" | "google";

// Persist (or clear) the session blob. Fire-and-forget — a storage hiccup must
// never block the UI; the in-memory state stays the source of truth this session.
function persistAuth(next: AuthResponse | null): void {
  if (next) {
    AsyncStorage.setItem(AUTH_STORAGE_KEY, serializeAuth(next)).catch(
      () => undefined,
    );
  } else {
    AsyncStorage.removeItem(AUTH_STORAGE_KEY).catch(() => undefined);
  }
}

function isDevRuntime(): boolean {
  return typeof __DEV__ !== "undefined" ? __DEV__ : false;
}

function warnInDev(message: string, error?: unknown): void {
  if (!isDevRuntime()) return;
  if (error) {
    console.warn(message, error);
    return;
  }
  console.warn(message);
}

async function initializeAppsFlyerForUser(
  userId?: string,
): Promise<boolean> {
  return appsFlyer.initialize(userId).catch((error) => {
    warnInDev("[AppsFlyer] Could not initialize attribution.", error);
    return false;
  });
}

async function identifyRevenueCatUser(userId: string): Promise<void> {
  await revenueCat.identify(userId).catch((error) => {
    warnInDev("[RevenueCat] Could not identify user.", error);
  });
}

async function logCompleteRegistrationIfNeeded(
  response: AuthResponse,
  method: AuthMethod,
): Promise<void> {
  if (response.isNewUser === true) {
    await appsFlyer.logCompleteRegistration({ method }).catch((error) => {
      warnInDev(`[AppsFlyer] Failed to log af_complete_registration for ${method}.`, error);
    });
    return;
  }

  if (response.isNewUser === undefined) {
    warnInDev(
      `[AppsFlyer] Auth response for ${method} is missing isNewUser; skipping af_complete_registration.`,
    );
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
      .then(async (stored) => {
        if (active && stored) {
          api.setAuthToken(stored.token);
          await initializeAppsFlyerForUser(stored.user.id);
          await identifyRevenueCatUser(stored.user.id);
          if (active) setAuth(stored);
          return;
        }
        await initializeAppsFlyerForUser();
        await revenueCat.configure().catch((error) => {
          warnInDev("[RevenueCat] Could not configure anonymous customer.", error);
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const finalizeAuth = useCallback(async (response: AuthResponse, method: AuthMethod): Promise<User> => {
    api.setAuthToken(response.token);
    persistAuth(response);
    await initializeAppsFlyerForUser(response.user.id);
    await logCompleteRegistrationIfNeeded(response, method);
    await identifyRevenueCatUser(response.user.id);
    setAuth(response);
    return response.user;
  }, []);

  const signInWithGoogle = useCallback(
    async (idToken: string): Promise<User> =>
      finalizeAuth(await api.signInWithGoogle({ idToken }), "google"),
    [finalizeAuth],
  );

  const signInWithApple = useCallback(
    async (body: AppleAuth): Promise<User> =>
      finalizeAuth(await api.signInWithApple(body), "apple"),
    [finalizeAuth],
  );

  // App Store review demo login — scoped server-side to the seeded demo account.
  const signInWithDemo = useCallback(
    async (email: string, password: string): Promise<User> =>
      finalizeAuth(await api.signInWithDemo(email, password), "demo"),
    [finalizeAuth],
  );

  const devSignIn = useCallback(() => {
    const now = new Date().toISOString();
    void finalizeAuth({
      token: "dev-token",
      user: {
        id: "dev-user",
        emailVerified: false,
        hasAvatar: false,
        authProviders: [],
        entitlement: { status: "free", expiresAt: null, willRenew: false },
        onboardingComplete: false,
        createdAt: now,
        updatedAt: now,
      },
    }, "demo");
  }, [finalizeAuth]);

  const markOnboardingComplete = useCallback(() => {
    setAuth((current) => {
      if (!current) return current;
      const next: AuthResponse = {
        ...current,
        user: {
          ...current.user,
          onboardingComplete: true,
          onboardingCompletedAt: new Date().toISOString(),
        },
      };
      persistAuth(next);
      return next;
    });
  }, []);

  const updateCachedUser = useCallback((user: User) => {
    setAuth((current) => {
      if (!current) return current;
      const next: AuthResponse = { ...current, user };
      persistAuth(next);
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    void revenueCat.reset().catch((error) => {
      warnInDev("[RevenueCat] Could not log out.", error);
    });
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
      signInWithDemo,
      devSignIn,
      markOnboardingComplete,
      updateCachedUser,
      logout,
    }),
    [
      auth,
      isLoading,
      logout,
      signInWithApple,
      signInWithDemo,
      signInWithGoogle,
      devSignIn,
      markOnboardingComplete,
      updateCachedUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
