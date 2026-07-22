// Access-decision state for the whole app. Owns resolution lifecycle:
// after auth, on boot from a bounded persisted cache, on foreground when the
// last online verification is ≥5 minutes old, and at known expiration.
// The gate never routes to a paywall unless the backend POSITIVELY resolved
// inactive — resolution failure degrades to temporarily_unavailable, honoring
// cached access only until its bound (design doc "Offline and Foreground").

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccessDecision } from "@pepta/shared";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "pepta.accessDecision.v1";
const FOREGROUND_REFRESH_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_000_000;

interface AccessContextValue {
  /** Null until the first resolution (or bounded cache load) completes. */
  decision: AccessDecision | null;
  resolving: boolean;
  resolve(): Promise<void>;
}

const AccessContext = createContext<AccessContextValue | undefined>(undefined);

function boundFor(decision: AccessDecision): number | null {
  if (decision.state === "active") {
    return decision.expiresAt ? new Date(decision.expiresAt).getTime() : null;
  }
  if (decision.state === "temporarily_unavailable" && decision.cachedAccess) {
    return new Date(decision.cachedAccess.validUntil).getTime();
  }
  return 0; // non-access states never authorize the shell from cache
}

/** A cached decision may open the shell only within its known bound. */
export function isCachedDecisionUsable(
  decision: AccessDecision,
  now: number = Date.now(),
): boolean {
  const bound = boundFor(decision);
  return bound === null || bound > now;
}

/** Degrade the last known ACTIVE decision into unavailable+cached. */
export function degradeToUnavailable(
  previous: AccessDecision | null,
  now: number = Date.now(),
): AccessDecision {
  if (
    previous &&
    previous.state === "active" &&
    isCachedDecisionUsable(previous, now)
  ) {
    return {
      state: "temporarily_unavailable",
      retryAfterMs: 5_000,
      cachedAccess: {
        source: previous.source,
        sources: previous.sources,
        // Promotional access is honored offline only to its exact expiry;
        // an open-ended (renewing) source keeps a short client bound and
        // relies on the next successful resolve.
        validUntil:
          previous.expiresAt ??
          new Date(now + FOREGROUND_REFRESH_MS).toISOString(),
        willRenew: previous.willRenew,
        lastVerifiedAt: previous.lastVerifiedAt,
      },
    };
  }
  return { state: "temporarily_unavailable", retryAfterMs: 5_000 };
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [resolving, setResolving] = useState(false);
  const lastResolvedAt = useRef(0);
  const lastActive = useRef<AccessDecision | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const resolve = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setResolving(true);
      try {
        const next = await api.resolveAccess();
        lastResolvedAt.current = Date.now();
        setDecision(next);
        if (next.state === "active") {
          lastActive.current = next;
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
            () => undefined,
          );
        } else if (next.state === "inactive") {
          lastActive.current = null;
          AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
        }
      } catch {
        setDecision(degradeToUnavailable(lastActive.current));
      } finally {
        setResolving(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  // Boot: load the bounded cache so a healthy returning user renders the
  // shell instantly, then verify online. Signed-out clears everything.
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setDecision(null);
      lastActive.current = null;
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const cached = JSON.parse(raw) as AccessDecision;
        if (cached.state === "active" && isCachedDecisionUsable(cached)) {
          lastActive.current = cached;
          setDecision((current) => current ?? cached);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) void resolve();
      });
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, resolve]);

  // Foreground refresh once the last online verification is ≥5 minutes old.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state === "active" &&
        Date.now() - lastResolvedAt.current >= FOREGROUND_REFRESH_MS
      ) {
        void resolve();
      }
    });
    return () => subscription.remove();
  }, [auth.isAuthenticated, resolve]);

  // Known-expiration timer: flip to a fresh resolution the moment access ends.
  useEffect(() => {
    if (!decision) return;
    const bound = boundFor(decision);
    if (bound === null || bound === 0) return;
    const delay = Math.min(Math.max(bound - Date.now(), 0) + 250, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => void resolve(), delay);
    return () => clearTimeout(timer);
  }, [decision, resolve]);

  const value = useMemo(
    () => ({ decision, resolving, resolve }),
    [decision, resolving, resolve],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccess must be used within AccessProvider");
  return context;
}
