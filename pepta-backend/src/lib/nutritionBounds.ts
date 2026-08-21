// Plausibility bounds for AI-estimated nutrition.
//
// Every macro in this app can arrive from a language model — a meal photo, a
// typed description, a barcode lookup, a food search, a composed recipe — and
// a model can return any number at all. Nothing downstream re-checks them:
// mealLogInputSchema only requires nonnegative, so a hallucinated 1e9 is
// stored verbatim and then poisons the day's totals, the Progress charts, the
// weekly averages, and the context Pep answers from.
//
// These are the numbers three of the five estimators were already using
// independently. They live here now so the fourth and fifth can share them
// and the convention cannot silently drift again.
//
// The bounds are deliberately generous — a per-MEAL ceiling, not a per-item
// one, so a large restaurant plate still passes untouched. They exist to
// reject nonsense, not to second-guess a plausible estimate.

export const NUTRITION_BOUNDS = {
  /** Grams of protein in one meal. */
  protein: { min: 0, max: 300 },
  /** Calories in one meal. */
  calories: { min: 0, max: 3000 },
  /** Grams of carbohydrate in one meal. */
  carbs: { min: 0, max: 500 },
  /** Grams of fat in one meal. */
  fat: { min: 0, max: 250 },
  /** Grams of fibre in one meal. */
  fiber: { min: 0, max: 100 },
  /** Model self-reported confidence. */
  confidence: { min: 0, max: 1 },
} as const;

export type NutritionBoundKey = keyof typeof NUTRITION_BOUNDS;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps one macro to its plausibility band.
 *
 * NaN and Infinity are NOT clamped to a bound — they are rejected by the
 * callers' finite checks before they reach here. Math.min/max would silently
 * turn NaN into NaN and pass it along, so callers must keep validating
 * finiteness first; this only decides how big a real number may be.
 */
export function clampNutrition(key: NutritionBoundKey, value: number): number {
  const { min, max } = NUTRITION_BOUNDS[key];
  return clampNumber(value, min, max);
}
