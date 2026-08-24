// The sync pass, with HealthKit and the API both mocked.
//
// healthDay.test.ts pins WHAT gets written; this pins WHEN and HOW — the
// gates (off, throttled, android), the idempotent create, the in-place
// update, and the rule that a failed pass is quiet and retried, never thrown
// into the app.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  createActivityLog: vi.fn(async () => ({})),
  patchActivityLog: vi.fn(async () => ({})),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => mocks.storage.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void mocks.storage.set(k, v)),
    removeItem: vi.fn(async (k: string) => void mocks.storage.delete(k)),
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('react-native-health', () => ({
  default: {
    Constants: { Permissions: { Steps: 'Steps', StepCount: 'StepCount', Workout: 'Workout' } },
    initHealthKit: vi.fn(),
    getStepCount: vi.fn(),
    getAnchoredWorkouts: vi.fn(),
  },
}));
vi.mock('./api', () => ({
  api: {
    createActivityLog: mocks.createActivityLog,
    patchActivityLog: mocks.patchActivityLog,
  },
}));

import { maybeSyncHealth } from './healthSync';
import { HEALTH_NOTE } from './healthDay';

const NOW = new Date(2026, 7, 24, 21, 0, 0);

const deps = (over: Record<string, unknown> = {}) => ({
  getRows: () => [],
  onWrote: vi.fn(),
  now: NOW,
  isEnabled: async () => true,
  readSnapshot: async () => ({ steps: 5200, workoutMinutes: 0, hadStrength: false }),
  ...over,
});

beforeEach(() => {
  mocks.storage.clear();
  mocks.createActivityLog.mockClear().mockResolvedValue({});
  mocks.patchActivityLog.mockClear().mockResolvedValue({});
});

describe('the gates', () => {
  it('does nothing while sync is off', async () => {
    const d = deps({ isEnabled: async () => false, readSnapshot: vi.fn() });
    await maybeSyncHealth(d as never);

    expect(d.readSnapshot).not.toHaveBeenCalled();
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
  });

  it('throttles — a second trigger inside the window reads nothing', async () => {
    // Foreground events cluster (unlock, notification, app switch). One pass
    // per window; the claim is written BEFORE the reads so two triggers
    // racing the throttle cannot both proceed.
    const first = deps();
    await maybeSyncHealth(first as never);
    const second = deps({ readSnapshot: vi.fn() });
    await maybeSyncHealth(second as never);

    expect(second.readSnapshot).not.toHaveBeenCalled();
    expect(mocks.createActivityLog).toHaveBeenCalledTimes(1);
  });
});

describe('the writes', () => {
  it('creates with the per-day idempotency key', async () => {
    await maybeSyncHealth(deps() as never);

    expect(mocks.createActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: 5200,
        notes: HEALTH_NOTE,
        // One create per local day can ever succeed, even across devices.
        idempotencyKey: 'health-2026-08-24',
      }),
    );
  });

  it('updates the existing health row in place', async () => {
    const d = deps({
      getRows: () => [
        {
          id: 'h1',
          datetime: new Date(2026, 7, 24, 12, 0, 0).toISOString(),
          deletedAt: null,
          steps: 4000,
          resistanceTraining: false,
          notes: HEALTH_NOTE,
        },
      ],
    });
    await maybeSyncHealth(d as never);

    expect(mocks.patchActivityLog).toHaveBeenCalledWith('h1', expect.objectContaining({ steps: 5200 }));
    expect(mocks.createActivityLog).not.toHaveBeenCalled();
    expect(d.onWrote).toHaveBeenCalled();
  });

  it('writes nothing for an empty day, and does not report a write', async () => {
    const d = deps({ readSnapshot: async () => ({ steps: 0, workoutMinutes: 0, hadStrength: false }) });
    await maybeSyncHealth(d as never);

    expect(mocks.createActivityLog).not.toHaveBeenCalled();
    expect(d.onWrote).not.toHaveBeenCalled();
  });
});

describe('failure is quiet', () => {
  it('a rejected create never throws into the app, and still refetches', async () => {
    // The idempotency 409 lands here: losing the race to another device IS
    // success — the refetch picks up the winner's row and the next pass
    // updates it.
    mocks.createActivityLog.mockRejectedValue(new Error('409 idempotency key already used'));
    const d = deps();

    await expect(maybeSyncHealth(d as never)).resolves.toBeUndefined();
    expect(d.onWrote).toHaveBeenCalled();
  });
});
