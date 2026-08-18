import { describe, expect, it } from 'vitest';
import type { RecipeResponse } from '@pepta/shared';
import { ingredientSummary, recipeAsMealSeed, recipeTotals, savedLabel } from './recipes';

const oats = [
  { name: 'Rolled oats', amount: '1/2 cup dry', protein: 5, calories: 150, fiber: 4 },
  { name: 'Milk', amount: '1 cup', protein: 8, calories: 103 },
  { name: 'Whey protein', amount: '1 scoop', protein: 24, calories: 120 },
  { name: 'Chia seeds', amount: '1 tbsp', protein: 3, calories: 67, fiber: 5 },
];

describe('recipeTotals', () => {
  it('sums the ingredients — the screen never shows a stored total', () => {
    expect(recipeTotals(oats)).toEqual({ protein: 40, calories: 440, fiber: 9 });
  });

  it('moves when an ingredient does', () => {
    const doubled = oats.map((i) => ({ ...i, protein: i.protein * 2 }));
    expect(recipeTotals(doubled).protein).toBe(80);
  });

  it('treats a missing fiber as zero rather than NaN', () => {
    expect(recipeTotals([{ name: 'X', amount: '', protein: 10, calories: 100 }])).toEqual({
      protein: 10,
      calories: 100,
      fiber: 0,
    });
  });

  it('rounds once at the end, so the total matches the parts shown', () => {
    const thirds = Array.from({ length: 3 }, () => ({
      name: 'X',
      amount: '',
      protein: 0.4,
      calories: 0.4,
    }));
    // Rounding each first would give 0; the honest sum is 1.
    expect(recipeTotals(thirds).protein).toBe(1);
  });

  it('is zero for an empty list rather than throwing', () => {
    expect(recipeTotals([])).toEqual({ protein: 0, calories: 0, fiber: 0 });
  });
});

describe('ingredientSummary', () => {
  it('reads as the design line', () => {
    expect(ingredientSummary(oats)).toBe('Rolled oats, Milk, Whey protein, Chia seeds');
  });

  it('says how many it left out rather than trailing off', () => {
    expect(ingredientSummary(oats, 2)).toBe('Rolled oats, Milk +2 more');
  });
});

describe('savedLabel', () => {
  it('counts, and says so plainly when there is nothing', () => {
    expect(savedLabel(3)).toBe('3 saved');
    expect(savedLabel(0)).toBe('Nothing saved yet');
  });
});

describe('recipeAsMealSeed', () => {
  it('logs the recipe as the meal it is, with summed macros', () => {
    const recipe = {
      id: 'r1',
      name: 'Overnight oats + whey',
      isStarter: true,
      ingredients: oats,
      createdAt: '',
      updatedAt: '',
    } as unknown as RecipeResponse;

    expect(recipeAsMealSeed(recipe)).toEqual({
      foodName: 'Overnight oats + whey',
      servingSize: 'Rolled oats, Milk, Whey protein +1 more',
      protein: 40,
      calories: 440,
      fiber: 9,
    });
  });

  it('omits fiber when the recipe has none, rather than logging a zero', () => {
    const recipe = {
      id: 'r2',
      name: 'Turkey roll-ups',
      isStarter: true,
      ingredients: [{ name: 'Deli turkey', amount: '4 oz', protein: 24, calories: 120 }],
      createdAt: '',
      updatedAt: '',
    } as unknown as RecipeResponse;
    expect(recipeAsMealSeed(recipe)).not.toHaveProperty('fiber');
  });
});
