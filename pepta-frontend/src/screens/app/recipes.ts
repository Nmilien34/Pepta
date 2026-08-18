// Recipe totals, derived.
//
// THE NUMBERS ON SCREEN ARE ALWAYS A SUM of the ingredients, never a stored
// figure. A recipe whose total lived beside its parts would disagree with them
// the moment someone adjusted a portion — and the disagreeing number is the
// one the user acts on.
//
// Pure and RN-free.

import type { RecipeIngredient, RecipeResponse } from '@pepta/shared';

export interface RecipeTotals {
  protein: number;
  calories: number;
  fiber: number;
}

export function recipeTotals(ingredients: readonly RecipeIngredient[]): RecipeTotals {
  const sum = ingredients.reduce(
    (acc, i) => ({
      protein: acc.protein + i.protein,
      calories: acc.calories + i.calories,
      fiber: acc.fiber + (i.fiber ?? 0),
    }),
    { protein: 0, calories: 0, fiber: 0 },
  );
  // Rounded once, at the end. Rounding each ingredient first drifts the total
  // away from the parts the user can see.
  return {
    protein: Math.round(sum.protein),
    calories: Math.round(sum.calories),
    fiber: Math.round(sum.fiber * 10) / 10,
  };
}

/** "Whey, milk, banana, peanut butter" — the row's second line. */
export function ingredientSummary(
  ingredients: readonly RecipeIngredient[],
  max = 4,
): string {
  const names = ingredients.map((i) => i.name);
  const shown = names.slice(0, max).join(', ');
  const rest = names.length - max;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

/** "3 saved" / "Nothing saved yet" — the count beside the Yours heading. */
export function savedLabel(count: number): string {
  if (count === 0) return 'Nothing saved yet';
  return `${count} saved`;
}

/**
 * What logging a recipe writes. The design is explicit that this is the same
 * entry a fresh meal log would produce — a shortcut, not a second kind of
 * record — so it goes through the meal sheet with the totals filled in.
 */
export function recipeAsMealSeed(recipe: RecipeResponse): {
  foodName: string;
  servingSize?: string;
  protein: number;
  calories: number;
  fiber?: number;
} {
  const totals = recipeTotals(recipe.ingredients);
  return {
    foodName: recipe.name,
    servingSize: ingredientSummary(recipe.ingredients, 3),
    protein: totals.protein,
    calories: totals.calories,
    ...(totals.fiber > 0 ? { fiber: totals.fiber } : {}),
  };
}
