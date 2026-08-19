// Item detail — the view-model behind "tap any food, drink or favourite".
//
// THE STEPPER SITS ABOVE EVERY NUMBER. That is the design's whole argument:
// the macros, the projection and the button all describe the amount about to
// be logged, so nobody converts a fixed 100 g in their head. Everything here
// is therefore a function of `servings` — nothing on the screen is a stored
// per-item figure.
//
// ONE SKELETON, TWO UNITS. A food moves the protein number; a drink moves the
// water number. The middle card changes what it lists, the layout does not.
//
// Pure and RN-free.

import type { NutrientFood, NutrientKind } from './nutrientWays';
import type { HydrationExample } from './hydration';
import type { Favourite } from './favourites';

export type ItemKind = 'food' | 'drink';

export interface DetailItem {
  key: string;
  kind: ItemKind;
  name: string;
  /** "LMNT · one stick in 16 oz water" — the line under the title. */
  subtitle?: string;
  /** What one of them is: "4 oz cooked (112 g)", "mixed into 16 oz". */
  servingLabel: string;
  /** What one serving is called: "serving", "stick", "bottle". */
  servingNoun: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  satFat?: number;
  fiber?: number;
  sodium?: number;
  potassium?: number;
  magnesium?: number;
  /** Drinks: what one serving adds to the water total. */
  ounces?: number;
  /**
   * Where the figures came from. Rendered only when present — a screen that
   * cites nothing is honest, one that cites something it cannot show you is
   * not.
   */
  source?: string;
  /** Pep's opinion. The only one on the screen, and labelled as one. */
  note?: string;
}

/** Every figure, multiplied by the amount about to be logged. */
export interface ScaledItem {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  satFat?: number;
  fiber?: number;
  sodium?: number;
  potassium?: number;
  magnesium?: number;
  ounces?: number;
}

/** Keeps a tenth where the value has one; never invents a decimal. */
function scale(value: number | undefined, by: number): number | undefined {
  if (value == null) return undefined;
  const out = value * by;
  return Math.round(out * 10) / 10;
}

export function scaleItem(item: DetailItem, servings: number): ScaledItem {
  const by = Math.max(0, servings);
  return {
    calories: scale(item.calories, by),
    protein: scale(item.protein, by),
    carbs: scale(item.carbs, by),
    fat: scale(item.fat, by),
    satFat: scale(item.satFat, by),
    fiber: scale(item.fiber, by),
    sodium: scale(item.sodium, by),
    potassium: scale(item.potassium, by),
    magnesium: scale(item.magnesium, by),
    ounces: scale(item.ounces, by),
  };
}

/** Servings can go up freely but never below one — logging zero is not a log. */
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 20;

export function stepServings(current: number, delta: number): number {
  const next = Math.round((current + delta) * 10) / 10;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, next));
}

export interface TodayProjection {
  /** Where today stands before this is logged. */
  from: number;
  /** Where it would stand after. */
  to: number;
  target: number | null;
  /** 0..1 of the target already logged. */
  loggedPct: number;
  /** 0..1 that this addition would contribute, on top of `loggedPct`. */
  addedPct: number;
  /** "11 g would still be left", or the overshoot said plainly. */
  remainderLine: string;
}

/**
 * What logging this would do to today.
 *
 * The bar carries TWO segments — what is already logged and what this would
 * add — because a single filled bar cannot show the user which part is theirs
 * and which part is the decision they are about to make.
 */
export function todayProjection(
  current: number,
  target: number | null,
  adding: number,
  unit: string,
): TodayProjection {
  const to = Math.round((current + adding) * 10) / 10;
  if (target == null || target <= 0) {
    return {
      from: current,
      to,
      target: null,
      loggedPct: 0,
      addedPct: 0,
      remainderLine: 'Set a daily target to see what this leaves.',
    };
  }

  const loggedPct = Math.min(1, Math.max(0, current / target));
  // Capped against what is already logged, so the two segments can never sum
  // past a full bar even when the addition overshoots.
  const addedPct = Math.min(1 - loggedPct, Math.max(0, adding / target));
  const left = Math.round((target - to) * 10) / 10;

  const remainderLine =
    left > 0
      ? `${left} ${unit} would still be left`
      : left === 0
        ? `That would hit your target exactly`
        : `That would put you ${Math.abs(left)} ${unit} over`;

  return { from: current, to, target, loggedPct, addedPct, remainderLine };
}

/** "1 serving" / "2 servings" / "1 stick". */
export function servingsLabel(servings: number, noun: string): string {
  const n = servings % 1 === 0 ? String(servings) : servings.toFixed(1);
  return `${n} ${servings === 1 ? noun : `${noun}s`}`;
}

/**
 * The footer button. A drink says what it adds as well as how many, because
 * "Log 1 stick" alone does not tell you it is 16 oz.
 */
export function logButtonLabel(item: DetailItem, servings: number): string {
  const base = `Log ${servingsLabel(servings, item.servingNoun)}`;
  const scaled = scaleItem(item, servings);
  if (item.kind === 'drink' && scaled.ounces != null) {
    return `${base} · ${scaled.ounces} oz`;
  }
  return base;
}

// --- Converters. Every surface that can open this screen supplies the same
// shape, so the screen never learns where it was opened from. ---

export function itemFromFood(food: NutrientFood, kind: NutrientKind): DetailItem {
  return {
    key: `food:${food.key}`,
    kind: 'food',
    name: food.name,
    subtitle: food.brand,
    servingLabel: food.serving,
    servingNoun: 'serving',
    calories: food.calories,
    // The screen it was opened from knows one macro; the other is genuinely
    // unknown here and stays undefined rather than being written as zero.
    ...(kind === 'protein' ? { protein: food.amount } : { fiber: food.amount }),
  };
}

export function itemFromDrink(drink: HydrationExample): DetailItem {
  return {
    key: `drink:${drink.key}`,
    kind: 'drink',
    name: drink.brand,
    subtitle: drink.name,
    servingLabel: drink.volume,
    servingNoun: 'serving',
    ounces: drink.ounces,
  };
}

export function itemFromFavourite(fav: Favourite): DetailItem {
  return {
    key: `fav:${fav.id}`,
    kind: fav.kind,
    name: fav.name,
    servingLabel: fav.portion,
    servingNoun: 'serving',
    calories: fav.calories,
    protein: fav.protein,
    fiber: fav.fiber,
    ounces: fav.ounces,
  };
}
