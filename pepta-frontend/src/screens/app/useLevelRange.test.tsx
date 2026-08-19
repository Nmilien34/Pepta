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

async function mount() {
  const ref: { current: Hook | null } = { current: null };
  function Probe() {
    ref.current = useLevelRange();
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

  it('drops a slow response for a window the user has left', async () => {
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

    // The stale month lands last but must not be stored under the user's feet.
    expect(hook().range).toBe('quarter');
    expect(hook().fetched.month).toBeUndefined();
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
