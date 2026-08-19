import { describe, expect, it } from 'vitest';
import { eatingView, healthyRange, numbersView } from './progressNumbers';

const NOW = new Date(2026, 7, 13, 14, 0, 0);
const at = (daysAgo: number, hour = 12) =>
  new Date(2026, 7, 13 - daysAgo, hour, 0, 0).toISOString();

const meal = (daysAgo: number, calories: number, protein: number, hour = 12) => ({
  id: `m${daysAgo}-${hour}`,
  calories,
  protein,
  datetime: at(daysAgo, hour),
  deletedAt: null,
});

const profile = {
  dailyCalorieTarget: 1800,
  dailyProteinTargetGrams: 120,
  proteinGramsPerKg: 1.4,
  height: 70,
  heightUnit: 'in',
} as never;

describe('what you’re eating', () => {
  it('averages over the days they logged, not over the window', () => {
    // Two days of meals inside a 30-day window. Dividing by 30 would report
    // 120 cal a day and call it a deficit.
    const view = eatingView(
      [meal(0, 1800, 120), meal(1, 1400, 80)] as never,
      [],
      profile,
      NOW,
    );

    expect(view!.caloriesPerDay).toBe(1600);
    expect(view!.proteinPerDay).toBe(100);
  });

  it('adds several meals within one day before averaging', () => {
    const view = eatingView(
      [meal(0, 600, 40, 8), meal(0, 700, 45, 13), meal(0, 500, 35, 19)] as never,
      [],
      profile,
      NOW,
    );

    expect(view!.caloriesPerDay).toBe(1800);
    expect(view!.proteinPerDay).toBe(120);
  });

  it('counts a standalone protein log — a shake without a meal is still protein', () => {
    const withShake = eatingView([meal(0, 1000, 50)] as never, [
      { id: 'p1', grams: 30, datetime: at(0, 16), deletedAt: null },
    ] as never, profile, NOW);

    expect(withShake!.proteinPerDay).toBe(80);
  });

  it('ignores anything outside the window, and anything deleted', () => {
    const view = eatingView(
      [
        meal(0, 2000, 100),
        { ...meal(40, 9999, 999), id: 'old' },
        { ...meal(1, 9999, 999), id: 'gone', deletedAt: at(0) },
      ] as never,
      [],
      profile,
      NOW,
    );

    expect(view!.caloriesPerDay).toBe(2000);
  });

  it('is null when nothing has been logged — no card beats a card of zeroes', () => {
    expect(eatingView([], [], profile, NOW)).toBeNull();
    expect(eatingView(undefined, undefined, profile, NOW)).toBeNull();
  });

  it('counts protein-target days over the last week only', () => {
    const view = eatingView(
      [meal(0, 1000, 130), meal(1, 1000, 90), meal(2, 1000, 125), meal(20, 1000, 200)] as never,
      [],
      profile,
      NOW,
    );

    expect(view!.proteinHitDays).toBe(2);
    expect(view!.proteinHitOf).toBe(3); // three days logged this week
  });

  it('gives a bar per logged day, oldest first — never a bar for a silent day', () => {
    const view = eatingView([meal(0, 1000, 100), meal(3, 1000, 60)] as never, [], profile, NOW);

    expect(view!.weekBars).toHaveLength(2);
    expect(view!.weekBars[0]!.grams).toBe(60); // three days ago comes first
    expect(view!.weekBars[1]!.grams).toBe(100);
  });

  it('marks no day as a hit when there is no target to hit', () => {
    const view = eatingView([meal(0, 1000, 300)] as never, [], null, NOW);

    expect(view!.weekBars[0]!.hit).toBe(false);
    expect(view!.proteinTarget).toBeNull();
  });
});

describe('what your numbers say', () => {
  const eating = eatingView([meal(0, 1320, 96)] as never, [], profile, NOW)!;

  it('states the weekly rate from two real weigh-ins', () => {
    const view = numbersView({
      currentWeight: 184,
      weightUnit: 'lbs',
      weightThirtyDaysAgo: 188.7,
      height: 70,
      heightUnit: 'in',
      eating,
      profile,
    });

    expect(view!.stats[0]).toMatchObject({ value: '1.1', unit: 'lbs/wk', note: 'last 30 days' });
  });

  it('measures the distance to the top of the healthy band', () => {
    const view = numbersView({
      currentWeight: 184,
      weightUnit: 'lbs',
      weightThirtyDaysAgo: null,
      height: 70,
      heightUnit: 'in',
      eating: null,
      profile,
    });

    // 5'10" tops out around 173.6 lb at BMI 24.9.
    expect(view!.stats[0]!.note).toBe('to Normal');
    expect(Number(view!.stats[0]!.value)).toBeCloseTo(10.4, 0);
  });

  it('says nothing about the healthy band to someone already inside it', () => {
    const view = numbersView({
      currentWeight: 160,
      weightUnit: 'lbs',
      weightThirtyDaysAgo: null,
      height: 70,
      heightUnit: 'in',
      eating,
      profile,
    });

    expect(view!.stats.some((stat) => stat.note === 'to Normal')).toBe(false);
  });

  it('converts to g per kg of body weight, against the profile aim', () => {
    const view = numbersView({
      currentWeight: 184,
      weightUnit: 'lbs',
      weightThirtyDaysAgo: null,
      height: 70,
      heightUnit: 'in',
      eating,
      profile,
    });
    const perKg = view!.stats.find((stat) => stat.unit === 'g/kg')!;

    // 96 g over 83.46 kg = 1.150, to one decimal as the frame shows it.
    expect(perKg.value).toBe('1.2');
    expect(perKg.note).toBe('aim 1.4');
  });

  it('says under or over, rather than a signed number to decode', () => {
    const under = numbersView({
      currentWeight: 184, weightUnit: 'lbs', weightThirtyDaysAgo: null,
      height: 70, heightUnit: 'in', eating, profile,
    });
    expect(under!.stats.find((s) => s.unit === 'cal')!.note).toBe('a day under');

    const big = eatingView([meal(0, 2400, 96)] as never, [], profile, NOW)!;
    const over = numbersView({
      currentWeight: 184, weightUnit: 'lbs', weightThirtyDaysAgo: null,
      height: 70, heightUnit: 'in', eating: big, profile,
    });
    expect(over!.stats.find((s) => s.unit === 'cal')!.note).toBe('a day over');
  });

  it('omits every figure whose inputs are missing, rather than inventing one', () => {
    const view = numbersView({
      currentWeight: 184,
      weightUnit: 'lbs',
      weightThirtyDaysAgo: null,
      height: null,
      heightUnit: 'in',
      eating: null,
      profile: null,
    });

    expect(view).toBeNull();
  });

  it('states the healthy range in the user’s own unit', () => {
    expect(healthyRange(70, 'in', 'lbs')!.max).toBeCloseTo(173.6, 0);
    expect(healthyRange(178, 'cm', 'kg')!.max).toBeCloseTo(78.9, 0);
    expect(healthyRange(null, 'in', 'lbs')).toBeNull();
  });
});
