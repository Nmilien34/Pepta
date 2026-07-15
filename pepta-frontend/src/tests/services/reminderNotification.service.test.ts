import { beforeEach, describe, expect, it, vi } from "vitest";
import { testStorage } from "../testStorage";
import { makeHome } from "../../mocks/home";
import { deriveReminderGroups } from "../../screens/app/reminderSettings";
import {
  buildReminderNotificationRequests,
  loadReminderState,
  REMINDER_STORAGE_KEY,
  saveReminderState,
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

function adapter(args?: { granted?: boolean; existingIds?: string[] }) {
  const scheduled: unknown[] = [];
  const canceled: string[] = [];
  const existing = args?.existingIds ?? ["pepta.reminder.dose_due", "other.local.notification"];
  const granted = args?.granted ?? true;

  const fake: ReminderNotificationAdapter = {
    async getAllScheduledNotificationsAsync() {
      return existing.map((identifier) => ({ identifier }));
    },
    async getPermissionsAsync() {
      return { status: granted ? "granted" : "denied", granted, canAskAgain: !granted };
    },
    async requestPermissionsAsync() {
      return { status: granted ? "granted" : "denied", granted, canAskAgain: !granted };
    },
    async scheduleNotificationAsync(request) {
      scheduled.push(request);
      return request.identifier;
    },
    async cancelScheduledNotificationAsync(identifier) {
      canceled.push(identifier);
    },
    async getExpoPushTokenAsync() {
      return { data: "ExponentPushToken[abc123]" };
    },
  };

  return { fake, scheduled, canceled };
}

function groups() {
  return deriveReminderGroups({
    home: makeHome({
      nextDose: {
        compoundId: "compound-1",
        compoundName: "Semaglutide",
        nextDoseAt: "2026-07-03T13:00:00.000Z",
        hoursUntilNextDose: 48,
      },
    }),
    track: null,
  });
}

beforeEach(() => {
  testStorage.clear();
});

describe("Pepta reminder notification scheduling", () => {
  it("builds scheduled notification requests from enabled reminder rows", () => {
    const requests = buildReminderNotificationRequests(groups(), {
      dose_due: true,
      post_dose_checkin: true,
      protein_anchor: false,
      hydration_check: true,
      weekly_weigh_in: false,
      trend_review: true,
      progress_photo: false,
    });

    expect(requests.map((request) => request.identifier)).toEqual([
      "pepta.reminder.dose_due",
      "pepta.reminder.post_dose_checkin",
      "pepta.reminder.hydration_check",
      "pepta.reminder.trend_review.2",
    ]);
    expect(requests[0]?.trigger).toEqual({ kind: "date", datetime: "2026-07-03T13:00:00.000Z" });
    expect(requests[0]).toMatchObject({
      title: "Pep: shot time",
      body: expect.stringContaining("Semaglutide"),
    });
    expect(requests[2]?.trigger).toEqual({ kind: "daily", hour: 15, minute: 30 });
    for (const request of requests) {
      expect(request.title.startsWith("Pep:")).toBe(true);
    }
  });

  it("persists reminder state merged with current defaults", async () => {
    await saveReminderState({ dose_due: false, progress_photo: true });

    const raw = await testStorage.getItem(REMINDER_STORAGE_KEY);
    expect(JSON.parse(raw ?? "{}")).toEqual({ dose_due: false, progress_photo: true });

    const loaded = await loadReminderState(groups());
    expect(loaded.dose_due).toBe(false);
    expect(loaded.progress_photo).toBe(true);
    expect(loaded.protein_anchor).toBe(true);
  });

  it("cancels old Pepta reminders and schedules enabled reminders when permission is granted", async () => {
    const { fake, scheduled, canceled } = adapter();

    const result = await syncReminderNotifications(
      groups(),
      { dose_due: true, protein_anchor: true, progress_photo: false },
      fake,
    );

    expect(result.permissionStatus).toBe("granted");
    expect(canceled).toEqual(["pepta.reminder.dose_due"]);
    expect(scheduled.map((request) => (request as { identifier: string }).identifier)).toEqual([
      "pepta.reminder.dose_due",
      "pepta.reminder.protein_anchor",
    ]);
  });

  it("registers the Expo push token with the backend after notification permission is granted", async () => {
    const { fake } = adapter();
    const registerBackendPushToken = vi.fn(async () => undefined);

    const result = await syncReminderNotifications(
      groups(),
      { dose_due: true },
      fake,
      { registerBackendPushToken },
    );

    expect(result.permissionStatus).toBe("granted");
    expect(registerBackendPushToken).toHaveBeenCalledWith({
      token: "ExponentPushToken[abc123]",
      platform: "ios",
    });
  });

  it("cancels existing reminders and schedules none when permission is denied", async () => {
    const { fake, scheduled, canceled } = adapter({
      granted: false,
      existingIds: ["pepta.reminder.hydration_check"],
    });

    const result = await syncReminderNotifications(groups(), { hydration_check: true }, fake);

    expect(result.permissionStatus).toBe("denied");
    expect(canceled).toEqual(["pepta.reminder.hydration_check"]);
    expect(scheduled).toHaveLength(0);
  });
});
