import { describe, expect, it } from "vitest";
import { projectNextDoseAt } from "../../lib/pharmacokinetics";

const TZ = "America/New_York";

describe("schedule anchor — a new user's reminder arms without a logged dose", () => {
  it("daily schedule created at 4pm with a 09:00 time projects tomorrow 09:00", () => {
    // The brief's example. Created 16:00 local, so today's 09:00 has passed.
    const created = new Date("2026-08-11T20:00:00.000Z"); // 16:00 ET
    const now = new Date("2026-08-11T20:00:00.000Z");

    const next = projectNextDoseAt({
      latest: null,
      now,
      schedule: { frequency: "daily", timesOfDay: ["09:00"] },
      scheduleAnchor: created,
      timeZone: TZ,
    });

    expect(next?.toISOString()).toBe("2026-08-12T13:00:00.000Z"); // 09:00 ET
  });

  it("daily schedule created before its time projects TODAY, not tomorrow", () => {
    const created = new Date("2026-08-11T11:00:00.000Z"); // 07:00 ET
    const next = projectNextDoseAt({
      latest: null,
      now: created,
      schedule: { frequency: "daily", timesOfDay: ["09:00"] },
      scheduleAnchor: created,
      timeZone: TZ,
    });

    expect(next?.toISOString()).toBe("2026-08-11T13:00:00.000Z");
  });

  it("weekly schedule with a shot day projects the next occurrence at 9:00", () => {
    // Tue 2026-08-11; shot day Monday (1). No stored time → 9:00 default.
    const created = new Date("2026-08-11T20:00:00.000Z");
    const next = projectNextDoseAt({
      latest: null,
      now: created,
      schedule: { frequency: "weekly", daysOfWeek: [1] },
      scheduleAnchor: created,
      timeZone: TZ,
    });

    expect(next).not.toBeNull();
    expect(next!.toISOString()).toBe("2026-08-17T13:00:00.000Z"); // Mon 09:00 ET
  });

  it("never projects a time already in the past", () => {
    // A schedule created weeks ago that never saw a dose: creation+7d is long
    // gone, and arming that would fire an overdue reminder immediately.
    const created = new Date("2026-07-01T12:00:00.000Z");
    const now = new Date("2026-08-11T20:00:00.000Z");

    const next = projectNextDoseAt({
      latest: null,
      now,
      schedule: { frequency: "weekly" },
      fallbackIntervalDays: 7,
      scheduleAnchor: created,
      timeZone: TZ,
    });

    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("uses a sane 9:00 hour rather than whatever minute the schedule was created at", () => {
    // A real user's schedule was created at 23:26 local; inheriting that hour
    // would have fired their first-ever dose reminder at 11:26 PM.
    const created = new Date("2026-08-04T03:26:59.808Z"); // 23:26 ET Aug 3
    const now = new Date("2026-08-11T02:00:00.000Z");

    const next = projectNextDoseAt({
      latest: null,
      now,
      schedule: { frequency: "weekly" },
      fallbackIntervalDays: 7,
      scheduleAnchor: created,
      timeZone: TZ,
    });

    const localHour = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(next!);
    expect(localHour).toBe("09");
  });

  it("returns null with neither a dose nor a schedule anchor", () => {
    expect(
      projectNextDoseAt({
        latest: null,
        now: new Date("2026-08-11T20:00:00.000Z"),
        schedule: { frequency: "daily", timesOfDay: ["09:00"] },
        timeZone: TZ,
      }),
    ).toBeNull();
  });
});

describe("byte-identical projections for users who HAVE logged a dose", () => {
  const cases = [
    {
      name: "weekly with a stored time",
      schedule: { frequency: "weekly" as const, timesOfDay: ["08:00"], daysOfWeek: [2] },
      latest: { amount: 5, datetime: "2026-08-04T12:00:00.000Z" },
    },
    {
      name: "daily with a stored time",
      schedule: { frequency: "daily" as const, timesOfDay: ["07:30"] },
      latest: { amount: 2, datetime: "2026-08-10T11:30:00.000Z" },
    },
    {
      name: "daily with NO stored time (9:00 default path)",
      schedule: { frequency: "daily" as const },
      latest: { amount: 2, datetime: "2026-08-10T11:30:00.000Z" },
    },
    {
      name: "weekly with no time, daysOfWeek path",
      schedule: { frequency: "weekly" as const, daysOfWeek: [3] },
      latest: { amount: 5, datetime: "2026-08-05T14:00:00.000Z" },
    },
    {
      name: "interval fallback, no schedule",
      schedule: undefined,
      latest: { amount: 5, datetime: "2026-08-05T14:00:00.000Z" },
    },
  ];

  const now = new Date("2026-08-11T20:00:00.000Z");

  for (const testCase of cases) {
    it(`is unaffected by the anchor: ${testCase.name}`, () => {
      const withoutAnchor = projectNextDoseAt({
        latest: testCase.latest,
        now,
        schedule: testCase.schedule,
        fallbackIntervalDays: 7,
        timeZone: TZ,
      });
      const withAnchor = projectNextDoseAt({
        latest: testCase.latest,
        now,
        schedule: testCase.schedule,
        fallbackIntervalDays: 7,
        // A wildly different anchor that must be ignored entirely.
        scheduleAnchor: new Date("2026-01-01T00:00:00.000Z"),
        timeZone: TZ,
      });

      expect(withAnchor?.toISOString() ?? null).toBe(
        withoutAnchor?.toISOString() ?? null,
      );
    });
  }

  it("keeps an overdue dose-anchored projection overdue — no silent roll-forward", () => {
    // The roll-forward is schedule-anchored ONLY. A user who stopped logging
    // keeps the value shipped clients already display.
    const next = projectNextDoseAt({
      latest: { amount: 5, datetime: "2026-06-01T12:00:00.000Z" },
      now,
      fallbackIntervalDays: 7,
      timeZone: TZ,
    });

    expect(next!.getTime()).toBeLessThan(now.getTime());
    expect(next!.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });
});
