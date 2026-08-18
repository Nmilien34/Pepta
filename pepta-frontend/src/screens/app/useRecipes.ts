// Recipes, from the server: the user's own and the shared starters.
//
// Optimistic like the favourites list — saving a starter as yours has to show
// up under Yours immediately — and it rolls back the same way, from a ref
// captured synchronously rather than inside a setState updater, which runs on
// the re-render and can land after the request has already failed.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecipeInput, RecipeResponse } from '@pepta/shared';
import { api } from '../../services/api';

export function useRecipes(): {
  recipes: RecipeResponse[];
  starters: RecipeResponse[];
  hydrated: boolean;
  saveAsMine: (input: RecipeInput) => void;
  remove: (id: string) => void;
} {
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [starters, setStarters] = useState<RecipeResponse[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const alive = useRef(true);
  const mineRef = useRef<RecipeResponse[]>([]);

  const setMine = useCallback((next: RecipeResponse[]) => {
    mineRef.current = next;
    setRecipes(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    api
      .getRecipes()
      .then((res) => {
        if (!alive.current) return;
        setMine(res.recipes);
        setStarters(res.starters);
      })
      // A failed load leaves both lists empty, which the screen states plainly
      // rather than spinning forever.
      .catch(() => undefined)
      .finally(() => {
        if (alive.current) setHydrated(true);
      });
    return () => {
      alive.current = false;
    };
  }, [setMine]);

  const saveAsMine = useCallback(
    (input: RecipeInput) => {
      const previous = mineRef.current;
      api
        .createRecipe(input)
        .then((saved) => {
          if (alive.current) setMine([saved, ...previous]);
        })
        .catch(() => {
          if (alive.current) setMine(previous);
        });
    },
    [setMine],
  );

  const remove = useCallback(
    (id: string) => {
      const previous = mineRef.current;
      setMine(previous.filter((r) => r.id !== id));
      api.deleteRecipe(id).catch(() => {
        if (alive.current) setMine(previous);
      });
    },
    [setMine],
  );

  return { recipes, starters, hydrated, saveAsMine, remove };
}
