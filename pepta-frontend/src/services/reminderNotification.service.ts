import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { ReminderGroup, ReminderScheduleRule } from "../screens/app/reminderSettings";

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
  scheduleNotificationAsync: (request: {
    identifier: string;
    content: { title: string; body: string; data: Record<string, string> };
    trigger: ReminderNotificationTrigger;
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
}

const reminderCopy: Record<string, { title: string; body: string }> = {
  dose_due: {
    title: "Dose reminder",
    body: "A gentle reminder to log your GLP-1 dose when you take it.",
  },
  post_dose_checkin: {
    title: "How are you feeling today?",
    body: "Track appetite, side effects, water, and protein while this dose settles in.",
  },
  protein_anchor: {
    title: "Protein anchor",
    body: "A steady protein choice now can make the rest of today easier.",
  },
  hydration_check: {
    title: "Hydration + fiber check",
    body: "Water and fiber can help your GLP-1 routine feel smoother.",
  },
  weekly_weigh_in: {
    title: "Weekly weigh-in",
    body: "Log a consistent morning weight so Pepta can read your trend.",
  },
  trend_review: {
    title: "Your Pepta trend is ready",
    body: "Review your dose cycle, protein, hydration, and weight direction.",
  },
  progress_photo: {
    title: "Progress photo",
    body: "Take a consistent photo when the lighting is steady.",
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
      const copy = reminderCopy[item.id];
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

async function cancelPeptaReminderNotifications(adapter: ReminderNotificationAdapter): Promise<number> {
  const scheduled = await adapter.getAllScheduledNotificationsAsync();
  const peptaReminders = scheduled.filter((request) => request.identifier.startsWith(REMINDER_IDENTIFIER_PREFIX));
  await Promise.all(peptaReminders.map((request) => adapter.cancelScheduledNotificationAsync(request.identifier)));
  return peptaReminders.length;
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
