// Fetching behaviour for the range control: cache once, never let a slow
// response overwrite a window the user has already moved on from.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getMedicationLevels: vi.fn() }));

vi.mock('../../services/api', () => ({
  api: { getMedicationLevels: mocks.getMedicationLevels },
}));

import { useLevelRange } from './useLevelRange';

type Hook = ReturnType<typeof useLevelRange>;

async function mount(enabled = false) {
  const ref: { current: Hook | null } = { current: null };
  function Probe() {
    ref.current = useLevelRange({ enabled });
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Probe />);
  });
  return () => ref.current!;
}

const response = (range: string) => ({
  range,
  daysBefore: 90,
  daysAfter: 14,
  levels: [{ compoundId: 'c1', curve: [], peakEstimate: 1 }],
});

beforeEach(() => {
  mocks.getMedicationLevels.mockReset().mockImplementation((range: string) =>
    Promise.resolve(response(range)),
  );
});

describe('useLevelRange', () => {
  it('starts on the week and asks for nothing — /home already has it', async () => {
    const hook = await mount();

    expect(hook().range).toBe('week');
    expect(mocks.getMedicationLevels).not.toHaveBeenCalled();
  });

  it('warms the other three on arrival, so no tap has to wait', async () => {
    const hook = await mount(true);

    expect(mocks.getMedicationLevels.mock.calls.map((c) => c[0]).sort()).toEqual([
      'all',
      'month',
      'quarter',
    ]);
    // Quietly: nothing is being waited on, so nothing spins.
    expect(hook().loading).toBe(false);
    expect(hook().failed).toBeNull();
  });

  it('never prefetches the week — /home already carries it', async () => {
    await mount(true);

    expect(mocks.getMedicationLevels).not.toHaveBeenCalledWith('week');
  });

  it('prefetches nothing when there is no curve to window', async () => {
    await mount(false);

    expect(mocks.getMedicationLevels).not.toHaveBeenCalled();
  });

  it('answers a tap instantly from what it warmed — no second request', async () => {
    const hook = await mount(true);
    mocks.getMedicationLevels.mockClear();

    await act(async () => {
      hook().setRange('quarter');
    });

    expect(mocks.getMedicationLevels).not.toHaveBeenCalled();
    expect(hook().loading).toBe(false);
    expect(hook().fetched.quarter).toBeTruthy();
  });

  it('stays quiet when a prefetch fails — nobody asked for that window yet', async () => {
    mocks.getMedicationLevels.mockRejectedValue(new Error('offline'));
    const hook = await mount(true);

    expect(hook().failed).toBeNull();
    expect(hook().loading).toBe(false);
  });

  it('but reports it properly once that window is actually chosen', async () => {
    mocks.getMedicationLevels.mockRejectedValue(new Error('offline'));
    const hook = await mount(true);

    await act(async () => {
      hook().setRange('month');
    });

    expect(hook().failed).toBe('month');
  });

  it('adopts a prefetch already in flight rather than firing a duplicate', async () => {
    let land: (value: unknown) => void = () => undefined;
    mocks.getMedicationLevels.mockImplementation((range: string) =>
      range === 'month' ? new Promise((resolve) => { land = resolve; }) : Promise.resolve(response(range)),
    );
    const hook = await mount(true);
    const before = mocks.getMedicationLevels.mock.calls.length;

    await act(async () => {
      hook().setRange('month');
    });

    expect(mocks.getMedicationLevels).toHaveBeenCalledTimes(before);
    expect(hook().loading).toBe(true);

    await act(async () => {
      land(response('month'));
    });
    expect(hook().loading).toBe(false);
    expect(hook().fetched.month).toBeTruthy();
  });

  it('fetches a wider window when one is chosen', async () => {
    const hook = await mount();
    await act(async () => {
      hook().setRange('quarter');
    });

    expect(mocks.getMedicationLevels).toHaveBeenCalledWith('quarter');
    expect(hook().fetched.quarter).toBeTruthy();
    expect(hook().loading).toBe(false);
  });

  it('never re-requests a window it already holds', async () => {
    const hook = await mount();
    await act(async () => {
      hook().setRange('month');
    });
    await act(async () => {
      hook().setRange('week');
    });
    await act(async () => {
      hook().setRange('month');
    });

    expect(mocks.getMedicationLevels).toHaveBeenCalledTimes(1);
  });

  it('going back to the week costs nothing', async () => {
    const hook = await mount();
    await act(async () => {
      hook().setRange('week');
    });

    expect(mocks.getMedicationLevels).not.toHaveBeenCalled();
  });

  it('a late response never moves the window the user is on', async () => {
    let land: (value: unknown) => void = () => undefined;
    mocks.getMedicationLevels.mockImplementationOnce(
      () => new Promise((resolve) => { land = resolve; }),
    );
    const hook = await mount();

    await act(async () => {
      hook().setRange('month');
    });
    await act(async () => {
      hook().setRange('quarter');
    });
    await act(async () => {
      land(response('month'));
    });

    // It IS kept — that is what makes a prefetch worth anything, and going
    // back to Month is now free. What must not happen is the chart moving:
    // levelRangeView reads by the selected range, never by whatever landed
    // last, so a straggler can only ever fill a cache slot.
    expect(hook().range).toBe('quarter');
    expect(hook().fetched.month).toBeTruthy();
    expect(hook().loading).toBe(false);
  });

  it('reports a failure instead of spinning forever', async () => {
    mocks.getMedicationLevels.mockRejectedValue(new Error('offline'));
    const hook = await mount();

    await act(async () => {
      hook().setRange('all');
    });

    expect(hook().loading).toBe(false);
    expect(hook().failed).toBe('all');
  });

  it('retries the window that failed, not whichever was first', async () => {
    mocks.getMedicationLevels.mockRejectedValueOnce(new Error('offline'));
    const hook = await mount();
    await act(async () => {
      hook().setRange('all');
    });
    await act(async () => {
      hook().retry();
    });

    expect(mocks.getMedicationLevels).toHaveBeenLastCalledWith('all');
    expect(hook().failed).toBeNull();
    expect(hook().fetched.all).toBeTruthy();
  });

  it('clears a past failure when a different window is picked', async () => {
    mocks.getMedicationLevels.mockRejectedValueOnce(new Error('offline'));
    const hook = await mount();
    await act(async () => {
      hook().setRange('all');
    });
    await act(async () => {
      hook().setRange('month');
    });

    expect(hook().failed).toBeNull();
  });
});
