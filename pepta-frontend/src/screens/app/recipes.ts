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
  photoMediaId?: string;
} {
  const totals = recipeTotals(recipe.ingredients);
  return {
    foodName: recipe.name,
    servingSize: ingredientSummary(recipe.ingredients, 3),
    protein: totals.protein,
    calories: totals.calories,
    ...(totals.fiber > 0 ? { fiber: totals.fiber } : {}),
    ...(recipe.photoMediaId ? { photoMediaId: recipe.photoMediaId } : {}),
  };
}

/**
 * What to say about a proposal the model estimated.
 *
 * ALWAYS SAYS SOMETHING. These portions were guessed from a sentence or a
 * photograph, and a screen that shows numbers with no caveat implies a
 * precision nobody has. The wording sharpens as confidence drops rather than
 * appearing only when it is bad — a note that shows up sometimes reads as an
 * error, one that is always there reads as a habit.
 */
export function confidenceNote(confidence: number): string {
  if (confidence >= 0.8) return 'Estimated from what you described. Adjust anything that looks off.';
  if (confidence >= 0.5) return 'Best guess at the portions — worth a check before you save.';
  return 'Low confidence on these portions. Check them, or remove what does not belong.';
}

/** Drops one ingredient by index, for the review step. */
export function withoutIngredient<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}
