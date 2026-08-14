// Re-schedule the trial notifications from the code that is running NOW.
//
// WHY THIS EXISTS (2026-08-13): trial notifications are LOCAL. The copy is
// composed on the device and handed to iOS the instant the purchase succeeds,
// and iOS fires exactly that text days later. So a copy fix reaches only people
// who purchase AFTER they get it — everyone already mid-trial keeps receiving
// whatever their build wrote down. Ours wrote down a price and a route to
// cancel, 24h before the charge.
//
// This re-composes and re-schedules on launch, so anyone who opens the app even
// once before the notification fires silently gets the current copy instead.
// It fixes people already in flight, which no OTA can do on its own.
//
// THE DANGEROUS PART IS CANCELLING. scheduleTrialEndReminder clears the queue
// FIRST and only then decides whether it can schedule anything — correct for
// its original caller (a purchase, where customerInfo is fresh and
// authoritative), and wrong for a launch, where the RevenueCat lookup can fail
// or come back empty because the device is offline. Called blindly on every
// launch it would eventually cancel a good reminder and put nothing back,
// leaving the user with NO warning at all — strictly worse than the wrong copy.
//
// So the guard lives here: we only hand over customerInfo we actually trust,
// carrying an active entitlement with a real future expiry. Anything else —
// no answer, no entitlement, already expired, not a trial — and we do nothing
// whatsoever, leaving whatever is queued alone.
//
// Pure decision + one call out; the RevenueCat and notification work is
// injected so this is testable without either SDK.

import { REVENUECAT_ENTITLEMENT_ID } from './revenueCat';
import { isTrialPeriod, type TrialCustomerInfo } from './trialReminder.service';

export type TrialRefreshOutcome =
  | 'rescheduled'
  | 'no-customer-info'
  | 'not-in-trial'
  | 'already-expired'
  | 'failed';

export interface TrialRefreshDeps {
  getCustomerInfo(): Promise<TrialCustomerInfo | null>;
  scheduleTrialEndReminder(
    customerInfo: TrialCustomerInfo,
    entitlementId: string,
  ): Promise<unknown>;
  now?: Date;
}

/**
 * True only for customerInfo we are willing to let cancel a live notification:
 * the entitlement is present, it is a trial, and it expires in the future.
 */
export function isRefreshable(
  customerInfo: TrialCustomerInfo | null,
  entitlementId: string,
  now: Date,
): { ok: true } | { ok: false; outcome: TrialRefreshOutcome } {
  if (!customerInfo) return { ok: false, outcome: 'no-customer-info' };

  const entitlement = customerInfo.entitlements?.active?.[entitlementId];
  if (!entitlement) return { ok: false, outcome: 'not-in-trial' };

  // Reuses the app's ONE definition of "is a trial" rather than adding a
  // second. Anything else is a paying subscriber, who has no trial-ending
  // notification to correct.
  if (!isTrialPeriod(entitlement.periodType)) {
    return { ok: false, outcome: 'not-in-trial' };
  }

  const expiration = entitlement.expirationDate;
  if (!expiration) return { ok: false, outcome: 'not-in-trial' };
  const expiresAt = new Date(expiration).getTime();
  if (Number.isNaN(expiresAt)) return { ok: false, outcome: 'no-customer-info' };
  // Past expiry there is nothing left to warn about, and rescheduling would
  // only risk cancelling something for a user whose state we have wrong.
  if (expiresAt <= now.getTime()) return { ok: false, outcome: 'already-expired' };

  return { ok: true };
}

export async function refreshTrialReminders({
  getCustomerInfo,
  scheduleTrialEndReminder,
  now = new Date(),
}: TrialRefreshDeps): Promise<TrialRefreshOutcome> {
  let customerInfo: TrialCustomerInfo | null = null;
  try {
    customerInfo = await getCustomerInfo();
  } catch {
    return 'no-customer-info';
  }

  const verdict = isRefreshable(customerInfo, REVENUECAT_ENTITLEMENT_ID, now);
  if (!verdict.ok) return verdict.outcome;

  try {
    await scheduleTrialEndReminder(customerInfo!, REVENUECAT_ENTITLEMENT_ID);
    return 'rescheduled';
  } catch {
    // scheduleTrialEndReminder swallows its own cancel failures; if the
    // schedule itself threw, the queue may now be empty. Nothing safe is left
    // to do from here — the next launch tries again.
    return 'failed';
  }
}
