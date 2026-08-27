import { Platform } from "react-native";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppleAuth, AuthResponse, User } from "@pepta/shared";
import { api } from "../services/api";
import { clearPurchaseGrace } from "../services/purchaseGrace";
import { clearSnapshot } from "../services/peptaSnapshotStore";
import { appsFlyer } from "../services/appsflyer";
import { identify as posthogIdentify, reset as posthogReset } from "../services/posthog";
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
    // AppsFlyer is the funnel-analytics backbone — an init failure must be
    // loud in EVERY build (a silent one means silently missing funnel data),
    // while the app itself degrades gracefully.
    console.error("[AppsFlyer] init failed:", error);
    return false;
  });
}

/**
 * PostHog identity. Backend user id only, plus the two non-sensitive
 * properties this app already attaches elsewhere.
 *
 * DELIBERATELY NOT the email/displayName that ride along to RevenueCat below:
 * those exist so a paying customer is findable in the RC dashboard, which is a
 * billing need. PostHog is product analytics on a HEALTH app, and a person
 * profile there must not carry PII or anything clinical.
 */
function identifyPostHogUser(userId: string): void {
  posthogIdentify(userId, { platform: Platform.OS });
}

async function identifyRevenueCatUser(user: {
  id: string;
  email?: string;
  displayName?: string;
}): Promise<void> {
  // Email + display name ride along as RC subscriber attributes so a customer
  // record is findable by email in the dashboard instead of via a Mongo
  // ObjectId lookup. identify() applies them best-effort.
  await revenueCat
    .identify(user.id, { email: user.email, displayName: user.displayName })
    .catch((error) => {
      warnInDev("[RevenueCat] Could not identify user.", error);
    });

  // Tell the server which RevenueCat customer this device is. That is the
  // evidence the backend needs to reconcile a purchase whose webhook was lost
  // — without it a first-time subscriber has no customer id, no sources and a
  // 'free' status, so nothing ever looks their real state up.
  //
  // Deliberately NOT a silent catch: this failing is why a paying user could
  // stay behind the paywall, so it is logged rather than swallowed. It must
  // not block sign-in, hence the catch at all.
  const appUserId = revenueCat.currentAppUserId();
  if (appUserId) {
    await api.linkRevenueCatAppUserId(appUserId).catch((error: unknown) => {
      console.warn("[access] Could not link the RevenueCat customer id.", error);
    });
  }
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

/**
 * Analytics and billing identification are BEST EFFORT. They must never decide
 * whether somebody is signed in.
 *
 * They used to. `finalizeAuth` set the token, wrote the session to storage,
 * and then awaited AppsFlyer init, the registration event and the RevenueCat
 * identify BEFORE calling setAuth. Anything that rejected or simply never
 * settled in that stretch left the user authenticated on disk and signed OUT
 * in memory — the sign-in screen showing "We couldn't sign you in", while the
 * next cold launch restored the session and let them straight in. That is a
 * confusing failure on the single highest-stakes screen in the app, and the
 * only thing standing between it and every new user was three third-party
 * helpers each remembering to catch.
 *
 * The launch path had the same shape, and worse odds: it awaited two of the
 * same SDKs before setAuth, so a rejection there dropped somebody with a
 * perfectly good stored session back to sign-in.
 *
 * This runs the same work in the same order, but nothing it does can prevent
 * the caller from continuing: failures are logged, and a stall is capped so a
 * hung SDK cannot hold the session hostage either.
 */
const SIGN_IN_SIDE_EFFECT_BUDGET_MS = 8_000;

async function runSignInSideEffects(work: () => Promise<void>): Promise<void> {
  let release: (() => void) | undefined;
  const budget = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(
        "[auth] Sign-in side effects exceeded their budget; continuing without them.",
      );
      resolve();
    }, SIGN_IN_SIDE_EFFECT_BUDGET_MS);
    release = () => {
      clearTimeout(timer);
      resolve();
    };
  });

  await Promise.race([
    work()
      // Deliberately not silent: a swallowed failure here is missing funnel
      // data or an unidentified RevenueCat customer, both of which matter.
      .catch((error: unknown) => {
        console.warn("[auth] A sign-in side effect failed.", error);
      })
      .finally(() => release?.()),
    budget,
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Who is signed in RIGHT NOW, readable from callbacks that must not close
  // over a stale render. logout() needs the id to purge that user's snapshot,
  // and doing it inside a setAuth updater would run twice under StrictMode.
  const authRef = useRef<AuthResponse | null>(null);
  authRef.current = auth;

  // Hydrate the saved session on launch (App.tsx shows a blank splash while
  // isLoading). A stale/corrupt blob parses to null → starts at sign-in.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(AUTH_STORAGE_KEY)
      .then(parseStoredAuth)
      .then(async (stored) => {
        if (active && stored) {
          api.setAuthToken(stored.token);
          // A stored session is proof enough. Neither SDK gets to send an
          // already-signed-in user back to the sign-in screen.
          await runSignInSideEffects(async () => {
            await initializeAppsFlyerForUser(stored.user.id);
            identifyPostHogUser(stored.user.id);
            await identifyRevenueCatUser(stored.user);
          });
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
    // Same work, same order — but it can no longer decide whether the sign-in
    // happened. The server has authenticated this person; setAuth follows.
    await runSignInSideEffects(async () => {
      await initializeAppsFlyerForUser(response.user.id);
      await logCompleteRegistrationIfNeeded(response, method);
      identifyPostHogUser(response.user.id);
      await identifyRevenueCatUser(response.user);
    });
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
    // The post-purchase window belongs to the account that bought, not to the
    // device. Leaving it behind handed the next account the premium shell.
    clearPurchaseGrace();
    // The offline snapshot holds this user's medications, doses, weights, side
    // effects and schedules in plaintext AsyncStorage. It is keyed per user so
    // the next account cannot READ it, but leaving it on a shared, resold or
    // lost device is a data-at-rest problem regardless of who is signed in.
    // Signing out is the moment to drop it.
    const signedOutUserId = authRef.current?.user?.id;
    if (signedOutUserId) {
      void clearSnapshot(signedOutUserId).catch((error) => {
        console.warn("[auth] Could not clear the offline snapshot.", error);
      });
    }
    // Drop the PostHog identity with the rest of the session. Account
    // DELETION routes through here too (AccountDetailsScreen calls logout
    // after api.deleteAccount), so both paths are covered by this one line —
    // the same reason the snapshot purge lives here. Without it the next
    // person to sign in on a shared or resold handset continues the previous
    // user's PostHog person and session recording.
    posthogReset();
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
