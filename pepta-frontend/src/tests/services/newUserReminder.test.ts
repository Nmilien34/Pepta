/**
 * End-to-end for the retention fix: a brand-new user who has logged NOTHING
 * still walks out of onboarding with an armed, correctly-timed dose reminder.
 *
 * The backend half (projecting a nextDoseAt from the schedule alone) is pinned
 * in pepta-backend/src/tests/lib/scheduleAnchor.test.ts. This picks up where
 * that leaves off: given the nextDose the backend now returns, the client must
 * default the reminder ON and hand the OS a trigger in the future.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { testStorage } from "../testStorage";
import { makeHome } from "../../mocks/home";
import { defaultReminderState, deriveReminderGroups } from "../../screens/app/reminderSettings";
import {
  syncReminderNotifications,
  type ReminderNotificationAdapter,
} from "../../services/reminderNotification.service";

vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    DATE: "date",
    TIME_INTERVAL: "timeInterval",
    WEEKLY: "weekly",
  },
  getAllScheduledNotificationsAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
}));

function adapter(granted = true) {
  const scheduled: { identifier: string; trigger: unknown }[] = [];
  let requestedPermission = false;

  const fake: ReminderNotificationAdapter = {
    async getAllScheduledNotificationsAsync() {
      return [];
    },
    async getPermissionsAsync() {
      return { status: granted ? "granted" : "denied", granted, canAskAgain: !granted };
    },
    async requestPermissionsAsync() {
      requestedPermission = true;
      return { status: granted ? "granted" : "denied", granted, canAskAgain: !granted };
    },
    async scheduleNotificationAsync(request) {
      scheduled.push({ identifier: request.identifier, trigger: request.trigger });
      return request.identifier;
    },
    async cancelScheduledNotificationAsync() {},
    async getExpoPushTokenAsync() {
      return { data: "ExponentPushToken[abc123]" };
    },
  };

  return { fake, scheduled, wasPrompted: () => requestedPermission };
}

/** What /home returns straight after onboarding, with NO dose ever logged. */
function freshHome(nextDoseAt: string) {
  return makeHome({
    nextDose: {
      compoundId: "compound-1",
      compoundName: "Foundayo",
      nextDoseAt,
      hoursUntilNextDose: 12,
    },
  });
}

const schedule = (frequency: "daily" | "weekly") => [
  {
    id: "schedule-1",
    compoundId: "compound-1",
    frequency,
    daysOfWeek: [],
    active: true,
  } as never,
];

beforeEach(() => {
  testStorage.clear();
});

describe("brand-new user, nothing logged", () => {
  it("arms a DAILY reminder at the stated time", async () => {
    // 09:00 America/New_York tomorrow — what the schedule anchor projects.
    const groups = deriveReminderGroups({
      home: freshHome("2026-08-12T13:00:00.000Z"),
      track: null,
      schedules: schedule("daily"),
    });
    const state = defaultReminderState(groups);

    // Defaults ON with no dose logged — the whole point of the fix.
    expect(state.dose_due).toBe(true);

    const { fake, scheduled } = adapter();
    const result = await syncReminderNotifications(groups, state, fake, {
      registerBackendPushToken: async () => undefined,
    });

    expect(result.permissionStatus).toBe("granted");
    const dose = scheduled.find((s) => s.identifier === "pepta.reminder.dose_due");
    expect(dose).toBeDefined();
    // Daily cadence repeats, so a missed day cannot silently end the reminders.
    expect(dose!.trigger).toMatchObject({ kind: "daily", hour: 9 });
  });

  it("arms a WEEKLY reminder at the next occurrence, in the future", async () => {
    const nextDoseAt = "2026-08-17T13:00:00.000Z";
    const groups = deriveReminderGroups({
      home: freshHome(nextDoseAt),
      track: null,
      schedules: schedule("weekly"),
    });
    const state = defaultReminderState(groups);
    expect(state.dose_due).toBe(true);

    const { fake, scheduled } = adapter();
    await syncReminderNotifications(groups, state, fake, {
      registerBackendPushToken: async () => undefined,
    });

    const dose = scheduled.find((s) => s.identifier === "pepta.reminder.dose_due");
    expect(dose!.trigger).toMatchObject({ kind: "date" });
    const at = new Date((dose!.trigger as { datetime: string }).datetime);
    expect(at.toISOString()).toBe(nextDoseAt);
  });

  it("never hands the OS a dose time that has already passed", async () => {
    const nextDoseAt = "2026-08-17T13:00:00.000Z";
    const groups = deriveReminderGroups({
      home: freshHome(nextDoseAt),
      track: null,
      schedules: schedule("weekly"),
    });

    const { fake, scheduled } = adapter();
    await syncReminderNotifications(groups, defaultReminderState(groups), fake, {
      registerBackendPushToken: async () => undefined,
    });

    for (const request of scheduled) {
      const trigger = request.trigger as { kind?: string; datetime?: string };
      if (trigger.kind !== "date") continue;
      expect(new Date(trigger.datetime!).getTime()).toBeGreaterThan(
        new Date("2026-08-11T20:00:00.000Z").getTime(),
      );
    }
  });

  it("stays silent — and schedules nothing — when permission is denied", async () => {
    const groups = deriveReminderGroups({
      home: freshHome("2026-08-12T13:00:00.000Z"),
      track: null,
      schedules: schedule("daily"),
    });

    const { fake, scheduled } = adapter(false);
    const result = await syncReminderNotifications(
      groups,
      defaultReminderState(groups),
      fake,
      { registerBackendPushToken: async () => undefined },
    );

    expect(result.permissionStatus).toBe("denied");
    expect(result.scheduledCount).toBe(0);
    expect(scheduled).toHaveLength(0);
  });

  it("still derives dose_due OFF when there is genuinely no schedule", async () => {
    // The old always-off behaviour must survive for users with no medication —
    // the fix is about schedules that exist, not about defaulting everyone on.
    const groups = deriveReminderGroups({
      home: makeHome({ nextDose: null }),
      track: null,
      schedules: [],
    });

    expect(defaultReminderState(groups).dose_due).toBe(false);
  });
});
