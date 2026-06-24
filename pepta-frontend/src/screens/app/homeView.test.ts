import { describe, expect, it } from 'vitest';
import type { HomeResponse, MedicationLevelResponse } from '@pepta/shared';
import { buildHomeView, formatCountdown, medicationBars, medicationStatus } from './homeView';

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
  it('normalizes to the peak with a floor', () => {
    const bars = medicationBars(ml.curve, 3);
    expect(bars).toHaveLength(3);
    expect(Math.max(...bars)).toBe(1);
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(0.06);
  });
  it('handles an empty curve', () => {
    expect(medicationBars([], 7)).toEqual([]);
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

  it('asks for a first scale check when there is no logged weight', () => {
    const view = buildHomeView(buildHome({ latestWeight: null }));
    expect(view.weightPulse).toMatchObject({
      title: 'Add your first scale check',
      latestLabel: null,
      actionLabel: 'Add weight',
    });
  });
});
