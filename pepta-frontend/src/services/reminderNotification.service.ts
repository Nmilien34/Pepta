import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PushTokenRegistrationRequest } from "@pepta/shared";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { ReminderGroup, ReminderScheduleRule } from "../screens/app/reminderSettings";
import { api } from "./api";

export const REMINDER_STORAGE_KEY = "pepta.reminders.state";
const REMINDER_IDENTIFIER_PREFIX = "pepta.reminder.";
const REMINDER_CHANNEL_ID = "pepta-reminders";

export type ReminderPermissionStatus = "granted" | "denied" | "undetermined";

export type ReminderNotificationTrigger =
  | { kind: "date"; datetime: string }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "timeInterval"; seconds: number; repeats: true }
  | { kind: "weekly"; weekday: number; hour: number; minute: number };

export interface ReminderNotificationRequest {
  identifier: string;
  reminderId: string;
  title: string;
  body: string;
  trigger: ReminderNotificationTrigger;
}

export interface ReminderNotificationAdapter {
  prepareAsync?: () => Promise<void>;
  getAllScheduledNotificationsAsync: () => Promise<Array<{ identifier: string }>>;
  getPermissionsAsync: () => Promise<{ status: string; granted: boolean; canAskAgain?: boolean }>;
  requestPermissionsAsync: () => Promise<{ status: string; granted: boolean; canAskAgain?: boolean }>;
  getExpoPushTokenAsync?: () => Promise<{ data: string }>;
  scheduleNotificationAsync: (request: {
    identifier: string;
    content: { title: string; body: string; data: Record<string, string> };
    trigger: ReminderNotificationTrigger;
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
}

// FALLBACK ONLY — scheduleReminders prefers item.notification, which
// buildPepReminderNotificationCopy supplies route-aware. This map is reached
// when a reminder has no composed copy, where no compound (and so no route)
// is in hand, so it keeps the injection wording by design.
const reminderCopy: Record<string, { title: string; body: string }> = {
  dose_due: {
    title: "Pep: shot time",
    body: "I have your dose on the board. Log it when it's done, and I'll keep the cycle lined up with you.",
  },
  post_dose_checkin: {
    title: "Pep: post-shot check-in",
    body: "Quick read for me: appetite, side effects, water, and protein while this dose settles in.",
  },
  protein_anchor: {
    title: "Pep: protein checkpoint",
    body: "Protein first on the next meal. Future-you and your muscles both like that plan.",
  },
  hydration_check: {
    title: "Pep: water + fiber check",
    body: "Water and fiber check. Small, boring, useful. My favorite category.",
  },
  weekly_weigh_in: {
    title: "Pep: scale check",
    body: "Same kind of morning read, no drama. Log it and I’ll watch the trend, not one noisy number.",
  },
  trend_review: {
    title: "Pep: weekly read",
    body: "I’ve got your dose cycle, logs, and trend waiting. Open Pepta and we’ll read the week together.",
  },
  progress_photo: {
    title: "Pep: photo check-in",
    body: "Same mirror, same light. One quick photo gives us another way to see the journey.",
  },
};

let notificationHandlerConfigured = false;

const expoReminderNotificationAdapter: ReminderNotificationAdapter = {
  async prepareAsync() {
    if (!notificationHandlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      notificationHandlerConfigured = true;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: "Pepta reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  },
  getAllScheduledNotificationsAsync: Notifications.getAllScheduledNotificationsAsync,
  getPermissionsAsync: Notifications.getPermissionsAsync,
  requestPermissionsAsync: () =>
    Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: true,
      },
    }),
  getExpoPushTokenAsync: () => Notifications.getExpoPushTokenAsync(),
  scheduleNotificationAsync: (request) =>
    Notifications.scheduleNotificationAsync({
      identifier: request.identifier,
      content: request.content,
      trigger: toExpoTrigger(request.trigger),
    }),
  cancelScheduledNotificationAsync: Notifications.cancelScheduledNotificationAsync,
};

function defaultStateForGroups(groups: ReminderGroup[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const group of groups) {
    for (const item of group.items) {
      state[item.id] = item.defaultOn;
    }
  }
  return state;
}

function normalizePermissionStatus(status: string, granted: boolean): ReminderPermissionStatus {
  if (granted || status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notificationId(reminderId: string, suffix?: string | number): string {
  return `${REMINDER_IDENTIFIER_PREFIX}${reminderId}${suffix === undefined ? "" : `.${suffix}`}`;
}

function buildTriggerRequests(
  reminderId: string,
  copy: { title: string; body: string },
  schedule: ReminderScheduleRule,
): ReminderNotificationRequest[] {
  if (schedule.kind === "none") return [];
  if (schedule.kind === "daily" || schedule.kind === "timeInterval" || schedule.kind === "date") {
    return [{
      identifier: notificationId(reminderId),
      reminderId,
      title: copy.title,
      body: copy.body,
      trigger: schedule,
    }];
  }

  return schedule.weekdays.map((weekday) => ({
    identifier: notificationId(reminderId, weekday),
    reminderId,
    title: copy.title,
    body: copy.body,
    trigger: { kind: "weekly", weekday, hour: schedule.hour, minute: schedule.minute },
  }));
}

function toExpoTrigger(trigger: ReminderNotificationTrigger): Notifications.NotificationTriggerInput {
  if (trigger.kind === "date") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      channelId: REMINDER_CHANNEL_ID,
      date: new Date(trigger.datetime),
    };
  }
  if (trigger.kind === "daily") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      channelId: REMINDER_CHANNEL_ID,
      hour: trigger.hour,
      minute: trigger.minute,
    };
  }
  if (trigger.kind === "timeInterval") {
    return {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      channelId: REMINDER_CHANNEL_ID,
      seconds: trigger.seconds,
      repeats: trigger.repeats,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    channelId: REMINDER_CHANNEL_ID,
    weekday: trigger.weekday,
    hour: trigger.hour,
    minute: trigger.minute,
  };
}

export function buildReminderNotificationRequests(
  groups: ReminderGroup[],
  state: Record<string, boolean>,
): ReminderNotificationRequest[] {
  const requests: ReminderNotificationRequest[] = [];

  for (const group of groups) {
    for (const item of group.items) {
      if (!state[item.id]) continue;
      const copy = item.notification ?? reminderCopy[item.id];
      if (!copy) continue;
      requests.push(...buildTriggerRequests(item.id, copy, item.schedule));
    }
  }

  return requests;
}

export async function loadReminderState(groups: ReminderGroup[]): Promise<Record<string, boolean>> {
  const defaults = defaultStateForGroups(groups);
  const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return defaults;
    const merged = { ...defaults };
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") merged[key] = value;
    }
    return merged;
  } catch {
    return defaults;
  }
}

export async function saveReminderState(state: Record<string, boolean>): Promise<void> {
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(state));
}

/**
 * INTENT LEDGER — the reminder ids the user has personally toggled.
 *
 * saveReminderState writes the WHOLE record, defaults included, so the stored
 * blob has never distinguished "the user chose this" from "this was the default
 * when we last saved". That ambiguity is what made the dose_due repair below
 * unverifiable. From here on, a real choice is recorded as one, so a future
 * default change can propagate to untouched reminders without ever overriding
 * someone's decision.
 */
export const REMINDER_EXPLICIT_KEY = "pepta.reminders.explicit";
/** Set once the one-time dose_due repair has run — it must never run twice. */
const REMINDER_REPAIR_KEY = "pepta.reminders.repair.v1";
/** Set when the repair actually switched dose reminders on, so we can say so. */
export const REMINDER_REPAIR_NOTICE_KEY = "pepta.reminders.repair.notice";

export async function loadExplicitReminderIds(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(REMINDER_EXPLICIT_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export async function markReminderExplicit(id: string): Promise<void> {
  const ids = await loadExplicitReminderIds();
  if (ids.has(id)) return;
  ids.add(id);
  await AsyncStorage.setItem(REMINDER_EXPLICIT_KEY, JSON.stringify([...ids]));
}

/**
 * ONE-TIME REPAIR of dose reminders disabled by a bug, not by a user.
 *
 * Onboarding's notifications step called deriveReminderGroups({home: null,
 * track: null}) — before any schedule existed — so dose_due came back
 * defaultOn:false for literally everyone, and that false was PERSISTED. Every
 * onboarded user therefore had dose reminders off, including the users whose
 * schedule projected a perfectly good nextDoseAt, and loadReminderState made it
 * permanent by merging stored over defaults.
 *
 * DELIBERATELY NARROW: only dose_due and post_dose_checkin, only when the stored
 * value is false, and never for an id in the intent ledger. Every other
 * preference is left exactly as the user left it. Removing the keys lets the
 * corrected default apply rather than forcing them on.
 *
 * Runs once, guarded by a version marker.
 */
const REPAIRABLE_REMINDER_IDS = ["dose_due", "post_dose_checkin"] as const;

export async function repairBuggedDoseReminderState(): Promise<{
  repaired: string[];
}> {
  if (await AsyncStorage.getItem(REMINDER_REPAIR_KEY)) return { repaired: [] };

  const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
  await AsyncStorage.setItem(REMINDER_REPAIR_KEY, "1");
  if (!raw) return { repaired: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { repaired: [] };
  }
  if (!isRecord(parsed)) return { repaired: [] };

  const explicit = await loadExplicitReminderIds();
  const next = { ...parsed };
  const repaired: string[] = [];
  for (const id of REPAIRABLE_REMINDER_IDS) {
    if (explicit.has(id)) continue; // a real choice — never touched
    if (next[id] !== false) continue;
    delete next[id];
    repaired.push(id);
  }

  if (repaired.length === 0) return { repaired: [] };
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(next));
  // The user sees this stated plainly in Reminder Settings — a reminder that
  // switches itself on without explanation is the thing we are avoiding.
  await AsyncStorage.setItem(REMINDER_REPAIR_NOTICE_KEY, "1");
  return { repaired };
}

/**
 * Ask for notification permission WITHOUT touching the schedule queue.
 *
 * The onboarding notifications step used to prompt by calling a full sync,
 * which meant it also persisted a reminder state derived from data that did not
 * exist yet. This separates the two: prompt here, arm once the schedule is real.
 */
export async function requestReminderPermission(
  adapter: ReminderNotificationAdapter = expoReminderNotificationAdapter,
): Promise<ReminderPermissionStatus> {
  await adapter.prepareAsync?.();
  return ensurePermission(adapter);
}

export interface SyncReminderNotificationsOptions {
  registerBackendPushToken?: (input: PushTokenRegistrationRequest) => Promise<unknown>;
}

function currentPushPlatform(): PushTokenRegistrationRequest["platform"] {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "web") return "web";
  return "ios";
}

async function registerBackendPushTokenIfPossible(
  adapter: ReminderNotificationAdapter,
  registerBackendPushToken: (input: PushTokenRegistrationRequest) => Promise<unknown>,
): Promise<void> {
  if (!adapter.getExpoPushTokenAsync) return;
  const token = await adapter.getExpoPushTokenAsync();
  const data = token.data.trim();
  if (!data) return;
  await registerBackendPushToken({
    token: data,
    platform: currentPushPlatform(),
  });
}

async function cancelPeptaReminderNotifications(adapter: ReminderNotificationAdapter): Promise<number> {
  const scheduled = await adapter.getAllScheduledNotificationsAsync();
  const peptaReminders = scheduled.filter((request) => request.identifier.startsWith(REMINDER_IDENTIFIER_PREFIX));
  await Promise.all(peptaReminders.map((request) => adapter.cancelScheduledNotificationAsync(request.identifier)));
  return peptaReminders.length;
}

/**
 * Read the permission WITHOUT prompting. A background re-sync must never
 * raise the system dialog on its own, and syncReminderNotifications cancels
 * before it checks permission — so a caller that isn't already granted has to
 * bail BEFORE calling it, or it wipes the user's scheduled reminders and
 * schedules nothing back.
 */
export async function readReminderPermissionStatus(
  adapter: ReminderNotificationAdapter = expoReminderNotificationAdapter,
): Promise<ReminderPermissionStatus> {
  const existing = await adapter.getPermissionsAsync();
  if (existing.granted || existing.status === "granted") return "granted";
  return normalizePermissionStatus(existing.status, existing.granted);
}

async function ensurePermission(adapter: ReminderNotificationAdapter): Promise<ReminderPermissionStatus> {
  const existing = await adapter.getPermissionsAsync();
  if (existing.granted || existing.status === "granted") return "granted";

  const requested = await adapter.requestPermissionsAsync();
  return normalizePermissionStatus(requested.status, requested.granted);
}

export async function syncReminderNotifications(
  groups: ReminderGroup[],
  state: Record<string, boolean>,
  adapter: ReminderNotificationAdapter = expoReminderNotificationAdapter,
  options: SyncReminderNotificationsOptions = {},
): Promise<{ permissionStatus: ReminderPermissionStatus; scheduledCount: number; canceledCount: number }> {
  await adapter.prepareAsync?.();
  const canceledCount = await cancelPeptaReminderNotifications(adapter);
  const requests = buildReminderNotificationRequests(groups, state);

  if (requests.length === 0) {
    return { permissionStatus: "undetermined", scheduledCount: 0, canceledCount };
  }

  const permissionStatus = await ensurePermission(adapter);
  if (permissionStatus !== "granted") {
    return { permissionStatus, scheduledCount: 0, canceledCount };
  }

  const registerBackendPushToken =
    options.registerBackendPushToken ?? api.registerPushToken.bind(api);
  await registerBackendPushTokenIfPossible(adapter, registerBackendPushToken).catch(() => undefined);

  await Promise.all(
    requests.map((request) =>
      adapter.scheduleNotificationAsync({
        identifier: request.identifier,
        content: {
          title: request.title,
          body: request.body,
          data: { reminderId: request.reminderId },
        },
        trigger: request.trigger,
      }),
    ),
  );

  return { permissionStatus, scheduledCount: requests.length, canceledCount };
}
