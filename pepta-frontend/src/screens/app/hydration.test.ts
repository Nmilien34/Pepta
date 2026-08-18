import { describe, expect, it } from 'vitest';
import { HYDRATION_EXAMPLES, VESSELS, goalLine, ouncesLabel } from './hydration';

describe('VESSELS', () => {
  it('runs small to large, with Custom last', () => {
    const sized = VESSELS.filter((v) => v.ounces != null);
    expect(sized.map((v) => v.ounces)).toEqual([8, 12, 16, 24, 34, 40]);
    expect(VESSELS[VESSELS.length - 1]!.ounces).toBeNull();
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
