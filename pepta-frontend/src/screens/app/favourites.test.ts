import { describe, expect, it } from 'vitest';
import type { MealLogResponse } from '@pepta/shared';
import {
  addFavourite,
  applyPortionEdit,
  countsByKind,
  isPortionEditValid,
  favouriteFromOffer,
  favouriteId,
  favouritesOf,
  isSaved,
  removeFavourite,
  favouriteFromDrinkOffer,
  worthSaving,
  worthSavingDrinks,
  startingSuggestions,
  worthSavingReason,
  type Favourite,
} from './favourites';

const NOW = new Date('2026-08-17T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function meal(foodName: string, servingSize: string, at: string, over: Partial<MealLogResponse> = {}) {
  return {
    id: `${foodName}-${at}`,
    foodName,
    servingSize,
    protein: 30,
    calories: 200,
    datetime: at,
    deletedAt: null,
    ...over,
  } as unknown as MealLogResponse;
}

const fav = (name: string, portion: string, kind: 'food' | 'drink' = 'food'): Favourite => ({
  id: favouriteId(kind, name, portion),
  kind,
  name,
  portion,
  savedAt: NOW.toISOString(),
});

describe('favouriteId', () => {
  it('makes the PORTION part of the identity', () => {
    expect(favouriteId('food', 'Chicken breast', '4 oz')).not.toBe(
      favouriteId('food', 'Chicken breast', '6 oz'),
    );
  });

  it('ignores casing and spacing, so one food is not saved twice', () => {
    expect(favouriteId('food', ' Chicken  Breast ', '6 OZ')).toBe(
      favouriteId('food', 'chicken breast', '6 oz'),
    );
  });

  it('keeps food and drinks apart', () => {
    expect(favouriteId('food', 'Water', '16 oz')).not.toBe(favouriteId('drink', 'Water', '16 oz'));
  });
});

describe('the saved list', () => {
  it('puts the newest first and never duplicates a portion', () => {
    let list = addFavourite([], fav('Chicken breast', '6 oz'));
    list = addFavourite(list, fav('Greek yogurt', '1 cup'));
    list = addFavourite(list, fav('Chicken breast', '6 oz'));
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe('Chicken breast');
  });

  it('keeps two portions of the same food as two favourites', () => {
    let list = addFavourite([], fav('Chicken breast', '4 oz'));
    list = addFavourite(list, fav('Chicken breast', '6 oz'));
    expect(list).toHaveLength(2);
  });

  it('removes by id, and reports what is saved', () => {
    const one = fav('Chicken breast', '6 oz');
    const list = addFavourite([], one);
    expect(isSaved(list, one.id)).toBe(true);
    expect(isSaved(removeFavourite(list, one.id), one.id)).toBe(false);
  });

  it('splits and counts by kind for the tabs', () => {
    const list = [fav('Chicken breast', '6 oz'), fav('Water bottle', '16 oz', 'drink')];
    expect(countsByKind(list)).toEqual({ food: 1, drink: 1 });
    expect(favouritesOf(list, 'drink')).toHaveLength(1);
  });
});

describe('worthSaving', () => {
  const thrice = [meal('Protein bar', '1 bar', daysAgo(1)), meal('Protein bar', '1 bar', daysAgo(3)), meal('Protein bar', '1 bar', daysAgo(6))];

  it('offers what was logged enough times', () => {
    const out = worthSaving(thrice, [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Protein bar');
    expect(out[0]!.count).toBe(3);
    expect(worthSavingReason(out[0]!.count)).toBe('Logged 3 times in two weeks');
  });

  it('stays quiet below the threshold', () => {
    expect(worthSaving(thrice.slice(0, 2), [], NOW)).toEqual([]);
  });

  it('ignores logs older than the window', () => {
    const stale = [meal('Old thing', '1', daysAgo(20)), meal('Old thing', '1', daysAgo(21)), meal('Old thing', '1', daysAgo(22))];
    expect(worthSaving(stale, [], NOW)).toEqual([]);
  });

  it('does not count a log the user deleted', () => {
    const withDeleted = [...thrice.slice(0, 2), meal('Protein bar', '1 bar', daysAgo(2), { deletedAt: daysAgo(1) })];
    expect(worthSaving(withDeleted, [], NOW)).toEqual([]);
  });

  it('never offers something already saved', () => {
    const saved = [fav('Protein bar', '1 bar')];
    expect(worthSaving(thrice, saved, NOW)).toEqual([]);
  });

  it('treats different portions of one food as different habits', () => {
    const mixed = [
      meal('Chicken breast', '4 oz', daysAgo(1)),
      meal('Chicken breast', '6 oz', daysAgo(2)),
      meal('Chicken breast', '8 oz', daysAgo(3)),
    ];
    // Three logs, but no single portion reaches the threshold — offering one
    // would put a portion they never used a tap away.
    expect(worthSaving(mixed, [], NOW)).toEqual([]);
  });

  it('ranks most-logged first and caps the list', () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => meal('Bar', '1', daysAgo(i))),
      ...Array.from({ length: 5 }, (_, i) => meal('Eggs', '3', daysAgo(i))),
      ...Array.from({ length: 4 }, (_, i) => meal('Yogurt', '1 cup', daysAgo(i))),
      ...Array.from({ length: 3 }, (_, i) => meal('Shake', '1', daysAgo(i))),
    ];
    const out = worthSaving(many, [], NOW);
    expect(out).toHaveLength(3);
    expect(out.map((o) => o.name)).toEqual(['Bar', 'Eggs', 'Yogurt']);
  });

  it('survives no logs, and rubbish datetimes, without throwing', () => {
    expect(worthSaving(null, [], NOW)).toEqual([]);
    expect(worthSaving(undefined, [], NOW)).toEqual([]);
    const bad = Array.from({ length: 3 }, () => meal('X', '1', 'not-a-date'));
    expect(worthSaving(bad, [], NOW)).toEqual([]);
  });

  it('ignores a log dated in the future', () => {
    const ahead = Array.from({ length: 3 }, () =>
      meal('Tomorrow', '1', new Date(NOW.getTime() + 86_400_000).toISOString()),
    );
    expect(worthSaving(ahead, [], NOW)).toEqual([]);
  });

  it('carries the macros through, so saving keeps the numbers', () => {
    const offer = worthSaving(thrice, [], NOW)[0]!;
    const saved = favouriteFromOffer(offer, NOW.toISOString());
    expect(saved).toMatchObject({ kind: 'food', name: 'Protein bar', portion: '1 bar', protein: 30, calories: 200 });
    expect(saved.id).toBe(offer.key);
  });
});

describe('worthSavingDrinks', () => {
  const water = (amountOz: number, at: string, over: Record<string, unknown> = {}) =>
    ({ id: `${amountOz}-${at}`, amountOz, datetime: at, deletedAt: null, ...over }) as never;
  const named = (oz: number) => (oz === 34 ? 'Sports bottle' : oz === 16 ? 'Bottle' : null);

  const thrice = [water(34, daysAgo(1)), water(34, daysAgo(3)), water(34, daysAgo(6))];

  it('groups by the VOLUME, which is the thing water logs actually record', () => {
    const out = worthSavingDrinks(thrice, [], NOW, named);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Sports bottle', ounces: 34, count: 3 });
  });

  it('names an amount that is not a vessel after the amount, not a near miss', () => {
    const out = worthSavingDrinks([water(20, daysAgo(1)), water(20, daysAgo(2)), water(20, daysAgo(3))], [], NOW, named);
    // 20 is between a 16 oz bottle and a 24 oz shaker — calling it either
    // would claim they drank something they did not.
    expect(out[0]!.name).toBe('20 oz');
  });

  it('stays quiet below the threshold', () => {
    expect(worthSavingDrinks(thrice.slice(0, 2), [], NOW, named)).toEqual([]);
  });

  it('ignores logs outside the window, deleted logs, and nonsense', () => {
    expect(worthSavingDrinks([water(34, daysAgo(30)), water(34, daysAgo(31)), water(34, daysAgo(32))], [], NOW, named)).toEqual([]);
    expect(
      worthSavingDrinks([...thrice.slice(0, 2), water(34, daysAgo(2), { deletedAt: daysAgo(1) })], [], NOW, named),
    ).toEqual([]);
    expect(worthSavingDrinks([water(0, daysAgo(1)), water(-4, daysAgo(2)), water(34, daysAgo(3))], [], NOW, named)).toEqual([]);
  });

  it('does not offer one already saved', () => {
    const saved = [favouriteFromDrinkOffer(worthSavingDrinks(thrice, [], NOW, named)[0]!, NOW.toISOString())];
    expect(worthSavingDrinks(thrice, saved, NOW, named)).toEqual([]);
  });

  it('treats two different volumes as two habits', () => {
    const mixed = [...thrice, water(12, daysAgo(1)), water(12, daysAgo(2)), water(12, daysAgo(4))];
    expect(worthSavingDrinks(mixed, [], NOW, named).map((d) => d.ounces)).toEqual([34, 12]);
  });

  it('ranks most-added first and caps the list', () => {
    const many = [
      ...Array.from({ length: 6 }, (_, i) => water(34, daysAgo(i))),
      ...Array.from({ length: 5 }, (_, i) => water(16, daysAgo(i))),
      ...Array.from({ length: 4 }, (_, i) => water(12, daysAgo(i))),
      ...Array.from({ length: 3 }, (_, i) => water(8, daysAgo(i))),
    ];
    expect(worthSavingDrinks(many, [], NOW, named).map((d) => d.ounces)).toEqual([34, 16, 12]);
  });

  it('survives no logs at all', () => {
    expect(worthSavingDrinks(null, [], NOW, named)).toEqual([]);
    expect(worthSavingDrinks(undefined, [], NOW, named)).toEqual([]);
  });

  it('saves with its volume, so it can be logged and can join Quick add', () => {
    const offer = worthSavingDrinks(thrice, [], NOW, named)[0]!;
    const fav = favouriteFromDrinkOffer(offer, NOW.toISOString());
    expect(fav).toMatchObject({ kind: 'drink', name: 'Sports bottle', portion: '34 oz', ounces: 34 });
  });
});

describe('startingSuggestions', () => {
  it('offers only this tab\'s kind — the tabs partition, always', () => {
    // A drink offered under Food would be saved into the other tab and vanish
    // from the row the user just tapped.
    expect(startingSuggestions([], 'food').every((s) => s.kind === 'food')).toBe(true);
    expect(startingSuggestions([], 'drink').every((s) => s.kind === 'drink')).toBe(true);
  });

  it('covers both sides between them', () => {
    expect(startingSuggestions([], 'food').length).toBeGreaterThan(0);
    expect(startingSuggestions([], 'drink').length).toBeGreaterThan(0);
  });

  it('stops on BOTH tabs the moment anything is saved, on either side', () => {
    const food = [fav('Chicken breast', '6 oz')];
    expect(startingSuggestions(food, 'food')).toEqual([]);
    // A curated Food list must not leave Drinks looking like a first run.
    expect(startingSuggestions(food, 'drink')).toEqual([]);
    const drink = [fav('Water bottle', '16 oz', 'drink')];
    expect(startingSuggestions(drink, 'food')).toEqual([]);
    expect(startingSuggestions(drink, 'drink')).toEqual([]);
  });

  it('carries the numbers each one needs to be saved and logged', () => {
    for (const kind of ['food', 'drink'] as const) {
      for (const s of startingSuggestions([], kind)) {
        expect(s.name.length).toBeGreaterThan(0);
        expect(s.portion.length).toBeGreaterThan(0);
        if (s.kind === 'drink') expect(s.ounces).toBeGreaterThan(0);
        else expect(s.protein).toBeGreaterThan(0);
      }
    }
  });
});

describe('applyPortionEdit', () => {
  const chicken = fav('Chicken breast', '6 oz, grilled');
  const withMacros: Favourite = { ...chicken, protein: 54, calories: 280 };

  it('moves the portion AND the numbers together', () => {
    const { next } = applyPortionEdit(withMacros, { portion: '8 oz, grilled', protein: 72, calories: 373 }, 'now');
    expect(next.portion).toBe('8 oz, grilled');
    expect(next.protein).toBe(72);
    expect(next.calories).toBe(373);
  });

  it('re-keys, and says which row to remove — a portion is part of the id', () => {
    const out = applyPortionEdit(withMacros, { portion: '8 oz, grilled', protein: 72 }, 'now');
    expect(out.removeId).toBe(withMacros.id);
    expect(out.next.id).not.toBe(withMacros.id);
    // Without the removal the user would end up holding both portions.
    expect(out.next.id).toBe(favouriteId('food', 'Chicken breast', '8 oz, grilled'));
  });

  it('removes nothing when only the numbers changed', () => {
    const out = applyPortionEdit(withMacros, { portion: '6 oz, grilled', protein: 56 }, 'now');
    expect(out.removeId).toBeUndefined();
    expect(out.next.protein).toBe(56);
  });

  it('trims, so " 8 oz " and "8 oz" are not two favourites', () => {
    expect(applyPortionEdit(withMacros, { portion: '  8 oz  ', protein: 72 }, 'now').next.portion).toBe('8 oz');
  });

  it('drops a figure the edit no longer carries rather than keeping a stale one', () => {
    const { next } = applyPortionEdit(withMacros, { portion: '6 oz, grilled', calories: 280 }, 'now');
    expect(next.protein).toBeUndefined();
  });
});

describe('isPortionEditValid', () => {
  const food = { ...fav('Chicken breast', '6 oz'), protein: 54, calories: 280 };
  const drink = { ...fav('Water bottle', '16 oz', 'drink'), ounces: 16 };

  it('needs portion wording', () => {
    expect(isPortionEditValid(food, { portion: '  ', protein: 54 })).toBe(false);
  });

  it('needs a volume on a drink — Log would add nothing without one', () => {
    expect(isPortionEditValid(drink, { portion: '20 oz' })).toBe(false);
    expect(isPortionEditValid(drink, { portion: '20 oz', ounces: 20 })).toBe(true);
  });

  it('needs at least one figure on a food', () => {
    expect(isPortionEditValid(food, { portion: '8 oz' })).toBe(false);
    expect(isPortionEditValid(food, { portion: '8 oz', calories: 373 })).toBe(true);
  });
});
