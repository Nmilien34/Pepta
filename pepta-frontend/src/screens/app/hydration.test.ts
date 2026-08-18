import { describe, expect, it } from 'vitest';
import {
  BIG_VESSELS,
  HYDRATION_EXAMPLES,
  VESSELS,
  goalLine,
  ouncesLabel,
  quickAddVessels,
  vesselForOunces,
} from './hydration';

describe('VESSELS', () => {
  it('runs small to large — the design\'s six', () => {
    expect(VESSELS.map((v) => v.ounces)).toEqual([8, 12, 16, 24, 34, 40]);
  });

  it('labels every sized vessel with the amount it actually adds', () => {
    for (const vessel of VESSELS) {
      if (vessel.ounces == null) continue;
      expect(vessel.label).toBe(`+${vessel.ounces} oz`);
    }
  });

  it('keeps keys unique', () => {
    expect(new Set(VESSELS.map((v) => v.key)).size).toBe(VESSELS.length);
  });
});

describe('HYDRATION_EXAMPLES', () => {
  it('carries a volume, an electrolyte fact and a loggable amount for each', () => {
    for (const drink of HYDRATION_EXAMPLES) {
      expect(drink.brand.length).toBeGreaterThan(0);
      expect(drink.volume).toMatch(/oz$/);
      expect(drink.fact.length).toBeGreaterThan(0);
      expect(drink.ounces).toBeGreaterThan(0);
    }
  });

  it('logs the MIXED volume for a stick, not the sachet', () => {
    // "Makes 16 fl oz" must add 16, or logging an LMNT would add nothing.
    for (const drink of HYDRATION_EXAMPLES) {
      const stated = Number(drink.volume.match(/([\d.]+)/)![1]);
      expect(drink.ounces).toBeCloseTo(stated, 5);
    }
  });

  it('keeps keys unique — they index the photos', () => {
    expect(new Set(HYDRATION_EXAMPLES.map((d) => d.key)).size).toBe(HYDRATION_EXAMPLES.length);
  });
});

describe('goalLine', () => {
  it('names the goal when there is one', () => {
    expect(goalLine(100)).toBe('of your 100 oz goal');
  });

  it('asks for a goal rather than claiming one of zero', () => {
    for (const target of [null, 0, -5]) {
      expect(goalLine(target)).toBe('Set a daily water goal in your profile');
    }
  });
});

describe('ouncesLabel', () => {
  it('keeps a real decimal and drops an invented one', () => {
    expect(ouncesLabel(16)).toBe('16 oz');
    expect(ouncesLabel(16.9)).toBe('16.9 oz');
    expect(ouncesLabel(8.5)).toBe('8.5 oz');
  });

  it('does not render floating-point noise', () => {
    expect(ouncesLabel(0.1 + 0.2)).toBe('0.3 oz');
  });
});

describe('quickAddVessels', () => {
  it('keeps the design\'s six, and ends on Custom', () => {
    const row = quickAddVessels(100, 0);
    expect(row.slice(0, 6).map((v) => v.ounces)).toEqual([8, 12, 16, 24, 34, 40]);
    expect(row[row.length - 1]!.key).toBe('custom');
    expect(row[row.length - 1]!.ounces).toBeNull();
  });

  it('stays sorted by size all the way along', () => {
    for (const [target, current] of [[100, 0], [100, 42], [128, 3], [64, 10]] as const) {
      const sized = quickAddVessels(target, current)
        .filter((v) => v.ounces != null)
        .map((v) => v.ounces!);
      expect(sized, `goal ${target}, logged ${current}`).toEqual([...sized].sort((a, b) => a - b));
    }
  });

  it('reaches far enough to fill the cup — the point of extending it', () => {
    // The named vessels stop at 40, so a 100 oz goal must offer more than 40.
    const row = quickAddVessels(100, 0);
    const biggest = Math.max(...row.map((v) => v.ounces ?? 0));
    expect(biggest).toBe(100);
    expect(row.find((v) => v.name === 'Fill the cup')?.ounces).toBe(100);
  });

  it('fills only what is LEFT once some is logged', () => {
    const row = quickAddVessels(100, 42);
    const fill = row.find((v) => v.name === 'Fill the cup');
    expect(fill?.ounces).toBe(58);
    expect(fill?.label).toBe('+58 oz');
  });

  it('never offers an amount that overshoots the goal', () => {
    for (const target of [40, 64, 100, 128]) {
      for (const v of quickAddVessels(target, 0)) {
        if (v.ounces == null) continue;
        expect(v.ounces, `${v.name} on a ${target} oz goal`).toBeLessThanOrEqual(target);
      }
    }
  });

  it('withholds a gallon jug from a small goal', () => {
    expect(quickAddVessels(64, 0).some((v) => v.key === 'gallon')).toBe(false);
    expect(quickAddVessels(128, 0).some((v) => v.key === 'gallon')).toBe(true);
  });

  it('stops offering a fill once the goal is met or passed', () => {
    for (const current of [100, 140]) {
      expect(quickAddVessels(100, current).some((v) => v.name === 'Fill the cup')).toBe(false);
    }
  });

  it('does not duplicate an amount a named vessel already offers', () => {
    // 60 remaining of a 64 goal would be new; 24 remaining is already a Shaker.
    const row = quickAddVessels(64, 40);
    const amounts = row.map((v) => v.ounces).filter((o): o is number => o != null);
    expect(new Set(amounts).size).toBe(amounts.length);
  });

  it('falls back to the plain row when no goal is set', () => {
    for (const target of [null, 0]) {
      const row = quickAddVessels(target, 0);
      expect(row.map((v) => v.key)).toEqual([...VESSELS.map((v) => v.key), 'custom']);
      expect(row.some((v) => v.name === 'Fill the cup')).toBe(false);
    }
  });

  it('handles a fractional remainder without floating-point noise', () => {
    expect(quickAddVessels(100, 57.9).find((v) => v.name === 'Fill the cup')?.label).toBe('+42.1 oz');
  });

  it('keeps every key unique so the row can be rendered by key', () => {
    const row = quickAddVessels(128, 3);
    expect(new Set(row.map((v) => v.key)).size).toBe(row.length);
  });

  it('BIG_VESSELS carry labels matching their amounts', () => {
    for (const v of BIG_VESSELS) expect(v.label).toBe(`+${v.ounces} oz`);
  });
});

describe('vesselForOunces', () => {
  it('picks the nearest familiar shape', () => {
    expect(vesselForOunces(8)).toBe('glass');
    expect(vesselForOunces(12)).toBe('mug');
    expect(vesselForOunces(16)).toBe('bottle');
    expect(vesselForOunces(64)).toBe('jug');
  });

  it('rounds to the nearest rather than always up', () => {
    // 13 is closer to a 12 oz mug than a 16 oz bottle.
    expect(vesselForOunces(13)).toBe('mug');
  });

  it('falls back to a glass when there is no volume', () => {
    expect(vesselForOunces(undefined)).toBe('glass');
  });
});

describe('quickAddVessels with saved drinks', () => {
  const saved = [{ name: 'Desk bottle', ounces: 21 }];

  it('puts a starred drink in Quick add — one idea, not two lists', () => {
    const row = quickAddVessels(100, 0, saved);
    const mine = row.find((v) => v.name === 'Desk bottle');
    expect(mine?.ounces).toBe(21);
    expect(mine?.label).toBe('+21 oz');
  });

  it('keeps the row sorted with the saved one in place', () => {
    const sized = quickAddVessels(100, 0, saved)
      .filter((v) => v.ounces != null)
      .map((v) => v.ounces!);
    expect(sized).toEqual([...sized].sort((a, b) => a - b));
  });

  it('skips a saved drink that duplicates an amount already offered', () => {
    const row = quickAddVessels(100, 0, [{ name: 'My bottle', ounces: 16 }]);
    expect(row.filter((v) => v.ounces === 16)).toHaveLength(1);
  });

  it('ignores a saved drink with no volume — there is nothing to add', () => {
    const row = quickAddVessels(100, 0, [{ name: 'Mystery', ounces: undefined }]);
    expect(row.some((v) => v.name === 'Mystery')).toBe(false);
  });

  it('still offers saved drinks when no goal is set', () => {
    expect(quickAddVessels(null, 0, saved).some((v) => v.name === 'Desk bottle')).toBe(true);
  });

  it('keeps Custom last whatever is saved', () => {
    const row = quickAddVessels(100, 0, saved);
    expect(row[row.length - 1]!.key).toBe('custom');
  });
});
