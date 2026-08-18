import { describe, expect, it } from 'vitest';
import { parseFavourites } from './favouritesStore';

describe('parseFavourites', () => {
  const good = {
    id: 'food:chicken-breast:6-oz',
    kind: 'food',
    name: 'Chicken breast',
    portion: '6 oz',
    protein: 54,
    calories: 280,
    savedAt: '2026-08-17T12:00:00.000Z',
  };

  it('round-trips a saved list', () => {
    expect(parseFavourites(JSON.stringify([good]))).toEqual([{ ...good, fiber: undefined, ounces: undefined }]);
  });

  it('reads anything malformed as nothing saved, never a throw', () => {
    for (const raw of [null, '', 'not json', '{}', 'null', '"a string"', '42']) {
      expect(parseFavourites(raw), `raw=${String(raw)}`).toEqual([]);
    }
  });

  it('drops only the bad rows, keeping the good ones', () => {
    const mixed = JSON.stringify([
      good,
      { ...good, id: '' },
      { ...good, id: 'x', kind: 'snack' },
      { ...good, id: 'y', name: '' },
      { ...good, id: 'z', savedAt: 12 },
      null,
      'nope',
    ]);
    const out = parseFavourites(mixed);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(good.id);
  });

  it('ignores non-finite numbers rather than storing NaN', () => {
    const out = parseFavourites(JSON.stringify([{ ...good, protein: 'lots', calories: null }]));
    expect(out[0]!.protein).toBeUndefined();
    expect(out[0]!.calories).toBeUndefined();
  });

  it('keeps a drink volume, which is what its Log button needs', () => {
    const drink = { ...good, id: 'drink:vita-coco:16-9-fl-oz', kind: 'drink', ounces: 16.9 };
    expect(parseFavourites(JSON.stringify([drink]))[0]!.ounces).toBe(16.9);
  });

  it('accepts an empty portion — some drinks have none', () => {
    expect(parseFavourites(JSON.stringify([{ ...good, portion: '' }]))).toHaveLength(1);
  });
});
