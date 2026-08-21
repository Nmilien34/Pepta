// Deleting a log, which nothing in the app could do until now.
//
// The delete routes have existed the whole time — every consumer already
// filtered deletedAt, and doseCta's comment ("deletedAt is the only delete
// this app performs") described a delete no button reached. These pin the
// wiring: the row disappears before the request lands, comes back if it
// fails, and the derived numbers get refetched when it sticks.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  getHome: vi.fn(),
  getTrack: vi.fn(),
  getProgress: vi.fn(),
  deleteLog: vi.fn(),
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
    listSchedules: vi.fn(async () => []),
    listCycles: vi.fn(async () => []),
  },
}));
vi.mock('../services/aiConsent', () => ({
  hasAIDataSharingConsent: vi.fn(async () => false),
}));

import { PeptaDataProvider, usePeptaData } from './PeptaDataContext';

const trackFixture = () => ({
  doseLogs: [
    { id: 'd1', compoundId: 'c1', amount: 5, unit: 'mg', datetime: '2026-08-13T09:00:00.000Z', deletedAt: null },
  ],
  waterLogs: [
    { id: 'h1', amountOz: 8, datetime: '2026-08-13T10:00:00.000Z', deletedAt: null },
    { id: 'h2', amountOz: 8, datetime: '2026-08-13T11:00:00.000Z', deletedAt: null },
  ],
  mealLogs: [],
  proteinLogs: [],
  activityLogs: [],
  sideEffectLogs: [],
  weightLogs: [],
  fiberLogs: [],
  measurements: [],
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
  // The provider does not fetch on mount — screens ask for what they need.
  await act(async () => {
    await handle.refreshTrack();
  });
}

/**
 * Holds the delete in flight so the OPTIMISTIC state is observable. Once it
 * resolves, deleteLog refetches and the server's truth replaces the mark —
 * which is correct, and also means a plain await sees only the end state.
 */
function pendingDelete() {
  let settle!: (value: unknown) => void;
  mocks.deleteLog.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
  return () => settle({});
}

const doseRow = () => handle.track!.doseLogs.find((row) => row.id === 'd1')!;

beforeEach(async () => {
  mocks.storage.clear();
  vi.clearAllMocks();
  mocks.getHome.mockResolvedValue({ activeCompounds: [], medicationLevels: [] });
  mocks.getTrack.mockResolvedValue(trackFixture());
  mocks.getProgress.mockResolvedValue({ weights: [], measurements: [], photos: [] });
  mocks.deleteLog.mockResolvedValue({});
});

describe('deleteLog', () => {
  it('marks the row deleted before the request lands', async () => {
    await mount();
    const land = pendingDelete();

    let done!: Promise<boolean>;
    await act(async () => {
      done = handle.deleteLog('dose', 'd1');
    });

    // Every consumer already filters deletedAt, so marking is enough to make
    // it disappear — and rolling back is one field, not a re-insertion at the
    // right index of the right array.
    expect(doseRow().deletedAt).not.toBeNull();

    await act(async () => {
      land();
      await done;
    });
  });

  it('lets the server\'s truth replace the mark once it sticks', async () => {
    await mount();
    // The refetch after a successful delete returns the row already gone,
    // because the backend excludes soft-deleted rows from every query.
    mocks.getTrack.mockResolvedValue({ ...trackFixture(), doseLogs: [] });

    await act(async () => {
      await handle.deleteLog('dose', 'd1');
    });

    expect(handle.track!.doseLogs).toHaveLength(0);
  });

  it('calls the route for the kind it was given', async () => {
    await mount();
    await act(async () => {
      await handle.deleteLog('water', 'h1');
    });

    expect(mocks.deleteLog).toHaveBeenCalledWith('water', 'h1');
  });

  it('touches only the row asked for', async () => {
    await mount();
    const land = pendingDelete();

    let done!: Promise<boolean>;
    await act(async () => {
      done = handle.deleteLog('water', 'h1');
    });

    const water = handle.track!.waterLogs;
    expect(water.find((row) => row.id === 'h1')!.deletedAt).not.toBeNull();
    expect(water.find((row) => row.id === 'h2')!.deletedAt).toBeNull();

    await act(async () => {
      land();
      await done;
    });
  });

  it('puts the row back when the server refuses, and says it failed', async () => {
    mocks.deleteLog.mockRejectedValue(new Error('offline'));
    await mount();

    let stuck = true;
    await act(async () => {
      stuck = await handle.deleteLog('dose', 'd1');
    });

    expect(stuck).toBe(false);
    expect(doseRow().deletedAt).toBeNull();
  });

  it('refetches what the server derives — totals and the curve are not local', async () => {
    await mount();
    const before = mocks.getHome.mock.calls.length;

    await act(async () => {
      await handle.deleteLog('dose', 'd1');
    });

    expect(mocks.getHome.mock.calls.length).toBeGreaterThan(before);
  });

  it('refetches nothing when the delete failed', async () => {
    mocks.deleteLog.mockRejectedValue(new Error('offline'));
    await mount();
    const before = mocks.getHome.mock.calls.length;

    await act(async () => {
      await handle.deleteLog('dose', 'd1');
    });

    expect(mocks.getHome.mock.calls.length).toBe(before);
  });

  it('reports success so the sheet knows whether to close', async () => {
    await mount();

    let stuck = false;
    await act(async () => {
      stuck = await handle.deleteLog('dose', 'd1');
    });

    expect(stuck).toBe(true);
  });
});
