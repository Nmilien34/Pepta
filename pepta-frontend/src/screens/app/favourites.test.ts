import { describe, expect, it } from 'vitest';
import type { MealLogResponse } from '@pepta/shared';
import {
  addFavourite,
  countsByKind,
  favouriteFromOffer,
  favouriteId,
  favouritesOf,
  isSaved,
  removeFavourite,
  worthSaving,
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
