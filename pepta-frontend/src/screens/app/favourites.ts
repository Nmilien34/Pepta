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
  /** The user's own photo. Stored as an opaque media id, read as a signed URL. */
  photoMediaId?: string;
  photoUrl?: string | null;
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
/**
 * The bundled fallback. The real set is seeded server-side and arrives with
 * the list — this only covers a failed fetch, so an offline first run still
 * offers something rather than a dead end.
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
  /** From the server. Falls back to the bundled set if the fetch failed. */
  seeded: readonly Favourite[] = STARTING_SUGGESTIONS,
): Favourite[] {
  if (saved.length > 0) return [];
  const source = seeded.length > 0 ? seeded : STARTING_SUGGESTIONS;
  return source.filter((s) => s.kind === kind);
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

/**
 * Editing a saved portion.
 *
 * THE PORTION AND THE NUMBERS MOVE TOGETHER, always. Changing "6 oz" to "8 oz"
 * while the protein stays at 54 g produces a favourite that logs the wrong
 * figure every time it is tapped — quietly, forever, on the one screen built
 * for one-tap logging. So an edit takes both, and the caller cannot supply one
 * without the other.
 *
 * The portion is part of the id, so an edit is a NEW favourite: the old row
 * has to be removed rather than mutated, or the user ends up with both.
 */
export interface PortionEdit {
  portion: string;
  protein?: number;
  calories?: number;
  fiber?: number;
  ounces?: number;
}

export interface PortionEditResult {
  /** The row to remove — absent when the id did not change. */
  removeId?: string;
  next: Favourite;
}

export function applyPortionEdit(
  fav: Favourite,
  edit: PortionEdit,
  savedAt: string,
): PortionEditResult {
  const portion = edit.portion.trim();
  const next: Favourite = {
    ...fav,
    id: favouriteId(fav.kind, fav.name, portion),
    portion,
    protein: edit.protein,
    calories: edit.calories,
    fiber: edit.fiber,
    ounces: edit.ounces,
    savedAt,
  };
  return next.id === fav.id ? { next } : { removeId: fav.id, next };
}

/** A portion with no wording, or a drink with no volume, cannot be saved. */
export function isPortionEditValid(fav: Favourite, edit: PortionEdit): boolean {
  if (edit.portion.trim().length === 0) return false;
  if (fav.kind === 'drink') return edit.ounces != null && edit.ounces > 0;
  // A food with no figures at all would log nothing.
  return (edit.protein != null && edit.protein > 0) || (edit.calories != null && edit.calories > 0);
}

/**
 * Creating a favourite the user typed themselves.
 *
 * KIND IS CHOSEN, NEVER GUESSED. A drink and a food are not the same record:
 * a drink's Log adds ounces to the water total and it draws as a vessel; a
 * food's Log writes a meal and it draws as a tile. Inferring that from a name
 * would put "protein shake" in the wrong one, so the caller states it and the
 * fields required follow from it.
 *
 * The id is built the same way as every other favourite, so a hand-typed
 * "Chicken breast, 6 oz" and one saved from the Protein screen are the SAME
 * favourite rather than two rows that look identical.
 */
export interface NewItemDraft {
  kind: FavouriteKind;
  name: string;
  portion: string;
  /** Optional — an item with no photo is still a perfectly good item. */
  photoMediaId?: string;
  /** Local URI, so the row can show it before the upload has been read back. */
  photoUri?: string;
  protein?: number;
  calories?: number;
  fiber?: number;
  ounces?: number;
}

/** What each kind needs before it can be saved AND logged. */
export function isNewItemValid(draft: NewItemDraft): boolean {
  if (draft.name.trim().length === 0) return false;
  if (draft.portion.trim().length === 0) return false;
  if (draft.kind === 'drink') return draft.ounces != null && draft.ounces > 0;
  return (
    (draft.protein != null && draft.protein > 0) ||
    (draft.calories != null && draft.calories > 0)
  );
}

/** Why it cannot be saved yet, in the user's terms. */
export function newItemProblem(draft: NewItemDraft): string | null {
  if (draft.name.trim().length === 0) return 'Give it a name.';
  if (draft.portion.trim().length === 0) return 'Say how much one is.';
  if (draft.kind === 'drink') {
    return draft.ounces != null && draft.ounces > 0
      ? null
      : 'A drink needs a volume, or logging it would add nothing.';
  }
  return (draft.protein != null && draft.protein > 0) || (draft.calories != null && draft.calories > 0)
    ? null
    : 'Add protein or calories, or logging it would record nothing.';
}

export function favouriteFromDraft(draft: NewItemDraft, savedAt: string): Favourite {
  const name = draft.name.trim();
  const portion = draft.portion.trim();
  return {
    id: favouriteId(draft.kind, name, portion),
    kind: draft.kind,
    name,
    portion,
    // Only the figures this kind actually uses — a drink carrying a protein
    // value would show a macro row it never logs.
    ...(draft.kind === 'drink'
      ? { ounces: draft.ounces }
      : { protein: draft.protein, calories: draft.calories, fiber: draft.fiber }),
    source: 'item',
    ...(draft.photoMediaId ? { photoMediaId: draft.photoMediaId } : {}),
    // Shown immediately from the local file; replaced by the signed URL on the
    // next read. Without it the item the user just photographed appears blank.
    ...(draft.photoUri ? { photoUrl: draft.photoUri } : {}),
    savedAt,
  };
}
