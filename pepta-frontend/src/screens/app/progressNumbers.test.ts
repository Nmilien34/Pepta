import { describe, expect, it } from 'vitest';
import {
  eatingView,
  healthyRange,
  nextMilestone,
  numbersView,
  retentionPreview,
  trainedDaysThisWeek,
  weighInDate,
} from './progressNumbers';

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

describe('the next milestone', () => {
  it('counts in round fractions of the starting weight, the way clinicians do', () => {
    // 196 → 184 is 6.1% lost, so 10% is next: 196 × 0.9 = 176.4, 7.6 to go.
    expect(nextMilestone(196, 184, 'lb')).toEqual({
      label: '10% of your start',
      remaining: '7.6 lb to go',
    });
  });

  it('moves to the next threshold once one is passed', () => {
    expect(nextMilestone(200, 195, 'lb')!.label).toBe('5% of your start');
    expect(nextMilestone(200, 189, 'lb')!.label).toBe('10% of your start');
    expect(nextMilestone(200, 179, 'lb')!.label).toBe('15% of your start');
  });

  it('keeps counting past a fixed table, rather than going blank on the people doing best', () => {
    // 30% lost exactly — a hardcoded list ending at 30 returned nothing here.
    expect(nextMilestone(200, 140, 'lb')!.label).toBe('35% of your start');
    expect(nextMilestone(200, 100, 'lb')!.label).toBe('55% of your start');
  });

  it('says nothing without a start and a current weight', () => {
    expect(nextMilestone(null, 184, 'lb')).toBeNull();
    expect(nextMilestone(196, null, 'lb')).toBeNull();
  });

  it('handles someone who has gained — the first threshold is still ahead', () => {
    const view = nextMilestone(196, 200, 'lb')!;

    expect(view.label).toBe('5% of your start');
    expect(view.remaining).toBe('13.8 lb to go');
  });
});

describe('the weigh-in date', () => {
  it('reads as the frame writes it', () => {
    expect(weighInDate('2026-06-21T09:00:00.000Z')).toMatch(/Jun 2[01]/);
  });

  it('is empty rather than "Invalid Date" when there is none', () => {
    expect(weighInDate(null)).toBe('');
    expect(weighInDate('nonsense')).toBe('');
  });
});

describe('muscle protection before there is a score', () => {
  const week = eatingView(
    [meal(0, 1000, 130), meal(1, 1000, 90), meal(2, 1000, 125)] as never,
    [],
    profile,
    NOW,
  );

  it('reports the three inputs the engine is waiting on', () => {
    const rows = retentionPreview({
      eating: week,
      trainedDays: 0,
      weeklyChange: -1.1,
      targetWeeklyLoss: 1.5,
    });

    expect(rows.map((row) => row.label)).toEqual(['Protein', 'Training', 'Pace']);
    expect(rows[0]!.status).toBe('2 of 3 days');
    expect(rows[1]!.status).toBe('not logged yet');
    expect(rows[2]!.status).toBe('on track');
  });

  it('never scores and never scolds — the worst tone is quiet', () => {
    const rows = retentionPreview({
      eating: null,
      trainedDays: 0,
      weeklyChange: null,
      targetWeeklyLoss: null,
    });

    expect(rows.every((row) => row.tone === 'quiet')).toBe(true);
    expect(rows.map((row) => row.status)).toEqual([
      'not logged yet',
      'not logged yet',
      'not enough weigh-ins',
    ]);
  });

  it('calls losing FASTER than planned out — that is what costs muscle', () => {
    const fast = retentionPreview({
      eating: null, trainedDays: 0, weeklyChange: -3, targetWeeklyLoss: 1.5,
    });
    expect(fast[2]!.status).toBe('faster than planned');

    // A quarter over the plan is still on track — nobody hits a rate exactly.
    const near = retentionPreview({
      eating: null, trainedDays: 0, weeklyChange: -1.8, targetWeeklyLoss: 1.5,
    });
    expect(near[2]!.status).toBe('on track');
  });

  it('counts training days when there are any', () => {
    const rows = retentionPreview({
      eating: null, trainedDays: 1, weeklyChange: null, targetWeeklyLoss: null,
    });

    expect(rows[1]).toMatchObject({ status: '1 day', tone: 'good' });
  });

  it('says so when there is no target to judge pace against', () => {
    const rows = retentionPreview({
      eating: null, trainedDays: 0, weeklyChange: -1, targetWeeklyLoss: null,
    });

    expect(rows[2]!.status).toBe('no target set');
  });
});

describe('training days this week', () => {
  const activity = (daysAgo: number, minutes: number | null, deleted = false) => ({
    id: `a${daysAgo}`,
    datetime: at(daysAgo),
    workoutMinutes: minutes,
    deletedAt: deleted ? at(0) : null,
  });

  it('counts distinct days with a workout', () => {
    expect(trainedDaysThisWeek([activity(0, 30), activity(2, 45)] as never, NOW)).toBe(2);
  });

  it('counts a day once however many sessions it holds', () => {
    const two = [
      { ...activity(1, 30), id: 'a-am' },
      { ...activity(1, 30), id: 'a-pm' },
    ];
    expect(trainedDaysThisWeek(two as never, NOW)).toBe(1);
  });

  it('ignores a log with no minutes — steps alone are not training', () => {
    expect(trainedDaysThisWeek([activity(0, null), activity(1, 0)] as never, NOW)).toBe(0);
  });

  it('ignores anything deleted or older than the week', () => {
    expect(
      trainedDaysThisWeek([activity(0, 30, true), activity(20, 60)] as never, NOW),
    ).toBe(0);
  });
});
