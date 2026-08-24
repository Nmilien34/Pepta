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

describe('plus then minus — the log you just added is the one that comes off', () => {
  // THE BUG THE USER HIT. saveLog does not refresh Track, so trackRef still
  // predates the plus. Minus then reads that stale copy:
  //
  //   - nothing matches      -> pickLogToUndo returns null, undoBump returns,
  //                             and the tap does NOTHING. The number does not
  //                             move and no request is made.
  //   - an OLDER log matches -> it deletes THAT one. +5g then -5g silently
  //                             destroys a 5g log from this morning.
  //
  // The second is the dangerous one: it is not a dead button, it is real data
  // loss on a control the user reasonably believes is an undo.

  it('removes the just-added log, not an older one with the same amount', async () => {
    // Track knows only about this morning's 8oz. The user logs another 8oz,
    // then immediately takes it back.
    mocks.getTrack.mockResolvedValue({
      ...trackFixture(),
      waterLogs: [{ id: 'w-this-morning', amountOz: 8, datetime: todayAt(9), deletedAt: null }],
    });
    await mount();

    await act(async () => {
      handle.bumpWater(8);
      await Promise.resolve();
    });

    // The server now has the new row; a refresh would show it.
    mocks.getTrack.mockResolvedValue({
      ...trackFixture(),
      waterLogs: [
        { id: 'w-this-morning', amountOz: 8, datetime: todayAt(9), deletedAt: null },
        { id: 'w-just-added', amountOz: 8, datetime: todayAt(14), deletedAt: null },
      ],
    });

    await act(async () => {
      handle.bumpWater(-8);
    });
    await settle();

    expect(mocks.deleteLog).toHaveBeenCalledWith('water', 'w-just-added');
    expect(mocks.deleteLog).not.toHaveBeenCalledWith('water', 'w-this-morning');
  });

  it('still undoes the plus when Track held no matching log at all', async () => {
    // The silent-no-op case: nothing in the stale copy matches, so minus did
    // nothing whatsoever and the button read as broken.
    mocks.getTrack.mockResolvedValue({ ...trackFixture(), waterLogs: [] });
    await mount();

    await act(async () => {
      handle.bumpWater(8);
      await Promise.resolve();
    });

    mocks.getTrack.mockResolvedValue({
      ...trackFixture(),
      waterLogs: [{ id: 'w-fresh', amountOz: 8, datetime: todayAt(14), deletedAt: null }],
    });

    await act(async () => {
      handle.bumpWater(-8);
    });
    await settle();

    expect(mocks.deleteLog).toHaveBeenCalledWith('water', 'w-fresh');
  });
});

describe('addActivityLog', () => {
  it('lands an optimistic row the resistance switch can see immediately', async () => {
    // The switch is CONTROLLED by state derived from track.activityLogs.
    // Before this existed, turning it on wrote to the server and changed
    // nothing locally — the thumb snapped back while the log piled up.
    await mount();

    await act(async () => {
      handle.addActivityLog({ resistanceTraining: true, datetime: todayAt(14) });
    });

    const row = handle.track!.activityLogs[0]!;
    expect(row.resistanceTraining).toBe(true);
    expect(row.deletedAt).toBeNull();
    // Temp id, by design — HomeScreen refuses to DELETE a temp id and pulls
    // truth instead, so the marker matters.
    expect(String(row.id).startsWith('temp-')).toBe(true);
  });
});

describe('refreshProgress with no window asks for EVERYTHING', () => {
  it('never lets the server default decide', async () => {
    // The clobber this pins: the window ref started `undefined`, meaning
    // "server default" — which is 30 days. QuickLog refreshes progress with
    // no argument after a weight save, so logging a weight from Home REPLACED
    // a full-history payload with a 30-day one; Progress then mounted, saw
    // data present, and never refetched. "Since you started" showed 3 days,
    // and a 20 lb loss barely moved the chart.
    await mount();

    await act(async () => {
      await handle.refreshProgress();
    });

    const lastCall = mocks.getProgress.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe(Infinity);
  });
});

describe('addWeightLog reaches every surface that shows weight', () => {
  it('lands in track.weightLogs too — Your log and the streak read it', async () => {
    // The optimistic add covered progress.weights and home.latestWeight but
    // skipped track.weightLogs, and the post-save refresh was home+progress —
    // so a fresh weigh-in was missing from Track's Your log and the streak
    // sheet's Weight row until something unrelated refreshed Track.
    await mount();

    await act(async () => {
      handle.addWeightLog({ value: 180, unit: 'lb', datetime: todayAt(14) });
    });

    const row = handle.track!.weightLogs[0]!;
    expect(row.value).toBe(180);
    expect(row.deletedAt).toBeNull();
  });
});
