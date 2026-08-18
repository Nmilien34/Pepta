// The saved list is optimistic AND rolls back. Both halves matter: a star that
// waits on the network feels broken, and a star that stays lit after the save
// failed is lying to the user about what they have.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

const mocks = vi.hoisted(() => ({
  getFavourites: vi.fn(),
  saveFavourite: vi.fn(),
  removeFavourite: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  api: {
    getFavourites: mocks.getFavourites,
    saveFavourite: mocks.saveFavourite,
    removeFavourite: mocks.removeFavourite,
  },
}));

import { useFavourites } from './useFavourites';
import type { Favourite } from './favourites';

type Hook = ReturnType<typeof useFavourites>;

async function mount() {
  const ref: { current: Hook | null } = { current: null };
  function Probe() {
    ref.current = useFavourites();
    return null;
  }
  await act(async () => {
    TestRenderer.create(<Probe />);
  });
  return () => ref.current!;
}

const chicken: Favourite = {
  id: 'food:chicken-breast:6-oz',
  kind: 'food',
  name: 'Chicken breast',
  portion: '6 oz',
  protein: 54,
  calories: 280,
  savedAt: '2026-08-17T12:00:00.000Z',
};

const row = {
  id: 'row1',
  key: 'food:greek-yogurt:1-cup',
  kind: 'food' as const,
  name: 'Greek yogurt',
  portion: '1 cup',
  protein: 20,
  calories: 140,
  createdAt: '2026-08-16T12:00:00.000Z',
  updatedAt: '2026-08-16T12:00:00.000Z',
};

beforeEach(() => {
  mocks.getFavourites.mockReset().mockResolvedValue({ favourites: [] });
  mocks.saveFavourite.mockReset().mockResolvedValue({});
  mocks.removeFavourite.mockReset().mockResolvedValue({});
});

describe('useFavourites', () => {
  it('hydrates from the server, keyed the way the screens expect', async () => {
    mocks.getFavourites.mockResolvedValue({ favourites: [row] });
    const hook = await mount();
    expect(hook().hydrated).toBe(true);
    // Screens key off the stable key, not the database row id.
    expect(hook().favourites.map((f) => f.id)).toEqual([row.key]);
    expect(hook().favourites[0]!.portion).toBe('1 cup');
  });

  it('shows a save immediately, before the request settles', async () => {
    let release!: () => void;
    mocks.saveFavourite.mockReturnValue(
      new Promise<void>((r) => {
        release = () => r();
      }),
    );
    const hook = await mount();
    act(() => hook().save(chicken));
    expect(hook().favourites.map((f) => f.id)).toEqual([chicken.id]);
    await act(async () => {
      release();
    });
    expect(hook().favourites).toHaveLength(1);
  });

  it('puts the list back when the save fails', async () => {
    mocks.saveFavourite.mockRejectedValue(new Error('offline'));
    const hook = await mount();
    await act(async () => {
      hook().save(chicken);
    });
    expect(hook().favourites).toHaveLength(0);
  });

  it('sends the portion and the macros, so the server stores what Log replays', async () => {
    const hook = await mount();
    await act(async () => {
      hook().save(chicken);
    });
    expect(mocks.saveFavourite).toHaveBeenCalledWith({
      key: chicken.id,
      kind: 'food',
      name: 'Chicken breast',
      portion: '6 oz',
      protein: 54,
      calories: 280,
    });
  });

  it('omits absent macros rather than sending nulls', async () => {
    const hook = await mount();
    await act(async () => {
      hook().save({ ...chicken, protein: undefined, calories: undefined });
    });
    const sent = mocks.saveFavourite.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('protein');
    expect(sent).not.toHaveProperty('calories');
  });

  it('removes immediately and restores on failure', async () => {
    mocks.getFavourites.mockResolvedValue({ favourites: [row] });
    mocks.removeFavourite.mockRejectedValue(new Error('offline'));
    const hook = await mount();
    expect(hook().favourites).toHaveLength(1);
    await act(async () => {
      hook().unsave(row.key);
    });
    expect(hook().favourites).toHaveLength(1);
    expect(mocks.removeFavourite).toHaveBeenCalledWith(row.key);
  });

  it('reads a failed load as nothing saved rather than hanging', async () => {
    mocks.getFavourites.mockRejectedValue(new Error('500'));
    const hook = await mount();
    expect(hook().hydrated).toBe(true);
    expect(hook().favourites).toEqual([]);
  });
});
