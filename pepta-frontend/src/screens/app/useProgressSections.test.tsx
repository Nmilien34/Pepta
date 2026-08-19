// The preference has to survive a relaunch — "turn it back on any time"
// promises the choice sticks.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const apiMocks = vi.hoisted(() => ({ getUiPreferences: vi.fn(), putUiPreferences: vi.fn() }));

vi.mock('../../services/api', () => ({
  api: { getUiPreferences: apiMocks.getUiPreferences, putUiPreferences: apiMocks.putUiPreferences },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    removeItem: vi.fn(async (k: string) => void store.delete(k)),
  },
}));

import { PROGRESS_SECTIONS_KEY } from './progressSections';
import { useProgressSections } from './useProgressSections';

type Hook = ReturnType<typeof useProgressSections>;
let handle!: Hook;
function Probe() {
  handle = useProgressSections();
  return null;
}

async function mount() {
  await act(async () => {
    TestRenderer.create(<Probe />);
  });
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  // An account that has never saved preferences.
  apiMocks.getUiPreferences.mockResolvedValue({ preferences: { progressSections: {} }, updatedAt: null });
  apiMocks.putUiPreferences.mockResolvedValue({ preferences: { progressSections: {} }, updatedAt: null });
});

describe('useProgressSections', () => {
  it('starts with everything on', async () => {
    await mount();

    expect(handle.sections.weight).toBe(true);
    expect(handle.hydrated).toBe(true);
  });

  it('writes the choice the moment it is made — there is no Save button', async () => {
    await mount();
    await act(async () => {
      handle.toggle('eating');
    });

    expect(handle.sections.eating).toBe(false);
    expect(JSON.parse(store.get(PROGRESS_SECTIONS_KEY)!).eating).toBe(false);
  });

  it('sends it to the server, so it follows the user to another device', async () => {
    await mount();
    await act(async () => {
      handle.toggle('eating');
    });

    expect(apiMocks.putUiPreferences).toHaveBeenCalledWith({
      progressSections: expect.objectContaining({ eating: false, weight: true }),
    });
  });

  it('sends every known section, not only the one that changed', async () => {
    await mount();
    await act(async () => {
      handle.toggle('photos');
    });

    // The server replaces rather than merges, so a partial body would read as
    // "everything else unset".
    const sent = apiMocks.putUiPreferences.mock.calls[0]![0].progressSections;
    expect(Object.keys(sent).sort()).toEqual(
      ['eating', 'muscle', 'numbers', 'photos', 'sideEffects', 'timeline', 'weight'],
    );
  });

  it('writes once per tap, not twice', async () => {
    await mount();
    await act(async () => {
      handle.toggle('muscle');
    });

    expect(apiMocks.putUiPreferences).toHaveBeenCalledTimes(1);
  });

  it('takes the server’s value over a stale cache', async () => {
    store.set(PROGRESS_SECTIONS_KEY, JSON.stringify({ weight: false }));
    apiMocks.getUiPreferences.mockResolvedValue({
      preferences: { progressSections: { weight: true, muscle: false } },
      updatedAt: '2026-08-13T00:00:00.000Z',
    });

    await mount();

    expect(handle.sections.weight).toBe(true);
    expect(handle.sections.muscle).toBe(false);
    // And caches it, so the next launch paints the right thing immediately.
    expect(JSON.parse(store.get(PROGRESS_SECTIONS_KEY)!).muscle).toBe(false);
  });

  it('keeps the cache when the account has never saved anything', async () => {
    store.set(PROGRESS_SECTIONS_KEY, JSON.stringify({ photos: false }));
    await mount();

    // An empty object is "nothing chosen", not "all off".
    expect(handle.sections.photos).toBe(false);
  });

  it('never lets a late server response undo a tap', async () => {
    let land!: (value: unknown) => void;
    apiMocks.getUiPreferences.mockReturnValue(new Promise((resolve) => { land = resolve; }));
    await mount();

    await act(async () => {
      handle.toggle('weight');
    });
    await act(async () => {
      land({ preferences: { progressSections: { weight: true } }, updatedAt: null });
    });

    expect(handle.sections.weight).toBe(false);
  });

  it('still works offline — the screen changes even when the server refuses', async () => {
    apiMocks.putUiPreferences.mockRejectedValue(new Error('offline'));
    await mount();

    await act(async () => {
      handle.toggle('numbers');
    });

    expect(handle.sections.numbers).toBe(false);
    expect(JSON.parse(store.get(PROGRESS_SECTIONS_KEY)!).numbers).toBe(false);
  });

  it('reads it back on the next launch', async () => {
    store.set(PROGRESS_SECTIONS_KEY, JSON.stringify({ muscle: false }));
    await mount();

    expect(handle.sections.muscle).toBe(false);
    expect(handle.sections.weight).toBe(true);
  });

  it('turns one back on and persists that too', async () => {
    store.set(PROGRESS_SECTIONS_KEY, JSON.stringify({ photos: false }));
    await mount();

    await act(async () => {
      handle.toggle('photos');
    });

    expect(handle.sections.photos).toBe(true);
    expect(JSON.parse(store.get(PROGRESS_SECTIONS_KEY)!).photos).toBe(true);
  });

  it('shows everything when storage cannot be read', async () => {
    const storage = (await import('@react-native-async-storage/async-storage')).default;
    vi.mocked(storage.getItem).mockRejectedValueOnce(new Error('nope'));
    await mount();

    // Wrong in the recoverable direction: too much on screen, not a card
    // missing for a reason the user never chose.
    expect(handle.sections).toEqual({
      weight: true, sideEffects: true, eating: true, muscle: true,
      timeline: true, numbers: true, photos: true,
    });
    expect(handle.hydrated).toBe(true);
  });

  it('keeps the toggle working when the write fails', async () => {
    const storage = (await import('@react-native-async-storage/async-storage')).default;
    vi.mocked(storage.setItem).mockRejectedValueOnce(new Error('full'));
    await mount();

    await act(async () => {
      handle.toggle('timeline');
    });

    // The screen has already changed; a failed write costs the preference at
    // next launch, not the interaction now.
    expect(handle.sections.timeline).toBe(false);
  });
});
