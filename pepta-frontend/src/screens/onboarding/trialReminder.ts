// When to warn someone that their free trial is about to convert.
//
// This exists because the paywall PROMISES it ("We'll remind you before it
// ends"). A promise made to close a sale that the app then does not keep is
// worse than not making it — the person finds out by being charged. If this
// module is ever unwired, take the line off the paywall in the same change.
//
// Deliberately a local notification rather than a server push: it is scheduled
// on the device the moment the purchase succeeds, so it does not depend on the
// RevenueCat webhook landing, on a push token being registered, or on the
// backend being up three days later.
//
// Pure and RN-free.

/** How far ahead of expiry we aim to warn. A full day to act on it. */
export const TRIAL_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Below this, a notification is noise — it would land essentially with the
 * charge, which is the thing we said we would give warning about.
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
  /** Price to name in the body, e.g. "$9.99". Omitted if unknown. */
  priceString?: string | null;
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
  priceString,
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

  // "Tomorrow" is only true on the full-day lead. On the halfway fallback the
  // notification may land hours before expiry, so the copy has to say the
  // vaguer, true thing rather than the crisper, wrong one.
  const aDayAhead = lead === TRIAL_REMINDER_LEAD_MS;
  const when = aDayAhead ? 'tomorrow' : 'soon';
  const price = priceString?.trim();

  return {
    fireAt,
    title: aDayAhead ? 'Your free trial ends tomorrow' : 'Your free trial ends soon',
    body: price
      ? `Heads up like I promised — Pepta renews at ${price} ${when}. Keep going, or cancel in Settings. No hard feelings either way.`
      : `Heads up like I promised — your trial ends ${when}. Keep going, or cancel in Settings. No hard feelings either way.`,
  };
}
