import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeptaDataProvider, usePeptaData } from "../../context/PeptaDataContext";
import { makeHome } from "../../mocks/home";

// The context uses the api singleton — replace it with controllable mocks.
const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    getHome: vi.fn(),
    getTrack: vi.fn(),
    getProgress: vi.fn(),
    createProteinLog: vi.fn(),
    createWaterLog: vi.fn(),
    createFiberLog: vi.fn(),
    createCompound: vi.fn(),
  },
}));
vi.mock("../../services/api", () => ({ api: mockApi }));

type DataValue = ReturnType<typeof usePeptaData>;

async function renderHarness() {
  let current: DataValue | undefined;
  function Harness() {
    current = usePeptaData();
    return null;
  }
  await act(async () => {
    TestRenderer.create(
      <PeptaDataProvider>
        <Harness />
      </PeptaDataProvider>,
    );
  });
  return {
    value: (): DataValue => {
      if (!current) throw new Error("Pepta data context did not render");
      return current;
    },
  };
}

// Render + load home so optimistic-bump tests start from known totals.
async function renderWithHome(home = makeHome()) {
  mockApi.getHome.mockResolvedValue(home);
  const harness = await renderHarness();
  await act(async () => {
    await harness.value().refreshHome();
  });
  return harness;
}

const flush = () => act(async () => { await Promise.resolve(); });

describe("PeptaDataContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads home on refresh and clears loading/error", async () => {
    mockApi.getHome.mockResolvedValue(makeHome({ todayProteinGrams: 88 }));
    const harness = await renderHarness();

    await act(async () => {
      await harness.value().refreshHome();
    });

    expect(harness.value().home?.todayProteinGrams).toBe(88);
    expect(harness.value().homeLoading).toBe(false);
    expect(harness.value().homeError).toBeNull();
  });

  it("surfaces a homeError when the home fetch fails (and keeps home null)", async () => {
    mockApi.getHome.mockRejectedValue(new Error("Pepta API request failed: 500"));
    const harness = await renderHarness();

    await act(async () => {
      await harness.value().refreshHome();
    });

    expect(harness.value().home).toBeNull();
    expect(harness.value().homeError).toBeTruthy();
    expect(harness.value().homeLoading).toBe(false);
  });

  it("optimistically increments protein and persists a log", async () => {
    const harness = await renderWithHome(makeHome({ todayProteinGrams: 40 }));
    mockApi.createProteinLog.mockResolvedValue(undefined);

    await act(async () => {
      harness.value().bumpProtein(20);
    });

    expect(harness.value().home?.todayProteinGrams).toBe(60);
    expect(mockApi.createProteinLog).toHaveBeenCalledWith(
      expect.objectContaining({ grams: 20 }),
    );
  });

  it("rolls the protein total back if the log POST fails", async () => {
    const harness = await renderWithHome(makeHome({ todayProteinGrams: 40 }));
    // Defer the rejection so we can observe the optimistic value first.
    let reject: (() => void) | undefined;
    mockApi.createProteinLog.mockReturnValue(
      new Promise((_resolve, rej) => {
        reject = () => rej(new Error("offline"));
      }),
    );

    await act(async () => {
      harness.value().bumpProtein(20);
    });
    expect(harness.value().home?.todayProteinGrams).toBe(60); // optimistic

    await act(async () => {
      reject?.();
      await Promise.resolve();
    });
    await flush();

    expect(harness.value().home?.todayProteinGrams).toBe(40); // reverted
  });

  it("folds a logged meal into today's macro totals and meal history", async () => {
    const harness = await renderWithHome(
      makeHome({ todayProteinGrams: 40, todayCalories: 500, todayFiberGrams: 10 }),
    );

    await act(async () => {
      harness.value().addMeal({
        foodName: "Greek yogurt",
        protein: 18,
        calories: 150,
        fiber: 2,
        source: "manual",
        datetime: "2026-06-23T12:00:00.000Z",
      });
    });

    expect(harness.value().home?.todayProteinGrams).toBe(58);
    expect(harness.value().home?.todayCalories).toBe(650);
    expect(harness.value().home?.todayFiberGrams).toBe(12);
    expect(harness.value().track?.mealLogs[0]).toMatchObject({
      foodName: "Greek yogurt",
      protein: 18,
      calories: 150,
      fiber: 2,
      source: "manual",
      datetime: "2026-06-23T12:00:00.000Z",
      deletedAt: null,
    });
  });
});
