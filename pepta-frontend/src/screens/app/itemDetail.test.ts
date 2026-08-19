import { describe, expect, it } from 'vitest';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  logButtonLabel,
  scaleItem,
  servingsLabel,
  stepServings,
  todayProjection,
  type DetailItem,
  itemFromFavourite,
} from './itemDetail';

const chicken: DetailItem = {
  key: 'chicken', kind: 'food', name: 'Chicken breast',
  servingLabel: '4 oz cooked (112 g)', servingNoun: 'serving',
  calories: 185, protein: 35, carbs: 0, fat: 4, satFat: 1.1, fiber: 0, sodium: 85,
};

const lmnt: DetailItem = {
  key: 'lmnt', kind: 'drink', name: 'Electrolyte mix',
  servingLabel: 'mixed into 16 oz', servingNoun: 'stick',
  calories: 10, ounces: 16, sodium: 1000, potassium: 200, magnesium: 60,
};

describe('scaleItem', () => {
  it('multiplies every figure by the amount about to be logged', () => {
    expect(scaleItem(chicken, 2)).toMatchObject({ protein: 70, calories: 370, fat: 8, satFat: 2.2, sodium: 170 });
  });

  it('leaves a figure it does not have undefined rather than zero', () => {
    expect(scaleItem(chicken, 2).potassium).toBeUndefined();
    // A real zero survives — 0 g carbs is a fact, not a gap.
    expect(scaleItem(chicken, 2).carbs).toBe(0);
  });

  it('scales a drink to its volume', () => {
    expect(scaleItem(lmnt, 3)).toMatchObject({ ounces: 48, sodium: 3000, calories: 30 });
  });

  it('keeps one decimal without inventing floating-point noise', () => {
    expect(scaleItem(chicken, 3).satFat).toBe(3.3);
  });
});

describe('stepServings', () => {
  it('never goes below one — logging zero is not a log', () => {
    expect(stepServings(1, -1)).toBe(MIN_SERVINGS);
    expect(stepServings(1, -5)).toBe(MIN_SERVINGS);
  });

  it('steps up and down otherwise', () => {
    expect(stepServings(1, 1)).toBe(2);
    expect(stepServings(3, -1)).toBe(2);
  });

  it('caps rather than running away', () => {
    expect(stepServings(MAX_SERVINGS, 1)).toBe(MAX_SERVINGS);
  });
});

describe('todayProjection', () => {
  it('says where today stands and where this would take it', () => {
    const p = todayProjection(74, 120, 35, 'g');
    expect(p.from).toBe(74);
    expect(p.to).toBe(109);
    expect(p.remainderLine).toBe('11 g would still be left');
  });

  it('splits the bar into logged and about-to-be-logged', () => {
    const p = todayProjection(60, 120, 30, 'g');
    expect(p.loggedPct).toBeCloseTo(0.5);
    expect(p.addedPct).toBeCloseTo(0.25);
  });

  it('never lets the two segments sum past a full bar', () => {
    const p = todayProjection(100, 120, 500, 'g');
    expect(p.loggedPct + p.addedPct).toBeLessThanOrEqual(1);
  });

  it('says the overshoot plainly rather than hiding it', () => {
    expect(todayProjection(110, 120, 35, 'g').remainderLine).toBe('That would put you 25 g over');
  });

  it('calls an exact hit an exact hit', () => {
    expect(todayProjection(85, 120, 35, 'g').remainderLine).toBe('That would hit your target exactly');
  });

  it('asks for a target rather than dividing by zero', () => {
    for (const target of [null, 0]) {
      const p = todayProjection(74, target, 35, 'g');
      expect(p.loggedPct).toBe(0);
      expect(p.remainderLine).toMatch(/Set a daily target/);
      expect(Number.isNaN(p.addedPct)).toBe(false);
    }
  });

  it('works in ounces for the water side', () => {
    expect(todayProjection(48, 100, 16, 'oz').remainderLine).toBe('36 oz would still be left');
  });
});

describe('the labels', () => {
  it('pluralises the serving noun', () => {
    expect(servingsLabel(1, 'serving')).toBe('1 serving');
    expect(servingsLabel(2, 'serving')).toBe('2 servings');
    expect(servingsLabel(1, 'stick')).toBe('1 stick');
  });

  it('tells a drink what it actually adds', () => {
    expect(logButtonLabel(lmnt, 1)).toBe('Log 1 stick · 16 oz');
    expect(logButtonLabel(lmnt, 2)).toBe('Log 2 sticks · 32 oz');
  });

  it('leaves a food to its servings', () => {
    expect(logButtonLabel(chicken, 1)).toBe('Log 1 serving');
    expect(logButtonLabel(chicken, 3)).toBe('Log 3 servings');
  });
});

describe('opening a favourite the user made themselves', () => {
  const base = {
    id: 'food:desk-lunch:1-box',
    kind: 'food' as const,
    name: 'Desk lunch',
    portion: '1 box',
    protein: 30,
    savedAt: '2026-08-19T12:00:00.000Z',
  };

  it('carries their photo onto the detail screen', () => {
    expect(itemFromFavourite({ ...base, photoUrl: 'https://s3/signed' }).photo).toEqual({
      uri: 'https://s3/signed',
    });
  });

  it('leaves the hero empty rather than pointing at nothing', () => {
    expect(itemFromFavourite(base).photo).toBeUndefined();
    expect(itemFromFavourite({ ...base, photoUrl: null }).photo).toBeUndefined();
  });

  it('scales what it logs the same either way — a photo changes no number', () => {
    const withPhoto = itemFromFavourite({ ...base, photoUrl: 'https://s3/signed' });
    expect(scaleItem(withPhoto, 2)).toEqual(scaleItem(itemFromFavourite(base), 2));
  });
});
