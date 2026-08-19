import { describe, expect, it } from 'vitest';
import type { HomeResponse, MedicationLevelResponse } from '@pepta/shared';
import { buildHomeView, formatCountdown, medicationBars, medicationStatus, recentDayLetters, todayStat } from './homeView';

const ml = {
  compoundId: 'c1',
  compoundName: 'Tirzepatide',
  halfLifeDays: 5,
  currentEstimate: 1.42,
  peakEstimate: 2.1,
  troughEstimate: 0.9,
  curve: [
    { datetime: '2026-06-15T00:00:00.000Z', level: 1.0 },
    { datetime: '2026-06-18T00:00:00.000Z', level: 2.0 },
    { datetime: '2026-06-21T00:00:00.000Z', level: 1.42 },
  ],
  nextDoseAt: '2026-06-27T20:00:00.000Z',
  hoursUntilNextDose: 129,
  estimateBasis: 'relative-dose-equivalent',
  engineVersion: 'v1',
} satisfies MedicationLevelResponse;

describe('formatCountdown', () => {
  it('formats days + hours, or just hours', () => {
    expect(formatCountdown(129)).toBe('5d 9h');
    expect(formatCountdown(9)).toBe('9h');
    expect(formatCountdown(null)).toBeNull();
  });
});

describe('medicationBars', () => {
  const now = new Date('2026-08-17T20:00:00Z');

  it('normalizes to the peak with a floor', () => {
    const bars = medicationBars(ml.curve, now, 3);
    expect(bars).toHaveLength(3);
    expect(Math.max(...bars.map((b) => b.height))).toBe(1);
    expect(Math.min(...bars.map((b) => b.height))).toBeGreaterThanOrEqual(0.06);
  });

  it('handles an empty curve', () => {
    expect(medicationBars([], now, 7)).toEqual([]);
  });

  it('labels each bar with its own local weekday, ending today', () => {
    const bars = medicationBars(ml.curve, now, 7);
    expect(bars).toHaveLength(7);
    expect(bars.map((b) => b.letter)).toEqual(recentDayLetters(now, 7));
    expect(bars.filter((b) => b.isToday)).toHaveLength(1);
    expect(bars[bars.length - 1]!.isToday).toBe(true);
  });

  it('never reads a future sample into a bar', () => {
    // The curve runs now-7d .. now+7d. A huge spike tomorrow must not show up
    // in any bar — every bar is a level that has already happened.
    const spiked = [
      ...ml.curve,
      { datetime: new Date(now.getTime() + 36 * 3_600_000).toISOString(), level: 9_999 },
    ];
    const bars = medicationBars(spiked, now, 7);
    expect(Math.max(...bars.map((b) => b.height))).toBe(1);
    // If the spike leaked in, every real bar would be crushed to the floor.
    expect(bars.filter((b) => b.height > 0.06).length).toBeGreaterThan(1);
  });
});

describe('recentDayLetters', () => {
  it('returns seven letters ending on today', () => {
    const wed = new Date(2026, 7, 19); // a Wednesday
    expect(recentDayLetters(wed, 7)).toEqual(['T', 'F', 'S', 'S', 'M', 'T', 'W']);
  });
});

describe('medicationStatus', () => {
  it('classifies position in the cycle', () => {
    expect(medicationStatus({ ...ml, currentEstimate: 2.05 })).toBe('Peaking');
    expect(medicationStatus({ ...ml, currentEstimate: 0.95 })).toBe('Low');
    expect(medicationStatus(ml)).toBe('Steady');
  });
});

function buildHome(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return {
    profile: {
      dailyCalorieTarget: 2000,
      dailyProteinTargetGrams: 120,
      dailyFiberTargetGrams: 30,
      dailyWaterTargetOz: 64,
      dailyStepTarget: 8000,
    },
    activeCompounds: [{ id: 'c1', doseUnit: 'mg' }],
    medicationLevels: [ml],
    todayProteinGrams: 60,
    todayFiberGrams: 15,
    todayCalories: 1000,
    todayWaterOz: 32,
    streakDays: 7,
    setupProgress: { loggedItems: 2, required: 4, unlocked: false },
    nextDose: { compoundId: 'c1', compoundName: 'Tirzepatide', nextDoseAt: '2026-06-27T20:00:00.000Z', hoursUntilNextDose: 60 },
    latestWeight: { value: 184, unit: 'lb' },
    insights: [{ id: 'i1', headline: 'Hi' }],
    weeklyRetention: null,
    sectionErrors: {},
    ...overrides,
  } as unknown as HomeResponse;
}

describe('buildHomeView', () => {
  it('derives the view-model from HomeResponse', () => {
    const view = buildHomeView(buildHome());
    expect(view.medication?.unit).toBe('mg');
    // countdown prefers home.nextDose (60h → 2d 12h) over the level engine (129h).
    expect(view.medication?.countdown).toBe('2d 12h');
    expect(view.calories.pct).toBeCloseTo(0.5, 5);
    expect(view.protein.pct).toBeCloseTo(0.5, 5);
    expect(view.fiber.pct).toBeCloseTo(0.5, 5);
    expect(view.water.pct).toBeCloseTo(0.5, 5);
    expect(view.streakDays).toBe(7);
    expect(view.setup).toMatchObject({ loggedItems: 2, required: 4, pct: 0.5 });
    expect(view.weight).toEqual({ value: 184, unit: 'lb' });
    expect(view.weightPulse).toMatchObject({
      title: 'Today’s weigh-in?',
      latestLabel: '184 lb',
      actionLabel: 'Log weight',
    });
    expect(view.insight?.id).toBe('i1');
  });

  it('falls back to the level engine countdown when nextDose is absent', () => {
    const view = buildHomeView(buildHome({ nextDose: null }));
    expect(view.medication?.countdown).toBe('5d 9h');
  });

  it('scales targets for the selected range', () => {
    const view = buildHomeView(
      buildHome({
        selectedRange: 'week',
        rangeTotals: {
          key: 'week',
          label: 'Weekly',
          proteinGrams: 420,
          fiberGrams: 105,
          calories: 7000,
          waterOz: 224,
          dayCount: 7,
          hasData: true,
        },
      }),
    );
    expect(view.rangeLabel).toBe('Weekly');
    expect(view.protein.target).toBe(840);
    expect(view.protein.pct).toBeCloseTo(0.5, 5);
    expect(view.calories.target).toBe(14000);
    expect(view.water.target).toBe(448);
  });

  it('hides setup once the dashboard is unlocked', () => {
    const view = buildHomeView(buildHome({ setupProgress: { loggedItems: 4, required: 4, unlocked: true } }));
    expect(view.setup).toBeNull();
  });

  it('zeroes ring percentages when no profile targets exist', () => {
    const view = buildHomeView(buildHome({ profile: null }));
    expect(view.protein.target).toBeNull();
    expect(view.protein.pct).toBe(0);
  });

  it('asks for a baseline when there is no logged weight', () => {
    const view = buildHomeView(buildHome({ latestWeight: null }));
    // The frame keeps the card's ordinary title and lets the line do the
    // asking — it says what a baseline buys them rather than instructing
    // them to produce one.
    expect(view.weightPulse).toMatchObject({
      title: 'Weight',
      latestLabel: null,
      actionLabel: 'Add your first weight',
    });
    expect(view.weightPulse.detail).toBe('A baseline makes your timeline useful from day one.');
  });
});

describe('todayStat', () => {
  const weekly = buildHome({
    todayProteinGrams: 74,
    todayFiberGrams: 12,
    todayWaterOz: 42,
    todayCalories: 1240,
    // Home is showing a WEEK — buildHomeView scales both sides to it.
    rangeTotals: { label: 'This week', dayCount: 7, proteinGrams: 520, fiberGrams: 84, waterOz: 294, calories: 8680 },
  } as unknown as Partial<Parameters<typeof buildHome>[0]>);

  it('reports today even while Home is showing a week', () => {
    expect(buildHomeView(weekly).protein.current).toBe(520); // the Home card
    expect(todayStat(weekly, 'protein').current).toBe(74); // the Protein screen
  });

  it('uses the DAILY target, not the range-scaled one', () => {
    const daily = weekly.profile?.dailyProteinTargetGrams ?? null;
    expect(todayStat(weekly, 'protein').target).toBe(daily);
    // buildHomeView multiplies it by the day count; todayStat must not.
    expect(buildHomeView(weekly).protein.target).toBe((daily ?? 0) * 7);
  });

  it('covers every daily key', () => {
    expect(todayStat(weekly, 'fiber').current).toBe(12);
    expect(todayStat(weekly, 'water').current).toBe(42);
    expect(todayStat(weekly, 'calories').current).toBe(1240);
  });

  it('reports a null target rather than a zero one when none is set', () => {
    const noTargets = buildHome({ profile: null } as never);
    const stat = todayStat(noTargets, 'protein');
    expect(stat.target).toBeNull();
    expect(stat.pct).toBe(0);
  });
});
