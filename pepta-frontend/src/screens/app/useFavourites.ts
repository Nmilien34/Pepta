// The saved list, from the server.
//
// SERVER-BACKED, not device-local: a favourite is the user's own data and has
// to follow the account to a second phone and survive a reinstall.
//
// OPTIMISTIC, because a star that waits on the network feels broken. The list
// in memory changes on tap and the request goes behind it; a failure puts the
// list back exactly as it was rather than leaving the star lying about what is
// saved. That rollback is the whole reason this holds the previous list rather
// than just toggling.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FavouriteResponse } from '@pepta/shared';
import { api } from '../../services/api';
import { addFavourite, removeFavourite, type Favourite } from './favourites';

/** The wire shape carries ids and timestamps the screens do not need. */
function fromResponse(row: FavouriteResponse): Favourite {
  return {
    id: row.key,
    kind: row.kind,
    name: row.name,
    portion: row.portion,
    protein: row.protein,
    calories: row.calories,
    fiber: row.fiber,
    ounces: row.ounces,
    savedAt: row.createdAt,
  };
}

export function useFavourites(): {
  favourites: Favourite[];
  hydrated: boolean;
  save: (next: Favourite) => void;
  unsave: (id: string) => void;
} {
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const alive = useRef(true);

  // The list, mirrored synchronously. Capturing the rollback copy inside a
  // setState updater does NOT work: React runs the updater on the re-render,
  // which can land after the request has already rejected — the catch then
  // restores an empty list it never actually saw, and an un-star that failed
  // stays un-starred.
  const listRef = useRef<Favourite[]>([]);
  const setList = useCallback((next: Favourite[]) => {
    listRef.current = next;
    setFavourites(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    api
      .getFavourites()
      .then((res) => {
        if (alive.current) setList(res.favourites.map(fromResponse));
      })
      // A failed load reads as "nothing saved yet", which is a real state.
      // The alternative — a spinner that never resolves — is worse.
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setHydrated(true);
      });
    return () => {
      alive.current = false;
    };
  }, [setList]);

  const save = useCallback((next: Favourite) => {
    const previous = listRef.current;
    setList(addFavourite(previous, next));
    api
      .saveFavourite({
        key: next.id,
        kind: next.kind,
        name: next.name,
        portion: next.portion,
        ...(next.protein != null ? { protein: next.protein } : {}),
        ...(next.calories != null ? { calories: next.calories } : {}),
        ...(next.fiber != null ? { fiber: next.fiber } : {}),
        ...(next.ounces != null ? { ounces: next.ounces } : {}),
      })
      .catch(() => {
        if (alive.current) setList(previous);
      });
  }, [setList]);

  const unsave = useCallback((id: string) => {
    const previous = listRef.current;
    setList(removeFavourite(previous, id));
    api.removeFavourite(id).catch(() => {
      if (alive.current) setList(previous);
    });
  }, [setList]);

  return { favourites, hydrated, save, unsave };
}
