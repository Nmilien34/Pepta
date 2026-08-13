// The day-2 touchpoint of a free trial.
//
// WHAT THIS IS NOT, as of 2026-08-12: it is no longer a price warning. The old
// copy named the renewal price and pointed at Settings to cancel, which read as
// a cancellation prompt 24h before the charge — we shipped a churn button and
// called it a courtesy. Its job now is to bring someone back into the app while
// their trial is still live, so the decision is made against what Pepta has
// actually tracked for them rather than against a dollar figure.
//
// KNOWN TRADE-OFF (Nick's call, 2026-08-12): the paywall still says "we'll
// remind you before it ends", and this message no longer says that. The promise
// is deliberately carried by the paywall alone; the cost, if it shows up, is
// refund requests and surprise-charge reviews rather than churn. If those start
// appearing, the cheapest fix is one honest clause here — not deleting the
// notification.
//
// Deliberately a local notification rather than a server push: it is scheduled
// on the device the moment the purchase succeeds, so it does not depend on the
// RevenueCat webhook landing, on a push token being registered, or on the
// backend being up three days later.
//
// Pure and RN-free.

/** How far ahead of expiry this lands. A full day of trial still to use. */
export const TRIAL_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Below this, a notification is noise — it would land essentially with the
 * charge, too late for the person to get anything out of the trial.
 */
export const MIN_NOTICE_MS = 30 * 60 * 1000;

export interface TrialReminderPlan {
  fireAt: Date;
  title: string;
  body: string;
}

export interface PlanTrialReminderOptions {
  /** entitlement.expirationDate — ISO string, or null for lifetime/none. */
  expirationISO: string | null | undefined;
  /** True only when this purchase actually started a free trial. */
  isTrial: boolean;
  now?: Date;
}

/**
 * The reminder to schedule, or null if there is nothing honest to schedule.
 *
 * Returns null when: this was not a trial, there is no expiry, the expiry is
 * already past, or the remaining window is too short to give real notice.
 */
export function planTrialReminder({
  expirationISO,
  isTrial,
  now = new Date(),
}: PlanTrialReminderOptions): TrialReminderPlan | null {
  if (!isTrial || !expirationISO) return null;

  const expiresAt = new Date(expirationISO);
  if (Number.isNaN(expiresAt.getTime())) return null;

  const msLeft = expiresAt.getTime() - now.getTime();
  if (msLeft <= MIN_NOTICE_MS) return null;

  // A day ahead when the trial is long enough; otherwise land halfway through
  // what is left, so a short trial still gets a real warning rather than none.
  const lead = Math.min(TRIAL_REMINDER_LEAD_MS, msLeft / 2);
  const fireAt = new Date(expiresAt.getTime() - lead);

  // Warmth, and a reason to open the app — no price, no cancellation path.
  // Deliberately generic: a local notification is composed HERE, at purchase
  // time, and iOS fires exactly this text days later, so it cannot name what
  // the user has logged since. Anything data-specific has to be re-composed on
  // a later app foreground, not promised here.
  return {
    fireAt,
    title: 'Hope you’re enjoying Pepta',
    body: 'Your levels, doses and protein are all tracked and running. Tap in and see where you’re at.',
  };
}
