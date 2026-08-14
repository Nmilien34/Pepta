// Headless: re-composes the trial notifications from current code on launch.
//
// Sibling of ReminderRefreshGate, deliberately NOT folded into it. That one
// owns the settings reminders (`pepta.reminder.*`), reads its state from
// AsyncStorage, and runs on every foreground. This one owns `pepta.trial-*`,
// reads its state from RevenueCat over the network, and only matters once per
// launch. Sharing a component would mean a RevenueCat call every time the app
// comes back from the background, for a value that changes days apart.
//
// ONCE PER MOUNT, not per foreground: the shell mounts on launch, the trial
// expiry is days away, and the notification only needs to be correct by the
// time it fires. Someone who opens the app at all gets fixed; someone who
// never opens it could not have been reached by any mechanism.
//
// Every decision about whether it is SAFE to reschedule lives in
// services/trialReminderRefresh.ts, where it is unit tested — the failure mode
// being guarded is cancelling a live notification and putting nothing back.

import { useEffect, useRef } from 'react';
import { revenueCat } from '../services/revenueCat';
import { scheduleTrialEndReminder, type TrialCustomerInfo } from '../services/trialReminder.service';
import { refreshTrialReminders } from '../services/trialReminderRefresh';

export function TrialReminderRefreshGate() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void refreshTrialReminders({
      getCustomerInfo: () =>
        revenueCat.getCustomerInfo() as Promise<TrialCustomerInfo | null>,
      scheduleTrialEndReminder: (customerInfo, entitlementId) =>
        scheduleTrialEndReminder(customerInfo, entitlementId),
    });
  }, []);

  return null;
}
