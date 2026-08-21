// /home carries two sets of nutrition numbers and they mean different things:
// rangeTotals is the window the user picked, and today* is always today.
//
// The client depends on that split. todayStat() in screens/app/homeView.ts is
// documented as "TODAY's number against TODAY's target, whatever range Home is
// showing", and the Protein/Water/Fiber screens, the widget preview and the
// report export all read the today* fields. Wiring them to the selected range
// made Monthly show a month of grams against a daily target.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mealFind: vi.fn(),
  proteinFind: vi.fn(),
  fiberFind: vi.fn(),
  waterFind: vi.fn(),
  activityFind: vi.fn(),
  weightFind: vi.fn(),
  compoundFind: vi.fn(),
  profileFindOne: vi.fn(),
  doseFind: vi.fn(),
}));

vi.mock("../../models", () => {
  const chain = (rows: unknown[]) => {
    const result: Record<string, unknown> = {
      sort: () => result,
      limit: () => result,
      select: () => result,
      lean: () => Promise.resolve(rows),
      exec: () => Promise.resolve(rows),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return result;
  };
  return {
    MealLogModel: { find: (...a: unknown[]) => chain(mocks.mealFind(...a)) },
    ProteinLogModel: { find: (...a: unknown[]) => chain(mocks.proteinFind(...a)) },
    FiberLogModel: { find: (...a: unknown[]) => chain(mocks.fiberFind(...a)) },
    WaterLogModel: { find: (...a: unknown[]) => chain(mocks.waterFind(...a)) },
    ActivityLogModel: { find: (...a: unknown[]) => chain(mocks.activityFind(...a)) },
    WeightLogModel: { find: () => chain(mocks.weightFind()) },
    CompoundModel: { find: () => chain(mocks.compoundFind()) },
    DoseLogModel: { find: () => chain(mocks.doseFind()) },
    UserProfileModel: { findOne: () => chain(mocks.profileFindOne()) },
  };
});

// Everything /home composes that is not the nutrition arithmetic under test.
vi.mock("../../services/insights.service", () => ({ getInsights: async () => [] }));
vi.mock("../../services/medication-level.service", () => ({
  getMedicationLevels: async () => [],
  getNextDoseCandidates: async () => [],
}));
vi.mock("../../services/muscle-retention.service", () => ({
  getWeeklyRetention: async () => null,
}));

import { getHome } from "../../services/home.service";

const NOW = new Date("2026-08-20T18:00:00.000Z");

/** One meal per day for 30 days, plus one more today. */
function meals() {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    datetime: new Date(NOW.getTime() - (i + 1) * 24 * 60 * 60 * 1000),
    protein: 100,
    calories: 800,
    fiber: 5,
  }));
  rows.push({ datetime: NOW, protein: 40, calories: 300, fiber: 2 });
  return rows;
}

/** getRangeTotals filters by datetime; the mock does the same by hand. */
function within(rows: { datetime: Date }[], filter: Record<string, unknown>) {
  const range = (filter.datetime ?? {}) as { $gte?: Date; $lt?: Date };
  return rows.filter(
    (row) =>
      (!range.$gte || row.datetime >= range.$gte) &&
      (!range.$lt || row.datetime < range.$lt),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mealFind.mockImplementation((filter: Record<string, unknown>) =>
    within(meals(), filter),
  );
  mocks.proteinFind.mockReturnValue([]);
  mocks.fiberFind.mockReturnValue([]);
  mocks.waterFind.mockReturnValue([]);
  mocks.activityFind.mockReturnValue([]);
  mocks.weightFind.mockReturnValue([]);
  mocks.compoundFind.mockReturnValue([]);
  mocks.doseFind.mockReturnValue([]);
  mocks.profileFindOne.mockReturnValue(null);
});

describe("the today* fields on /home", () => {
  it("carry TODAY's totals even when Home is showing the month", async () => {
    const home = await getHome("user-1", NOW, "month", { tz: "UTC" });

    // Today's single meal — not the month's 31.
    expect(home.todayProteinGrams).toBe(40);
    expect(home.todayCalories).toBe(300);
    expect(home.todayFiberGrams).toBe(2);
  });

  it("are unchanged by the range the user picked", async () => {
    const onToday = await getHome("user-1", NOW, "today", { tz: "UTC" });
    const onYear = await getHome("user-1", NOW, "year", { tz: "UTC" });

    expect(onYear.todayProteinGrams).toBe(onToday.todayProteinGrams);
    expect(onYear.todayCalories).toBe(onToday.todayCalories);
  });

  it("are NOT the range totals — rangeTotals is where those live", async () => {
    const home = await getHome("user-1", NOW, "month", { tz: "UTC" });

    // The month holds every back-dated meal plus today's; today holds one.
    // If the wiring regresses the two become equal, and the Protein screen
    // starts reading a month of grams against a daily target.
    expect(home.todayProteinGrams).toBe(40);
    expect(home.rangeTotals?.proteinGrams).toBeGreaterThan(2000);
    expect(home.rangeTotals?.proteinGrams).not.toBe(home.todayProteinGrams);
  });
});
