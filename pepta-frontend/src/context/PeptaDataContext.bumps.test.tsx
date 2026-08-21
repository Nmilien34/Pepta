// The Home steppers' minus buttons were decorative: they moved the number and
// returned before persisting anything, so the next refresh silently restored
// the old total. These pin minus to a real deletion of the log it undoes.

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
});

describe('bumpWater(-n)', () => {
  it('deletes the most recent matching log from today', async () => {
    await mount();

    await act(async () => {
      handle.bumpWater(-8);
      await Promise.resolve();
    });

    expect(mocks.deleteLog).toHaveBeenCalledWith('water', 'w-late');
  });

  it('drops the displayed total while the delete is in flight', async () => {
    await mount();
    let settle!: (value: unknown) => void;
    mocks.deleteLog.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    await act(async () => {
      handle.bumpWater(-8);
      await Promise.resolve();
    });

    expect(handle.home!.todayWaterOz).toBe(8);

    await act(async () => {
      settle({});
    });
  });

  it('puts the total back when the delete fails', async () => {
    mocks.deleteLog.mockRejectedValue(new Error('offline'));
    await mount();

    await act(async () => {
      handle.bumpWater(-8);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handle.home!.todayWaterOz).toBe(16);
  });

  it('does nothing at all when there is no matching log to undo', async () => {
    // A 16oz quick-log row must not be destroyed by a -8 tap, and the number
    // must not move to claim otherwise.
    mocks.getTrack.mockResolvedValue({
      ...trackFixture(),
      waterLogs: [{ id: 'w-big', amountOz: 16, datetime: todayAt(9), deletedAt: null }],
    });
    await mount();

    await act(async () => {
      handle.bumpWater(-8);
      await Promise.resolve();
    });

    expect(mocks.deleteLog).not.toHaveBeenCalled();
    expect(handle.home!.todayWaterOz).toBe(16);
  });

  it('never writes a new log for a minus tap', async () => {
    await mount();

    await act(async () => {
      handle.bumpWater(-8);
      await Promise.resolve();
    });

    expect(mocks.createWaterLog).not.toHaveBeenCalled();
  });
});
