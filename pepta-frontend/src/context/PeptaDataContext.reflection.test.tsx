// Every log must land in the store the SCREENS read, not just the one that
// happens to hold the number the tap moved.
//
// Home's streak bars, its 28-day dots, its "logged today" state and its recent
// log chips are all derived from track.<kind>Logs — never from home's running
// totals. So a plus that only moves a home total leaves every one of those
// surfaces showing a day with nothing in it, which is the same class of defect
// as the steps bug: the write succeeds and the screen disagrees.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  getHome: vi.fn(),
  getTrack: vi.fn(),
  getProgress: vi.fn(),
  deleteLog: vi.fn(),
  createWaterLog: vi.fn(),
  createProteinLog: vi.fn(),
  createFiberLog: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void mocks.storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void mocks.storage.delete(k)),
  },
}));
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('../services/api', () => ({
  api: {
    getHome: mocks.getHome,
    getTrack: mocks.getTrack,
    getProgress: mocks.getProgress,
    deleteLog: mocks.deleteLog,
    createWaterLog: mocks.createWaterLog,
    createProteinLog: mocks.createProteinLog,
    createFiberLog: mocks.createFiberLog,
    listSchedules: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
  },
}));
vi.mock('../services/aiConsent', () => ({
  hasAIDataSharingConsent: vi.fn(async () => false),
}));

import { PeptaDataProvider, usePeptaData } from './PeptaDataContext';

/** Local-today timestamps — pickLogToUndo matches on the device's calendar day. */
const todayAt = (hour: number) => {
  const at = new Date();
  at.setHours(hour, 0, 0, 0);
  return at.toISOString();
};

const homeFixture = () => ({
  activeCompounds: [],
  medicationLevels: [],
  todayWaterOz: 16,
  todayProteinGrams: 0,
  todayFiberGrams: 0,
});

const trackFixture = () => ({
  doseLogs: [],
  mealLogs: [],
  proteinLogs: [],
  activityLogs: [],
  sideEffectLogs: [],
  weightLogs: [],
  fiberLogs: [],
  measurements: [],
  waterLogs: [
    { id: 'w-early', amountOz: 8, datetime: todayAt(9), deletedAt: null },
    { id: 'w-late', amountOz: 8, datetime: todayAt(11), deletedAt: null },
  ],
  sectionErrors: {},
});

/** undoBump may await a Track refresh, and trackRef is assigned during render,
 *  so the fix needs a macrotask + a render to be observable — counting
 *  microtasks is not enough. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

type Handle = ReturnType<typeof usePeptaData>;
let handle!: Handle;
function Probe() {
  handle = usePeptaData();
  return null;
}

async function mount() {
  await act(async () => {
    TestRenderer.create(
      <PeptaDataProvider>
        <Probe />
      </PeptaDataProvider>,
    );
  });
  await act(async () => {
    await Promise.all([handle.refreshHome(), handle.refreshTrack()]);
  });
}

beforeEach(() => {
  mocks.storage.clear();
  vi.clearAllMocks();
  mocks.getHome.mockResolvedValue(homeFixture());
  mocks.getTrack.mockResolvedValue(trackFixture());
  mocks.getProgress.mockResolvedValue({ weights: [], measurements: [], photos: [] });
  mocks.deleteLog.mockResolvedValue({});
  mocks.createWaterLog.mockResolvedValue({});
  mocks.createProteinLog.mockResolvedValue({});
  mocks.createFiberLog.mockResolvedValue({});
});

describe('a logged amount reaches the store the bars read', () => {
  // Home's streak bars, its 28-day dots, "logged today" and the recent-log
  // chips all read track.<kind>Logs. home.todayWaterOz feeds only the ring.
  // The row therefore has to be in track the INSTANT the tap lands — waiting
  // for the network is what made a save look lost.
  //
  // Asserted synchronously, before any await: an async act() would flush the
  // post-save refresh, and that refresh is a different behaviour (below).
  it('puts water in track immediately, not just in the ring', async () => {
    await mount();
    const before = handle.track!.waterLogs.length;

    act(() => {
      handle.bumpWater(12);
    });

    expect(handle.home!.todayWaterOz).toBe(28); // ring moved: 16 + 12
    expect(handle.track!.waterLogs.length).toBe(before + 1);
    expect(handle.track!.waterLogs.some((w) => w.amountOz === 12)).toBe(true);
  });

  it('puts protein in track immediately', async () => {
    await mount();
    act(() => {
      handle.bumpProtein(30);
    });
    expect(handle.track!.proteinLogs.some((p) => p.grams === 30)).toBe(true);
  });

  it('puts fibre in track immediately', async () => {
    await mount();
    act(() => {
      handle.bumpFiber(9);
    });
    expect(handle.track!.fiberLogs.some((f) => f.grams === 9)).toBe(true);
  });

  // A day whose only entry is water still has to count as a day the user
  // logged: the streak is built from track, so an empty track silently skips
  // today no matter what the ring says.
  it('counts a water-only day as logged', async () => {
    mocks.getTrack.mockResolvedValue({ ...trackFixture(), waterLogs: [] });
    await mount();

    act(() => {
      handle.bumpWater(8);
    });

    expect(handle.track!.waterLogs.length).toBeGreaterThan(0);
  });

  // The temp id has to become a real one, or the minus button would later try
  // to delete "temp-..." and 404. A save pulls server truth for exactly that.
  it('reconciles the temp row to the server row after saving', async () => {
    await mount();
    const served = {
      ...trackFixture(),
      waterLogs: [
        { id: 'w-real', amountOz: 12, datetime: todayAt(13), deletedAt: null },
      ],
    };
    mocks.getTrack.mockResolvedValue(served);

    await act(async () => {
      handle.bumpWater(12);
    });
    await settle();

    const rows = handle.track!.waterLogs;
    expect(rows.some((w) => w.id === 'w-real')).toBe(true);
    expect(rows.some((w) => String(w.id).startsWith('temp-'))).toBe(false);
  });
});

describe('a measurement reaches both surfaces that show it', () => {
  // ProgressScreen renders progress.measurements; the Track feed renders
  // track.measurements (activityFeed.ts). Writing only to progress leaves the
  // Track feed missing an entry the user just made.
  it('lands in track as well as progress', async () => {
    await mount();
    // mount() pulls home and track only; this assertion needs progress too.
    await act(async () => {
      await handle.refreshProgress();
    });
    const input = {
      type: 'waist' as const,
      value: 34,
      unit: 'in',
      datetime: todayAt(10),
    };

    act(() => {
      handle.addMeasurement(input);
    });

    expect(handle.progress!.measurements.some((m) => m.value === 34)).toBe(true);
    expect(handle.track!.measurements.some((m) => m.value === 34)).toBe(true);
  });
});
