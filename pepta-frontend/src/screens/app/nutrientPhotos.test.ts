import { describe, expect, it } from 'vitest';
import { DRINK_PHOTOS, FOOD_PHOTOS, SHORTCUT_PHOTOS } from './nutrientPhotos';
import { HYDRATION_EXAMPLES } from './hydration';
import { FIBER_FOODS, PROTEIN_FOODS } from './nutrientWays';

describe('food photos', () => {
  it('has one for every food on both screens', () => {
    for (const food of [...FIBER_FOODS, ...PROTEIN_FOODS]) {
      expect(FOOD_PHOTOS[food.key], `missing photo for ${food.key}`).toBeDefined();
    }
  });

  it('carries no photo that no food references', () => {
    const used = new Set([...FIBER_FOODS, ...PROTEIN_FOODS].map((f) => f.key));
    for (const key of Object.keys(FOOD_PHOTOS)) {
      expect(used.has(key), `${key}.jpg is bundled but unused`).toBe(true);
    }
  });
});

describe('shortcut photos', () => {
  it('has one per tile', () => {
    expect(Object.keys(SHORTCUT_PHOTOS).sort()).toEqual(['fiber', 'hydration', 'meals', 'recipes']);
  });
});

describe('drink photos', () => {
  it('has one for every hydration example', () => {
    for (const drink of HYDRATION_EXAMPLES) {
      expect(DRINK_PHOTOS[drink.key], `missing photo for ${drink.key}`).toBeDefined();
    }
  });

  it('carries no drink photo that nothing references', () => {
    const used = new Set(HYDRATION_EXAMPLES.map((d) => d.key));
    for (const key of Object.keys(DRINK_PHOTOS)) {
      expect(used.has(key), `${key}.jpg is bundled but unused`).toBe(true);
    }
  });
});
