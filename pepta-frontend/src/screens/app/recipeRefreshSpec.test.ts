// A saved recipe has to reach the list, and that is a THREE-FILE CONTRACT.
//
// The failure it fixes: create a recipe, land back on Recipes, and it is not
// there. Leave the screen, come back, and it is. Which reads as "it did not
// save" — the worst possible reading, because the save worked.
//
// The cause is structural rather than a mistake in any one file. The meal
// sheet is mounted in LogSheetsContext, ABOVE the navigator. New recipe pops
// itself before opening the sheet, so the Recipes screen is the one underneath
// — and it never loses focus while the sheet is up. No focus effect fires when
// the sheet closes. Meanwhile useRecipes fetches once on mount. Nothing in
// that sequence is wrong on its own; together they guarantee a stale list.
//
// So the fix is a chain: the sheet fires onRecipeSaved, the context bumps a
// revision, the hook depends on it. Break any link and the bug returns
// silently — nothing throws, nothing fails to compile, the list is just wrong.
// These pin all three links, because a test on one file cannot see the break.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

const sheet = read('../../components/MealLogSheet.tsx');
const context = read('../../context/LogSheetsContext.tsx');
const hook = read('useRecipes.ts');

describe('link 1 — the sheet reports a persisted recipe', () => {
  // Scoped to the createRecipe PROMISE CHAIN, not the whole function: the
  // first line of saveProposedRecipe is a haptic with its own harmless
  // `.catch(() => undefined)`, which would satisfy either assertion by
  // accident.
  const writeChain = sheet.slice(
    sheet.indexOf('.createRecipe({'),
    sheet.indexOf('const back ='),
  );

  it('fires onRecipeSaved only after createRecipe resolves', () => {
    // In `.then`, never `.finally`: a rejected write must not announce a save.
    expect(writeChain).toContain('onRecipeSaved?.();');
    expect(writeChain.indexOf('onRecipeSaved?.();')).toBeGreaterThan(writeChain.indexOf('.then('));
    expect(writeChain.indexOf('onRecipeSaved?.();')).toBeLessThan(writeChain.indexOf('.catch('));
  });

  it('no longer swallows the failure', () => {
    // The shape that made a failed save indistinguishable from a good one was
    // an empty catch plus onClose in `finally`. Both halves are asserted
    // directly rather than by banning `.catch(() => undefined)` as a string —
    // the error handler legitimately contains one, for the haptic it fires.
    expect(writeChain).toContain('setRecipeError(true)');
    // Closing is the success path only; `finally` just clears the spinner.
    expect(writeChain).toContain('.finally(() => setSavingRecipe(false));');
    expect(writeChain.indexOf('onClose();')).toBeLessThan(writeChain.indexOf('.catch('));
  });
});

describe('link 2 — the context turns that into a signal', () => {
  it('passes onRecipeSaved down and bumps a revision', () => {
    expect(context).toContain('onRecipeSaved={() => setRecipesRevision((n) => n + 1)}');
  });

  it('publishes the revision on the context value', () => {
    // A revision nobody can read is not a signal.
    expect(context).toContain('recipesRevision: number;');
    expect(context).toMatch(/\(\{ openQuickLog, openMeal, recipesRevision \}\)/);
  });
});

describe('link 3 — the list reloads on it', () => {
  it('reads the revision and refetches when it changes', () => {
    expect(hook).toContain('const { recipesRevision } = useLogSheets();');
    // The dependency is the whole point: without it the effect never re-runs.
    expect(hook).toContain('}, [setMine, recipesRevision]);');
  });

  it('still marks itself dead on unmount, so a late response cannot land', () => {
    // The effect now re-runs, which means cleanup runs between fetches. If
    // `alive` were not reset on each run the second fetch would be discarded
    // and the list would never update — the same bug with a new cause.
    expect(hook).toContain('alive.current = true;');
    expect(hook).toContain('alive.current = false;');
  });
});
