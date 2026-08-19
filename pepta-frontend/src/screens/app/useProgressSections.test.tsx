// The preference has to survive a relaunch — "turn it back on any time"
// promises the choice sticks.

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

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
      weight: true, eating: true, muscle: true, timeline: true, numbers: true, photos: true,
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
