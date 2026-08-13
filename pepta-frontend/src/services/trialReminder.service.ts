// Schedules the "your trial ends tomorrow" notification the paywall promises.
//
// The promise is made in monthlyCta() ("We'll remind you before it ends"). This
// is the half that keeps it. If this stops being called, that sentence has to
// come off the paywall in the same change — a retention promise made to close
// a sale and then not kept is how people find out by being charged.
//
// Local, not push, and scheduled at purchase time: it survives the webhook not
// landing, the push token never registering, and the backend being down three
// days later. The trade-off is that it does not follow the user to a new
// device, which is acceptable for a 3-day window.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { planTrialReminder, type TrialReminderPlan } from "../screens/onboarding/trialReminder";
import {
  planTrialSequence,
  TRIAL_SEQUENCE_IDS,
  type TrialSequenceStep,
} from "../screens/onboarding/trialSequence";

/** Stable id so re-purchasing or restoring replaces rather than duplicates. */
export const TRIAL_REMINDER_ID = "pepta.trial-ending";

export interface TrialReminderAdapter {
  scheduleNotificationAsync: (request: {
    identifier: string;
    content: { title: string; body: string; data: Record<string, string> };
    trigger: Notifications.NotificationTriggerInput;
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
  getPermissionsAsync: () => Promise<{ granted: boolean }>;
}

const defaultAdapter: TrialReminderAdapter = {
  scheduleNotificationAsync: (request) => Notifications.scheduleNotificationAsync(request),
  cancelScheduledNotificationAsync: (id) => Notifications.cancelScheduledNotificationAsync(id),
  getPermissionsAsync: async () => {
    const result = await Notifications.getPermissionsAsync();
    return { granted: result.granted };
  },
};

/** Shape we need off CustomerInfo — kept structural so tests need no SDK. */
export interface TrialCustomerInfo {
  entitlements: {
    active: Record<
      string,
      { expirationDate?: string | null; periodType?: string | null; productIdentifier?: string }
    >;
  };
}

/** RevenueCat reports a free trial as periodType "TRIAL" (or "trial"). */
export function isTrialPeriod(periodType: string | null | undefined): boolean {
  return typeof periodType === "string" && periodType.toUpperCase() === "TRIAL";
}

export function trialPlanFor(
  customerInfo: TrialCustomerInfo,
  entitlementId: string,
  now?: Date,
): TrialReminderPlan | null {
  // Defensive all the way down. This runs in the purchase flow, on an object
  // that came from a native SDK, and the caller's catch would turn any throw
  // here into "purchase could not be completed" for someone who was in fact
  // just charged. Nothing about a reminder is worth that.
  const entitlement = customerInfo?.entitlements?.active?.[entitlementId];
  if (!entitlement) return null;
  return planTrialReminder({
    expirationISO: entitlement.expirationDate ?? null,
    isTrial: isTrialPeriod(entitlement.periodType),
    now,
  });
}

/**
 * Schedule (or replace) the trial-ending reminder. Safe to call after any
 * successful purchase — it no-ops when the purchase was not a trial.
 *
 * Returns the scheduled plan, or null if nothing was scheduled, so the caller
 * can tell "not a trial" from "scheduled" without inspecting notifications.
 */
export async function scheduleTrialEndReminder(
  customerInfo: TrialCustomerInfo,
  entitlementId: string,
  options: {
    adapter?: TrialReminderAdapter;
    now?: Date;
  } = {},
): Promise<TrialReminderPlan | null> {
  const adapter = options.adapter ?? defaultAdapter;

  let plan: TrialReminderPlan | null;
  let steps: TrialSequenceStep[] = [];
  try {
    plan = trialPlanFor(customerInfo, entitlementId, options.now);
    const entitlement = customerInfo?.entitlements?.active?.[entitlementId];
    steps = planTrialSequence({
      expirationISO: entitlement?.expirationDate ?? null,
      isTrial: isTrialPeriod(entitlement?.periodType),
      now: options.now,
    });
  } catch {
    return null;
  }

  try {
    // Always clear first: a restore or re-subscribe must not leave a stale
    // reminder pointing at an expiry that no longer applies.
    await adapter.cancelScheduledNotificationAsync(TRIAL_REMINDER_ID);
  } catch {
    // Nothing scheduled — fine.
  }
  // Same for the sequence: a restore or re-subscribe must not stack a second
  // set of touchpoints on top of the first.
  for (const id of Object.values(TRIAL_SEQUENCE_IDS)) {
    await adapter.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }

  if (!plan) return null;
  if (Platform.OS === "web") return null;

  try {
    // We do not PROMPT here. Asking for notifications in the seconds after a
    // purchase, on top of the StoreKit sheet, is a bad moment and the
    // onboarding already has its own permission turn. If permission was
    // declined the reminder simply cannot be delivered.
    const permission = await adapter.getPermissionsAsync();
    if (!permission.granted) return null;

    await adapter.scheduleNotificationAsync({
      identifier: TRIAL_REMINDER_ID,
      content: {
        title: plan.title,
        body: plan.body,
        data: { kind: "trial_ending" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.fireAt,
      },
    });

    // The earlier value touchpoints ride along on the SAME permission check
    // and the same purchase moment. Scheduled after the day-2 message on
    // purpose: if anything here throws, the message the paywall's promise
    // hangs on is already safely queued.
    for (const step of steps) {
      await adapter
        .scheduleNotificationAsync({
          identifier: step.id,
          content: {
            title: step.title,
            body: step.body,
            data: { kind: "trial_sequence" },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: step.fireAt,
          },
        })
        .catch(() => undefined);
    }
    return plan;
  } catch {
    // A failure to schedule must never block unlocking the app the user just
    // paid for. They still get Apple's own renewal notice.
    return null;
  }
}
