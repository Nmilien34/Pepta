// The saved list, hydrated once and written through on every change.
//
// Optimistic by design: the list in memory updates immediately and the write
// happens behind it, because a star that waits on disk feels broken.

import { useCallback, useEffect, useState } from 'react';
import {
  addFavourite,
  removeFavourite,
  type Favourite,
} from './favourites';
import { loadFavourites, saveFavourites } from '../../services/favouritesStore';

export function useFavourites(): {
  favourites: Favourite[];
  hydrated: boolean;
  save: (next: Favourite) => void;
  unsave: (id: string) => void;
} {
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    loadFavourites()
      .then((list) => {
        if (active) setFavourites(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback((next: Favourite) => {
    setFavourites((list) => {
      const updated = addFavourite(list, next);
      void saveFavourites(updated);
      return updated;
    });
  }, []);

  const unsave = useCallback((id: string) => {
    setFavourites((list) => {
      const updated = removeFavourite(list, id);
      void saveFavourites(updated);
      return updated;
    });
  }, []);

  return { favourites, hydrated, save, unsave };
}
