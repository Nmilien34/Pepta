// Where favourites live.
//
// DEVICE-LOCAL, deliberately, and behind this module so it can move. Saving a
// favourite needs no server round-trip to be useful, and shipping it locally
// avoids a shared-schema change and a backend deploy for a feature that is
// still finding its shape. The cost is real and worth stating: favourites do
// not follow the user to a second device, and a reinstall loses them.
//
// Every screen goes through load/save here rather than touching AsyncStorage,
// so replacing this with a server-backed list later is one file.
//
// A corrupt or hand-edited blob reads as "nothing saved" rather than throwing:
// the worst case is an empty Favourites screen, which is already a real state.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Favourite, FavouriteKind } from '../screens/app/favourites';

export const FAVOURITES_KEY = 'pepta:favourites.v1';

const KINDS: readonly FavouriteKind[] = ['food', 'drink'];

function parseOne(raw: unknown): Favourite | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return null;
  if (typeof v.name !== 'string' || v.name.length === 0) return null;
  if (typeof v.portion !== 'string') return null;
  if (typeof v.kind !== 'string' || !KINDS.includes(v.kind as FavouriteKind)) return null;
  if (typeof v.savedAt !== 'string') return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return {
    id: v.id,
    kind: v.kind as FavouriteKind,
    name: v.name,
    portion: v.portion,
    protein: num(v.protein),
    calories: num(v.calories),
    fiber: num(v.fiber),
    ounces: num(v.ounces),
    savedAt: v.savedAt,
  };
}

/** Drops any row that does not parse rather than failing the whole list. */
export function parseFavourites(raw: string | null): Favourite[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseOne).filter((f): f is Favourite => f !== null);
  } catch {
    return [];
  }
}

export async function loadFavourites(): Promise<Favourite[]> {
  try {
    return parseFavourites(await AsyncStorage.getItem(FAVOURITES_KEY));
  } catch {
    return [];
  }
}

export async function saveFavourites(list: readonly Favourite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify(list));
  } catch {
    // Nothing useful to do: the in-memory list is already updated, so the user
    // sees their save. It simply will not survive a restart.
  }
}
