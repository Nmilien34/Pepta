// Favourites — the things you actually eat and drink, saved with the portion.
//
// A FAVOURITE IS A PORTION, NOT A CATEGORY. "Chicken breast" is useless on its
// own; "Chicken breast, 6 oz grilled, 54 g protein" is one tap. That is why
// the portion is part of the identity: two sizes of the same food are two
// favourites, and saving one never overwrites the other.
//
// WORTH SAVING FILLS ITSELF. Nobody curates a list, so the screen offers what
// the user has already logged repeatedly and lets them keep it or ignore it.
// Nothing is saved on their behalf — an empty Favourites screen is a real
// state, not a bug.
//
// Pure and RN-free.

import type { MealLogResponse, WaterLogResponse } from '@pepta/shared';

export type FavouriteKind = 'food' | 'drink';

export interface Favourite {
  /** Stable across sessions: kind + name + portion. */
  id: string;
  kind: FavouriteKind;
  name: string;
  /** "6 oz, grilled" / "16 oz". Part of the identity, never decoration. */
  portion: string;
  protein?: number;
  calories?: number;
  fiber?: number;
  /** Drinks only — what tapping Log adds. */
  ounces?: number;
  /** "recipe" earns a badge: it logs several foods at once. */
  source?: 'item' | 'recipe';
  savedAt: string;
}

/** How many times an item must appear before it is worth offering. */
export const WORTH_SAVING_MIN_LOGS = 3;
/** The window those logs are counted over. */
export const WORTH_SAVING_DAYS = 14;
/** Never offer more than this at once — it is a nudge, not a second list. */
export const WORTH_SAVING_MAX = 3;

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function favouriteId(kind: FavouriteKind, name: string, portion: string): string {
  return `${kind}:${slug(name)}:${slug(portion)}`;
}

/** Newest first, and saving the same portion twice is not two favourites. */
export function addFavourite(list: readonly Favourite[], next: Favourite): Favourite[] {
  return [next, ...list.filter((f) => f.id !== next.id)];
}

export function removeFavourite(list: readonly Favourite[], id: string): Favourite[] {
  return list.filter((f) => f.id !== id);
}

export function isSaved(list: readonly Favourite[], id: string): boolean {
  return list.some((f) => f.id === id);
}

export function favouritesOf(list: readonly Favourite[], kind: FavouriteKind): Favourite[] {
  return list.filter((f) => f.kind === kind);
}

/** "Food · 3" / "Drinks · 2" — the tab labels. */
export function countsByKind(list: readonly Favourite[]): { food: number; drink: number } {
  return {
    food: favouritesOf(list, 'food').length,
    drink: favouritesOf(list, 'drink').length,
  };
}

export interface WorthSaving {
  key: string;
  name: string;
  portion: string;
  protein?: number;
  calories?: number;
  fiber?: number;
  /** How many times it was logged in the window. Shown, so the offer is honest. */
  count: number;
}

/**
 * Foods the user keeps logging by hand.
 *
 * Grouped by name AND portion, because "chicken breast" logged at three
 * different sizes is not one habit — offering a portion they never used would
 * put a wrong number one tap away.
 *
 * Deleted logs do not count: deletedAt is the only delete this app performs,
 * and a mistake the user removed is not evidence of a habit.
 */
export function worthSaving(
  mealLogs: readonly MealLogResponse[] | null | undefined,
  saved: readonly Favourite[],
  now: Date,
  max = WORTH_SAVING_MAX,
): WorthSaving[] {
  const since = now.getTime() - WORTH_SAVING_DAYS * 86_400_000;
  const groups = new Map<string, WorthSaving>();

  for (const log of mealLogs ?? []) {
    if (log.deletedAt != null) continue;
    const at = new Date(log.datetime).getTime();
    if (!Number.isFinite(at) || at < since || at > now.getTime()) continue;

    const name = log.foodName.trim();
    if (name.length === 0) continue;
    const portion = (log.servingSize ?? '').trim();
    const key = favouriteId('food', name, portion);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    groups.set(key, {
      key,
      name,
      portion,
      protein: log.protein,
      calories: log.calories,
      fiber: log.fiber,
      count: 1,
    });
  }

  return [...groups.values()]
    .filter((g) => g.count >= WORTH_SAVING_MIN_LOGS && !isSaved(saved, g.key))
    // Most-logged first; ties keep a stable order so the list does not shuffle
    // between renders.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** "Logged 6 times in two weeks" — the reason the row is being offered. */
export function worthSavingReason(count: number): string {
  return `Logged ${count} times in two weeks`;
}

/** Turn an offer into the thing that gets stored. */
export function favouriteFromOffer(offer: WorthSaving, savedAt: string): Favourite {
  return {
    id: offer.key,
    kind: 'food',
    name: offer.name,
    portion: offer.portion,
    protein: offer.protein,
    calories: offer.calories,
    fiber: offer.fiber,
    savedAt,
  };
}

/**
 * "Start with these" — shown only before anything is saved.
 *
 * PEPTA SAVES NONE OF THEM. The list only ever grows from what the user does;
 * these exist so an empty screen is not a dead end, and each one is saved only
 * when tapped. Seeding the list on their behalf would make Favourites a
 * curated set they did not curate.
 */
export const STARTING_SUGGESTIONS: readonly Favourite[] = [
  {
    id: favouriteId('food', 'Greek yogurt', '1 cup, plain'),
    kind: 'food',
    name: 'Greek yogurt',
    portion: '1 cup, plain',
    protein: 20,
    calories: 140,
    savedAt: '',
  },
  {
    id: favouriteId('food', 'Chicken breast', '6 oz, grilled'),
    kind: 'food',
    name: 'Chicken breast',
    portion: '6 oz, grilled',
    protein: 54,
    calories: 280,
    savedAt: '',
  },
  {
    id: favouriteId('drink', 'Water bottle', '16 oz'),
    kind: 'drink',
    name: 'Water bottle',
    portion: '16 oz',
    ounces: 16,
    savedAt: '',
  },
];

/**
 * The first-run nudge, for one tab.
 *
 * TWO SEPARATE RULES, and they are easy to conflate:
 *
 *   WHEN it appears is a whole-list question. Only on a genuinely empty
 *   screen — nothing saved on either side. Gating per tab would pop the nudge
 *   up on Drinks after the user had already curated Food, which is not a first
 *   run and reads as the app forgetting what they did.
 *
 *   WHAT it contains is a per-tab question. The tabs PARTITION the list: Food
 *   shows food, Drinks shows drinks, always. A drink offered under Food would
 *   be saved into the other tab and vanish from the row the user just tapped —
 *   the one interaction on this screen that could look broken.
 */
export function startingSuggestions(
  saved: readonly Favourite[],
  kind: FavouriteKind,
): Favourite[] {
  if (saved.length > 0) return [];
  return STARTING_SUGGESTIONS.filter((s) => s.kind === kind);
}

export interface WorthSavingDrink {
  key: string;
  /** The vessel's name on an exact match, else the volume itself. */
  name: string;
  ounces: number;
  count: number;
}

/**
 * Drinks the user keeps adding by hand.
 *
 * Water logs carry a VOLUME and a time, never a product name — so this groups
 * by the amount, which is the thing actually being repeated. Someone who taps
 * 34 oz five times a fortnight has a bottle they keep refilling, and that is
 * worth one tap. Naming it after a product we never recorded would be
 * inventing the interesting half.
 *
 * The name comes from the vessel row on an EXACT match only. A 20 oz habit is
 * "20 oz", not "Bottle" — a 16 oz bottle is not what they drank.
 */
export function worthSavingDrinks(
  waterLogs: readonly WaterLogResponse[] | null | undefined,
  saved: readonly Favourite[],
  now: Date,
  vesselName: (ounces: number) => string | null,
  max = WORTH_SAVING_MAX,
): WorthSavingDrink[] {
  const since = now.getTime() - WORTH_SAVING_DAYS * 86_400_000;
  const counts = new Map<number, number>();

  for (const log of waterLogs ?? []) {
    if (log.deletedAt != null) continue;
    const at = new Date(log.datetime).getTime();
    if (!Number.isFinite(at) || at < since || at > now.getTime()) continue;
    const oz = Math.round(log.amountOz * 10) / 10;
    if (!(oz > 0)) continue;
    counts.set(oz, (counts.get(oz) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([ounces, count]) => {
      const name = vesselName(ounces) ?? `${ounces} oz`;
      return { key: favouriteId('drink', name, `${ounces} oz`), name, ounces, count };
    })
    .filter((d) => d.count >= WORTH_SAVING_MIN_LOGS && !isSaved(saved, d.key))
    .sort((a, b) => b.count - a.count || b.ounces - a.ounces)
    .slice(0, max);
}

/** Turn a drink offer into the thing that gets stored. */
export function favouriteFromDrinkOffer(
  offer: WorthSavingDrink,
  savedAt: string,
): Favourite {
  return {
    id: offer.key,
    kind: 'drink',
    name: offer.name,
    portion: `${offer.ounces} oz`,
    ounces: offer.ounces,
    savedAt,
  };
}
