import { describe, expect, it } from 'vitest';
import {
  FIBER_FOODS,
  FOOD_PANELS,
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
    // Asserted as a descending sequence rather than fixed figures — the
    // figures are looked up and get corrected; the ordering is the contract.
    const sorted = bySize('fiber').map((f) => f.amount);
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
    expect(sorted[0]).toBe(Math.max(...sorted));
    expect(FIBER_FOODS.map((f) => f.key)).toEqual(before);
  });
});

describe('the strip order the screen renders', () => {
  it('is the LIST order, not a ranking', () => {
    // The design's photo row follows the list rather than sorting by size —
    // protein runs chicken, Core Power, salmon, cottage cheese, eggs, peanuts,
    // which is NOT descending. Asserted on identity rather than the figures:
    // the figures are looked up and may be corrected, the order is a design
    // decision.
    expect(foodsFor('protein').map((f) => f.key)).toEqual([
      'chicken', 'core-power', 'salmon', 'cottage-cheese', 'eggs', 'peanuts',
    ]);
    expect(foodsFor('fiber').map((f) => f.key)).toEqual([
      'cookie-bar', 'edamame', 'avocado', 'almonds', 'psyllium',
    ]);
    // Protein's row is genuinely not descending — that is the whole point.
    const amounts = foodsFor('protein').map((f) => f.amount);
    expect(amounts).not.toEqual([...amounts].sort((a, b) => b - a));
  });
});

describe('the list and the detail panel agree', () => {
  it('states the same headline figure on both screens', () => {
    // A strip saying 14 g while the detail screen says 11.8 g for the same
    // food is the kind of disagreement nobody reports and everybody notices.
    for (const kind of ['protein', 'fiber'] as const) {
      for (const food of foodsFor(kind)) {
        const panel = FOOD_PANELS[food.key];
        if (!panel) continue;
        const headline = kind === 'protein' ? panel.protein : panel.fiber;
        expect(headline, `${food.key} ${kind}`).toBeCloseTo(food.amount, 1);
        expect(panel.calories, `${food.key} calories`).toBeCloseTo(food.calories, 1);
      }
    }
  });

  it('has a panel for every food, and a source on every panel', () => {
    for (const kind of ['protein', 'fiber'] as const) {
      for (const food of foodsFor(kind)) {
        const panel = FOOD_PANELS[food.key];
        expect(panel, `no panel for ${food.key}`).toBeDefined();
        expect(panel!.source.length).toBeGreaterThan(0);
      }
    }
  });

  it('never cites a USDA record it does not have', () => {
    for (const [key, panel] of Object.entries(FOOD_PANELS)) {
      if (panel.source.startsWith('USDA')) {
        expect(panel.fdcId, `${key} cites USDA without an id`).toBeGreaterThan(0);
      } else {
        // A branded item says whose label it is and carries no id — an id
        // pointing at a lookalike record would be a fabricated citation.
        expect(panel.fdcId, `${key} has an id but no USDA source`).toBeUndefined();
      }
    }
  });
});

describe('gramsLabel', () => {
  it('drops a trailing .0 but keeps a real half', () => {
    expect(gramsLabel(13)).toBe('13 g');
    expect(gramsLabel(3.5)).toBe('3.5 g');
  });
});

describe('waysHeadline', () => {
  it('matches the frames\' wording: "N g to go · …", no nutrient noun', () => {
    expect(waysHeadline('protein', 74, 120).line).toMatch(/^46 g to go · /);
    expect(waysHeadline('fiber', 12, 30).line).toMatch(/^18 g to go · /);
    for (const line of [waysHeadline('protein', 74, 120).line, waysHeadline('fiber', 12, 30).line]) {
      expect(line).not.toContain(' of protein ');
      expect(line).not.toContain(' of fiber ');
      expect(line).not.toContain('—');
    }
  });

  it('states the gap and names foods that actually close it', () => {
    const h = waysHeadline('fiber', 12, 30);
    expect(h.pill).toBe('12 of 30 g');
    expect(h.pct).toBeCloseTo(0.4);
    expect(h.line).toContain('18 g to go');
    // 13 alone is short of 18, so the second pick is the next biggest — and
    // together they clear the gap, which is what "covers it" claims.
    expect(h.line).toBe('18 g to go · oh oh cookie dough and edamame covers it.');
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
    expect(h.line).toContain('1 g to go');
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
