import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DATE: "date" },
  scheduleNotificationAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
}));

const { TRIAL_REMINDER_ID, isTrialPeriod, scheduleTrialEndReminder } = await import(
  "./trialReminder.service"
);

const NOW = new Date("2026-08-01T12:00:00.000Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

interface ScheduleRequest {
  identifier: string;
  content: { title: string; body: string; data: Record<string, string> };
  trigger: unknown;
}

function adapter(granted = true) {
  return {
    scheduleNotificationAsync: vi.fn(async (_r: ScheduleRequest) => "id"),
    cancelScheduledNotificationAsync: vi.fn(async (_id: string) => undefined),
    getPermissionsAsync: vi.fn(async () => ({ granted })),
  };
}

function info(entitlement: Record<string, unknown> | null) {
  return { entitlements: { active: entitlement ? { pro: entitlement } : {} } } as never;
}

describe("isTrialPeriod", () => {
  it("matches RevenueCat's periodType regardless of case", () => {
    expect(isTrialPeriod("TRIAL")).toBe(true);
    expect(isTrialPeriod("trial")).toBe(true);
    expect(isTrialPeriod("NORMAL")).toBe(false);
    expect(isTrialPeriod("INTRO")).toBe(false);
    expect(isTrialPeriod(null)).toBe(false);
  });
});

describe("scheduleTrialEndReminder", () => {
  let a: ReturnType<typeof adapter>;
  beforeEach(() => {
    a = adapter();
  });

  it("schedules the reminder a day before a trial converts", async () => {
    const plan = await scheduleTrialEndReminder(
      info({ expirationDate: inHours(72), periodType: "TRIAL" }),
      "pro",
      { adapter: a, now: NOW },
    );
    expect(plan).not.toBeNull();
    const call = a.scheduleNotificationAsync.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call.identifier).toBe(TRIAL_REMINDER_ID);
    expect(call.trigger).toEqual({ type: "date", date: new Date(inHours(48)) });
    expect(call.content.body).not.toContain("$");
  });

  it("clears any previous reminder before scheduling, so restores do not stack", async () => {
    await scheduleTrialEndReminder(info({ expirationDate: inHours(72), periodType: "TRIAL" }), "pro", {
      adapter: a,
      now: NOW,
    });
    expect(a.cancelScheduledNotificationAsync).toHaveBeenCalledWith(TRIAL_REMINDER_ID);
  });

  it("clears a stale reminder even when there is nothing new to schedule", async () => {
    // Trial → paid conversion: the old reminder must not survive and tell a
    // paying subscriber their trial is ending.
    const plan = await scheduleTrialEndReminder(
      info({ expirationDate: inHours(720), periodType: "NORMAL" }),
      "pro",
      { adapter: a, now: NOW },
    );
    expect(plan).toBeNull();
    expect(a.cancelScheduledNotificationAsync).toHaveBeenCalledWith(TRIAL_REMINDER_ID);
    expect(a.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("does nothing for a non-trial purchase", async () => {
    const plan = await scheduleTrialEndReminder(
      info({ expirationDate: inHours(720), periodType: "NORMAL" }),
      "pro",
      { adapter: a, now: NOW },
    );
    expect(plan).toBeNull();
  });

  it("does nothing when the entitlement is missing", async () => {
    expect(await scheduleTrialEndReminder(info(null), "pro", { adapter: a, now: NOW })).toBeNull();
  });

  it("stays silent rather than prompting when notifications were declined", async () => {
    const denied = adapter(false);
    const plan = await scheduleTrialEndReminder(
      info({ expirationDate: inHours(72), periodType: "TRIAL" }),
      "pro",
      { adapter: denied, now: NOW },
    );
    expect(plan).toBeNull();
    expect(denied.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("never throws — a scheduling failure must not block unlocking a paid app", async () => {
    const broken = adapter();
    broken.scheduleNotificationAsync.mockRejectedValue(new Error("no"));
    broken.cancelScheduledNotificationAsync.mockRejectedValue(new Error("no"));
    await expect(
      scheduleTrialEndReminder(info({ expirationDate: inHours(72), periodType: "TRIAL" }), "pro", {
        adapter: broken,
        now: NOW,
      }),
    ).resolves.toBeNull();
  });
});
