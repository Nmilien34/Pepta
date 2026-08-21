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

// One key holding both facts — the window and whose it is. They must never be
// readable apart, or a half-restored state could admit the wrong account.
const STORAGE_KEY = "pepta.purchaseGrace";
export const PURCHASE_GRACE_MS = 30 * 60 * 1000;

let graceUntil = 0;
// WHOSE purchase this is. The grace used to be device-global and to survive
// sign-out, so the next account to sign in on a shared or handed-over device
// got the full premium shell for the rest of the window — and a relaunch could
// even resurrect a window that had been cleared.
let graceUserId: string | null = null;

// Best-effort rehydrate at module load; the in-memory value is the source of
// truth for the synchronous render-time check and only ever grows from disk.
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed = JSON.parse(raw) as { until?: unknown; userId?: unknown };
    const until = Number(parsed?.until);
    const owner = typeof parsed?.userId === "string" ? parsed.userId : null;
    if (Number.isFinite(until) && owner && until > graceUntil) {
      graceUntil = until;
      graceUserId = owner;
    }
  })
  .catch(() => undefined);

/** Call ONLY on an SDK-confirmed purchase or restore success. */
export function markPurchaseSuccess(
  userId: string,
  now: number = Date.now(),
): void {
  graceUntil = now + PURCHASE_GRACE_MS;
  graceUserId = userId;
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ until: graceUntil, userId }),
  ).catch(() => undefined);
}

/**
 * Synchronous, render-safe: is THIS user's confirmed purchase still outrunning
 * the webhook? A window belonging to someone else is not grace, it is a leak.
 */
export function hasPurchaseGrace(
  userId: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!userId || graceUserId !== userId) return false;
  return now < graceUntil;
}

/** The backend caught up (a real 'active' decision landed) — tidy up. */
export function clearPurchaseGrace(): void {
  graceUntil = 0;
  graceUserId = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}
