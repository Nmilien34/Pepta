// The chart's window, end to end.
//
// The segmented control this feeds was removed from Track because it was
// decoration: a View with no onPress, hardcoded to its first option, over a
// curve the backend only ever drew +/-7 days. Every option now has to come
// back with the span it names, from real dose logs — these pin that, and pin
// that /home's own levels did not move as a side effect.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compoundFind: vi.fn(),
  cycleFind: vi.fn(),
  doseFind: vi.fn(),
  doseFindOne: vi.fn(),
  scheduleFindOne: vi.fn(),
  profileFindOne: vi.fn(),
}));

vi.mock("../../models", () => ({
  CompoundModel: { find: mocks.compoundFind },
  CycleModel: { find: mocks.cycleFind },
  DoseLogModel: { find: mocks.doseFind, findOne: mocks.doseFindOne },
  ScheduleModel: { findOne: mocks.scheduleFindOne },
  UserProfileModel: { findOne: mocks.profileFindOne },
}));

import {
  getMedicationLevels,
  getMedicationLevelsForRange,
} from "../../services/medication-level.service";

const USER = "507f1f77bcf86cd799439011";
const NOW = new Date("2026-08-19T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/** A weekly injector, dosing every 7 days for the past year. */
function weeklyDoses(count: number, from = NOW) {
  return Array.from({ length: count }, (_, i) => ({
    amount: 5,
    datetime: new Date(from.getTime() - (i + 1) * 7 * DAY),
  }));
}

function setup(doses: { amount: number; datetime: Date }[]) {
  mocks.compoundFind.mockReturnValue({
    sort: () =>
      Promise.resolve([
        { _id: { toString: () => "c1" }, name: "Tirzepatide", halfLifeDays: 5 },
      ]),
  });
  mocks.cycleFind.mockReturnValue({ sort: () => Promise.resolve([]) });
  // DoseLogModel.find serves two callers here: the level engine awaits
  // .sort(...) directly, the marker query chains .select().exec(). One mock,
  // both shapes, or the tests only exercise whichever was written last.
  const rows = doses.map((d) => ({ ...d, compoundId: { toString: () => "c1" } }));
  const chain = {
    select: () => ({ exec: () => Promise.resolve(rows) }),
    then: (resolve: (value: typeof rows) => unknown) => Promise.resolve(rows).then(resolve),
  };
  mocks.doseFind.mockReturnValue({ sort: () => chain });
  const first = [...doses].sort((a, b) => a.datetime.getTime() - b.datetime.getTime())[0];
  mocks.doseFindOne.mockReturnValue({
    sort: () => ({ select: () => ({ exec: () => Promise.resolve(first ?? null) }) }),
  });
  mocks.scheduleFindOne.mockReturnValue({
    sort: () => Promise.resolve({ frequency: "weekly", intervalDays: 7 }),
  });
  mocks.profileFindOne.mockReturnValue({ select: () => Promise.resolve({ timezone: "UTC" }) });
}

const spanDays = (curve: { datetime: string }[]) => {
  const times = curve.map((p) => new Date(p.datetime).getTime());
  return (Math.max(...times) - Math.min(...times)) / DAY;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the window a range actually draws", () => {
  it("gives each option the span its label promises", async () => {
    setup(weeklyDoses(60));

    for (const [range, before] of [
      ["week", 7],
      ["month", 30],
      ["quarter", 90],
    ] as const) {
      const out = await getMedicationLevelsForRange(USER, range, NOW);
      expect(out.range).toBe(range);
      expect(out.daysBefore).toBe(before);
      // Rounded to the sample grid, and the window starts at UTC midnight, so
      // the span covers the promise rather than landing exactly on it.
      expect(spanDays(out.levels[0]!.curve)).toBeGreaterThanOrEqual(before + 13);
    }
  });

  it("runs 'all' from the first dose the user logged", async () => {
    setup(weeklyDoses(20)); // oldest is 140 days back

    const out = await getMedicationLevelsForRange(USER, "all", NOW);

    expect(out.daysBefore).toBe(140);
    expect(spanDays(out.levels[0]!.curve)).toBeGreaterThanOrEqual(140);
  });

  it("floors 'all' at a week, so a first-day account gets a chart not a sliver", async () => {
    setup([{ amount: 5, datetime: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) }]);

    const out = await getMedicationLevelsForRange(USER, "all", NOW);

    expect(out.daysBefore).toBe(7);
  });

  it("caps 'all', so one backdated dose cannot squeeze this year into a pixel", async () => {
    setup([{ amount: 5, datetime: new Date("2019-01-01T00:00:00.000Z") }]);

    const out = await getMedicationLevelsForRange(USER, "all", NOW);

    expect(out.daysBefore).toBe(730);
  });

  it("still answers with a window when nothing has been logged at all", async () => {
    setup([]);

    const out = await getMedicationLevelsForRange(USER, "all", NOW);

    expect(out.daysBefore).toBe(7);
    expect(out.levels).toHaveLength(1);
  });
});

describe("the cost of a wide window", () => {
  it("coarsens the sampling rather than returning a point every 6 hours", async () => {
    setup(weeklyDoses(60));

    const quarter = await getMedicationLevelsForRange(USER, "quarter", NOW);

    // 90+14 days at 6h would be 416 points, most of them the same decay.
    expect(quarter.levels[0]!.curve.length).toBeLessThan(260);
  });

  it("keeps every logged dose as its own sample, so no rise is lost to spacing", async () => {
    const doses = weeklyDoses(12);
    setup(doses);

    const out = await getMedicationLevelsForRange(USER, "quarter", NOW);
    const times = new Set(out.levels[0]!.curve.map((p) => p.datetime));

    for (const dose of doses.filter((d) => d.datetime.getTime() > NOW.getTime() - 90 * DAY)) {
      expect(times.has(dose.datetime.toISOString())).toBe(true);
    }
  });

  it("draws the dose as a step — the sample before it is lower than the sample on it", async () => {
    const doseAt = new Date(NOW.getTime() - 3 * DAY);
    setup([{ amount: 5, datetime: doseAt }]);

    const curve = (await getMedicationLevelsForRange(USER, "quarter", NOW)).levels[0]!.curve;
    const index = curve.findIndex((p) => p.datetime === doseAt.toISOString());

    expect(index).toBeGreaterThan(0);
    expect(curve[index]!.level).toBeGreaterThan(curve[index - 1]!.level);
  });
});

describe("what /home keeps", () => {
  it("is untouched by ranges — the ring's denominator cannot move on a chart tap", async () => {
    // A TAPER, not a steady weekly dose: at steady state the 7-day peak and
    // the 90-day peak are the same number, so a flat schedule cannot tell the
    // two windows apart. Someone coming down from 15 mg can.
    setup(
      Array.from({ length: 12 }, (_, i) => ({
        amount: 15 - i, // oldest dose is the largest
        datetime: new Date(NOW.getTime() - (12 - i) * 7 * DAY),
      })),
    );

    const home = await getMedicationLevels(USER, NOW);
    const quarter = await getMedicationLevelsForRange(USER, "quarter", NOW);

    expect(spanDays(home[0]!.curve)).toBeCloseTo(14, 0);
    // The wider window sees the higher doses; home must not inherit that.
    expect(quarter.levels[0]!.peakEstimate).toBeGreaterThan(home[0]!.peakEstimate);
    // And the one number both must agree on: the level right now.
    expect(home[0]!.currentEstimate).toBe(quarter.levels[0]!.currentEstimate);
  });
});

describe("the markers that explain each rise", () => {
  it("carries the window's own doses, since /track only looks back 30 days", async () => {
    const doses = weeklyDoses(12);
    setup(doses);

    const out = await getMedicationLevelsForRange(USER, "quarter", NOW);

    // Every dose inside 90 days comes back; the ones beyond it do not.
    expect(out.doses.length).toBe(doses.length);
    expect(out.doses[0]).toMatchObject({ compoundId: "c1" });
  });

  it("asks the database for the window, not for everything ever logged", async () => {
    setup(weeklyDoses(12));

    await getMedicationLevelsForRange(USER, "quarter", NOW);

    // The engine's own call has no datetime bound; the marker query is the
    // one that does.
    const markerQuery = mocks.doseFind.mock.calls
      .map((call) => call[0] as { datetime?: { $gte: Date }; deletedAt?: null })
      .find((query) => query.datetime != null) as { datetime: { $gte: Date }; deletedAt: null };
    expect(markerQuery.deletedAt).toBeNull();
    expect(NOW.getTime() - markerQuery.datetime.$gte.getTime()).toBe(90 * DAY);
  });
});
