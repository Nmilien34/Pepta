// Headless: keeps the OS's scheduled reminder notifications in step with the
// copy and timing the app would compose today.
//
// WHY IT EXISTS (2026-08-11): local notifications are PRE-COMPOSED — the app
// hands iOS a finished title/body and iOS fires exactly that. So any copy or
// schedule change (e.g. route-aware "Pep: dose time" for a pill user) reached
// only future schedules; anything already queued kept firing the old text
// until the user happened to open Reminder Settings, which was the sole
// re-sync trigger. This closes that gap on foreground.
//
// THREE SAFETY RULES, each protecting something real:
//  1. Never sync without loaded home data. deriveReminderGroups with null
//     home yields nextDoseAt null → dose_due {kind:'none'} → the sync would
//     CANCEL a live dose reminder and schedule nothing back.
//  2. Never sync unless permission is ALREADY granted. syncReminderNotifications
//     cancels first and only then calls ensurePermission (which PROMPTS), so
//     an ungranted caller both raises a surprise dialog and wipes the queue.
//  3. Never fight the user's toggles: re-sync uses their SAVED state, so a
//     reminder they switched off stays off.
// It also no-ops unless the composed output actually changed, so foregrounding
// the app repeatedly costs one cheap comparison.

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePeptaData } from '../context/PeptaDataContext';
import { deriveReminderGroups, type ReminderGroup } from '../screens/app/reminderSettings';
import {
  loadReminderState,
  readReminderPermissionStatus,
  syncReminderNotifications,
} from '../services/reminderNotification.service';

/** What the OS would actually fire: copy + trigger, per reminder. */
export function reminderSignature(groups: ReminderGroup[]): string {
  return JSON.stringify(
    groups.flatMap((group) =>
      group.items.map((item) => [
        item.id,
        item.notification?.title ?? null,
        item.notification?.body ?? null,
        item.schedule,
      ]),
    ),
  );
}

export function ReminderRefreshGate() {
  const { home, track, schedules } = usePeptaData();
  const lastSynced = useRef<string | null>(null);
  const running = useRef(false);

  const resync = useCallback(async () => {
    if (!home || running.current) return; // rule 1
    const groups = deriveReminderGroups({ home, track, schedules });
    const signature = reminderSignature(groups);
    if (signature === lastSynced.current) return;

    running.current = true;
    try {
      if ((await readReminderPermissionStatus()) !== 'granted') return; // rule 2
      const state = await loadReminderState(groups); // rule 3
      await syncReminderNotifications(groups, state);
      lastSynced.current = signature;
    } catch {
      // Never surface this: reminders are a background nicety, and the next
      // foreground retries anyway.
    } finally {
      running.current = false;
    }
  }, [home, track, schedules]);

  // Data landed or changed (new dose logged, schedule edited, copy updated).
  useEffect(() => {
    void resync();
  }, [resync]);

  // Returning to the app — the moment stale text is most likely.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void resync();
    });
    return () => subscription.remove();
  }, [resync]);

  return null;
}
