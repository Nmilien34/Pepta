// The Home shortcut grid.
//
// Recipes was deliberately held out of this grid while RecipesScreen was
// "designed but unbuilt" — a tile that goes nowhere is worse than a missing
// one. That stopped being true when the screen shipped, but the comment saying
// otherwise stayed, so Home kept hiding a feature the rest of the app already
// linked to (Account and NutrientWays both navigate to it).
//
// These read the source rather than rendering the screen: HomeScreen pulls in
// the whole app shell, and the thing worth pinning is the LIST — that every
// designed tile is present, and that each one has both a photo and somewhere
// to go. A tile with a photo and no destination is the failure the original
// comment was guarding against, and it deserves to stay guarded.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHORTCUT_PHOTOS } from './nutrientPhotos';

const source = readFileSync(join(__dirname, 'HomeScreen.tsx'), 'utf8');

/** The `shortcuts` array literal, so assertions cannot match elsewhere. */
const shortcutsBlock = (() => {
  const start = source.indexOf('const shortcuts: Shortcut[] = [');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  ];', start);
  return source.slice(start, end);
})();

describe('the Home shortcut grid', () => {
  it('offers every tile that has a photo — Recipes included', () => {
    // SHORTCUT_PHOTOS is the designed set. A photo with no tile means a tile
    // was dropped and nobody noticed, which is exactly what happened here.
    for (const key of Object.keys(SHORTCUT_PHOTOS)) {
      expect(shortcutsBlock).toContain(`key: '${key}'`);
    }
  });

  it('still has Recipes specifically, pointing at the screen that now exists', () => {
    expect(shortcutsBlock).toContain("key: 'recipes'");
    expect(shortcutsBlock).toContain("navigation.navigate('Recipes')");
  });

  it('gives every tile a destination, never a dead one', () => {
    const tiles = shortcutsBlock.split(/key: '/).slice(1);
    expect(tiles).toHaveLength(Object.keys(SHORTCUT_PHOTOS).length);
    for (const tile of tiles) {
      expect(tile).toMatch(/onPress:/);
      expect(tile).toMatch(/photo: SHORTCUT_PHOTOS\./);
    }
  });

  it('fills whole rows — HomeShortcuts lays out two per row', () => {
    // An odd count leaves a half-width gap on the last row by design. Four is
    // the designed set and divides cleanly; this fails loudly if a fifth tile
    // is added without deciding what the ragged row should look like.
    expect(Object.keys(SHORTCUT_PHOTOS).length % 2).toBe(0);
  });
});
