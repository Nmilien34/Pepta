// Post-purchase grace for the access gate. StoreKit/RevenueCat just CONFIRMED
// a purchase (or restore) on this device, but the backend only learns about it
// from the RevenueCat webhook, which trails the SDK by seconds to minutes —
// and resolveAccess is deliberately evidence-gated, so until the webhook lands
// it answers 'inactive'. Without this window, AccessGate bounced a JUST-PAID
// user straight back onto the paywall the moment onboarding completed (the
// welcomeIn "Leave a rating" bug, 2026-08-05). The grace is bounded: if the
// backend still says inactive once it expires, the gate closes again and
// Restore is the honest path. Persisted so an app relaunch during the race
// cannot re-lock a paying user.

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pepta.purchaseGraceUntil";
export const PURCHASE_GRACE_MS = 30 * 60 * 1000;

let graceUntil = 0;

// Best-effort rehydrate at module load; the in-memory value is the source of
// truth for the synchronous render-time check and only ever grows from disk.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    const stored = Number(raw);
    if (Number.isFinite(stored)) graceUntil = Math.max(graceUntil, stored);
  })
  .catch(() => undefined);

/** Call ONLY on an SDK-confirmed purchase or restore success. */
export function markPurchaseSuccess(now: number = Date.now()): void {
  graceUntil = now + PURCHASE_GRACE_MS;
  AsyncStorage.setItem(STORAGE_KEY, String(graceUntil)).catch(() => undefined);
}

/** Synchronous, render-safe: is a confirmed purchase still outrunning the webhook? */
export function hasPurchaseGrace(now: number = Date.now()): boolean {
  return now < graceUntil;
}

/** The backend caught up (a real 'active' decision landed) — tidy up. */
export function clearPurchaseGrace(): void {
  graceUntil = 0;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}
