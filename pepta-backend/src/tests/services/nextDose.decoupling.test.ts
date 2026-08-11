// Scheduling is a property of the SCHEDULE, not of the PK model (2026-08-11).
// getMedicationLevels skips compounds with no half-life, and home.nextDose used
// to be derived from it — so a custom medication got no countdown and no
// dose_due reminder. These pin the decoupling AND that it changed nothing for
// modelled compounds.

import { describe, expect, it } from "vitest";
import { computeMedicationLevel, latestDose, projectNextDoseAt } from "../../lib/pharmacokinetics";

const TZ = "America/New_York";

function project(opts: {
  doses: Array<{ amount: number; datetime: string }>;
  now: Date;
  schedule?: Parameters<typeof projectNextDoseAt>[0]["schedule"];
  intervalDays?: number;
}) {
  return projectNextDoseAt({
    latest: latestDose(opts.doses),
    now: opts.now,
    schedule: opts.schedule,
    fallbackIntervalDays: opts.intervalDays,
    timeZone: TZ,
  });
}

describe("nextDose decoupled from the level model", () => {
  it("BYTE-IDENTICAL for modelled compounds — this is a decoupling, not a re-derivation", () => {
    // Every shape the level engine supports, projected both ways.
    const cases = [
      {
        name: "weekly with dose times",
        doses: [{ amount: 10, datetime: "2026-08-02T15:47:00.000Z" }],
        now: new Date("2026-08-04T00:00:00.000Z"),
        schedule: { frequency: "weekly" as const, daysOfWeek: [6], timesOfDay: ["09:00"] },
        intervalDays: 7,
        halfLifeDays: 7,
      },
      {
        name: "weekly interval only",
        doses: [{ amount: 10, datetime: "2026-08-02T14:00:00.000Z" }],
        now: new Date("2026-08-06T20:00:00.000Z"),
        schedule: { frequency: "weekly" as const },
        intervalDays: 7,
        halfLifeDays: 7,
      },
      {
        name: "biweekly",
        doses: [{ amount: 10, datetime: "2026-08-02T14:00:00.000Z" }],
        now: new Date("2026-08-06T20:00:00.000Z"),
        schedule: { frequency: "biweekly" as const },
        intervalDays: 14,
        halfLifeDays: 7,
      },
      {
        name: "daily, no stored time (9am default)",
        doses: [{ amount: 7, datetime: "2026-08-06T12:00:00.000Z" }],
        now: new Date("2026-08-06T12:30:00.000Z"),
        schedule: { frequency: "daily" as const },
        intervalDays: 1,
        halfLifeDays: 1,
      },
      {
        name: "daily split dosing",
        doses: [{ amount: 0.25, datetime: "2026-06-24T12:05:00.000Z" }],
        now: new Date("2026-06-24T12:30:00.000Z"),
        schedule: { frequency: "daily" as const, timesOfDay: ["08:00", "20:00"] },
        intervalDays: 1,
        halfLifeDays: 1,
      },
      {
        name: "no doses logged yet",
        doses: [],
        now: new Date("2026-08-06T12:30:00.000Z"),
        schedule: { frequency: "weekly" as const },
        intervalDays: 7,
        halfLifeDays: 7,
      },
    ];

    for (const c of cases) {
      const viaLevels = computeMedicationLevel({
        compoundId: "c1",
        compoundName: c.name,
        halfLifeDays: c.halfLifeDays,
        doses: c.doses,
        now: c.now,
        scheduleIntervalDays: c.intervalDays,
        schedule: c.schedule,
        timeZone: TZ,
      });
      const direct = project(c);
      expect({ case: c.name, at: direct?.toISOString() ?? null }).toEqual({
        case: c.name,
        at: viaLevels.nextDoseAt,
      });
    }
  });

  it("an UNMODELLED daily compound still projects — the whole point", () => {
    // No half-life anywhere in this call; the level engine could not have
    // produced this at all.
    const next = project({
      doses: [{ amount: 2.5, datetime: "2026-08-10T22:00:00.000Z" }],
      now: new Date("2026-08-10T23:00:00.000Z"),
      schedule: { frequency: "daily", timesOfDay: ["09:00"] },
      intervalDays: 1,
    });
    // 09:00 EDT the next morning = 13:00Z.
    expect(next?.toISOString()).toBe("2026-08-11T13:00:00.000Z");
  });

  it("an unmodelled daily compound with NO stored time falls to the 9am local default", () => {
    const next = project({
      doses: [{ amount: 2, datetime: "2026-08-10T18:00:00.000Z" }],
      now: new Date("2026-08-10T19:00:00.000Z"),
      schedule: { frequency: "daily" },
      intervalDays: 1,
    });
    expect(next?.toISOString()).toBe("2026-08-11T13:00:00.000Z");
  });

  it("projects nothing before a first dose is logged — no phantom reminder", () => {
    expect(
      project({
        doses: [],
        now: new Date("2026-08-10T19:00:00.000Z"),
        schedule: { frequency: "daily", timesOfDay: ["09:00"] },
        intervalDays: 1,
      }),
    ).toBeNull();
  });

  it("soonest-across-both: an unmodelled daily beats a modelled weekly", () => {
    const now = new Date("2026-08-10T23:00:00.000Z");
    const unmodelledDaily = project({
      doses: [{ amount: 2.5, datetime: "2026-08-10T22:00:00.000Z" }],
      now,
      schedule: { frequency: "daily", timesOfDay: ["09:00"] },
      intervalDays: 1,
    })!;
    const modelledWeekly = project({
      doses: [{ amount: 10, datetime: "2026-08-09T14:00:00.000Z" }],
      now,
      schedule: { frequency: "weekly" },
      intervalDays: 7,
    })!;
    const soonest = [unmodelledDaily, modelledWeekly].sort((a, b) => a.getTime() - b.getTime())[0]!;
    expect(soonest.toISOString()).toBe(unmodelledDaily.toISOString());
    expect(unmodelledDaily.getTime()).toBeLessThan(modelledWeekly.getTime());
  });
});
