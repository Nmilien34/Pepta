import { describe, expect, it } from 'vitest';
import {
  FIBER_FOODS,
  PROTEIN_FOODS,
  foodsFor,
  gramsLabel,
  bySize,
  waysHeadline,
} from './nutrientWays';

describe('the food lists', () => {
  it('carries a photo key, a serving and both figures for every item', () => {
    for (const food of [...FIBER_FOODS, ...PROTEIN_FOODS]) {
      expect(food.key).toMatch(/^[a-z-]+$/);
      expect(food.serving.length).toBeGreaterThan(0);
      expect(food.amount).toBeGreaterThan(0);
      expect(food.calories).toBeGreaterThan(0);
    }
  });

  it('keeps keys unique within a list — they index the photos', () => {
    for (const list of [FIBER_FOODS, PROTEIN_FOODS]) {
      expect(new Set(list.map((f) => f.key)).size).toBe(list.length);
    }
  });
});

describe('bySize', () => {
  it('runs biggest first, without mutating the source list', () => {
    const before = FIBER_FOODS.map((f) => f.key);
    expect(bySize('fiber').map((f) => f.amount)).toEqual([13, 8, 7, 3.5, 3]);
    expect(FIBER_FOODS.map((f) => f.key)).toEqual(before);
  });
});

describe('the strip order the screen renders', () => {
  it('is the LIST order, matching the design frames', () => {
    // Protein's photo row in the design runs 35, 42, 40, 14, 12, 7 — the list,
    // not a ranking. Sorting it would silently diverge from the frame.
    expect(foodsFor('protein').map((f) => f.amount)).toEqual([35, 42, 40, 14, 12, 7]);
    expect(foodsFor('fiber').map((f) => f.amount)).toEqual([13, 8, 7, 3.5, 3]);
  });
});

describe('gramsLabel', () => {
  it('drops a trailing .0 but keeps a real half', () => {
    expect(gramsLabel(13)).toBe('13 g');
    expect(gramsLabel(3.5)).toBe('3.5 g');
  });
});

describe('waysHeadline', () => {
  it('states the gap and names foods that actually close it', () => {
    const h = waysHeadline('fiber', 12, 30);
    expect(h.pill).toBe('12 of 30 g');
    expect(h.pct).toBeCloseTo(0.4);
    expect(h.line).toContain('18 g of fiber to go');
    // 13 alone is short of 18, so the second pick is the next biggest — and
    // together they clear the gap, which is what "covers it" claims.
    expect(h.line).toBe('18 g of fiber to go — oh oh cookie dough and edamame covers it.');
  });

  it('names only foods on this screen, so the sentence survives a data edit', () => {
    const line = waysHeadline('protein', 74, 120).line;
    const named = PROTEIN_FOODS.some((f) => line.includes(f.name.toLowerCase()));
    expect(named).toBe(true);
  });

  it('congratulates instead of demanding once the target is met', () => {
    for (const current of [30, 44]) {
      const h = waysHeadline('fiber', current, 30);
      expect(h.pct).toBe(1);
      expect(h.line).toContain('Target met');
      expect(h.line).not.toContain('to go');
    }
  });

  it('still suggests something when the gap is smaller than any single food', () => {
    // 1 g left, smallest fiber food is 3 g — suggest it rather than nothing.
    const h = waysHeadline('fiber', 29, 30);
    expect(h.line).toContain('1 g of fiber to go');
    expect(h.line).toContain('covers it');
  });

  it('picks foods that genuinely reach the gap, never just approach it', () => {
    for (const [current, target] of [[12, 30], [0, 30], [26, 30], [74, 120]] as const) {
      const kind = target === 120 ? 'protein' : 'fiber';
      const line = waysHeadline(kind, current, target).line;
      const named = foodsFor(kind).filter((f) => line.includes(f.name.toLowerCase()));
      const total = named.reduce((sum, f) => sum + f.amount, 0);
      // At most two are named, so only check coverage when the whole pick set fits.
      if (named.length < 2) expect(total).toBeGreaterThanOrEqual(target - current);
    }
  });

  it('never goes negative or past full on the bar', () => {
    expect(waysHeadline('protein', -5, 120).pct).toBe(0);
    expect(waysHeadline('protein', 500, 120).pct).toBe(1);
  });

  it('survives a zero target without dividing by it', () => {
    const h = waysHeadline('protein', 10, 0);
    expect(h.pct).toBe(0);
    expect(Number.isNaN(h.pct)).toBe(false);
  });
});

describe('foodsFor', () => {
  it('routes each kind to its own list', () => {
    expect(foodsFor('fiber')).toBe(FIBER_FOODS);
    expect(foodsFor('protein')).toBe(PROTEIN_FOODS);
  });
});
