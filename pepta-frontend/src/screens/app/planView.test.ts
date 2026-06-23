import { describe, expect, it } from 'vitest';
import type { HomeResponse } from '@pepta/shared';
import { buildGettingStarted, buildPlanSummary } from './planView';

function home(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return {
    profile: {
      goalWeight: 165,
      currentWeight: 184,
      weightUnit: 'lb',
      goalPace: 'gentle',
      targetWeeklyLossPercent: 0.6,
      estimatedGoalDate: '2026-09-14',
      medicationStatus: 'active',
    },
    activeCompounds: [{ id: 'c1', name: 'Tirzepatide' }],
    medicationLevels: [],
    nextDose: null,
    todayProteinGrams: 0,
    todayCalories: 0,
    todayWaterOz: 0,
    todayFiberGrams: 0,
    streakDays: 0,
    setupProgress: { loggedItems: 1, required: 5, unlocked: false },
    latestWeight: { value: 184, unit: 'lb' },
    insights: [],
    weeklyRetention: null,
    sectionErrors: {},
    ...overrides,
  } as unknown as HomeResponse;
}

describe('buildPlanSummary', () => {
  it('builds a personalized plan line from profile', () => {
    const plan = buildPlanSummary(home())!;
    expect(plan.title).toBe('Lose 19 lb to 165 lb');
    // 184 * 0.6% ≈ 1.1 lb/week
    expect(plan.detail).toBe('Gentle pace · ~1.1 lb/week · goal by Sep 14');
  });
  it('returns null without a goal', () => {
    expect(buildPlanSummary(home({ profile: { currentWeight: 184 } } as unknown as HomeResponse))).toBeNull();
  });
});

describe('buildGettingStarted', () => {
  it('includes the shot task for an active med, personalized', () => {
    const gs = buildGettingStarted(home());
    expect(gs.show).toBe(true);
    expect(gs.tasks.map((t) => t.key)).toEqual(['account', 'shot', 'meal', 'water', 'weight']);
    expect(gs.tasks.find((t) => t.key === 'shot')!.label).toBe('Log your first Tirzepatide shot');
    // account done + weight done (latestWeight set by onboarding) = 2 of 5
    expect(gs.doneCount).toBe(2);
    expect(gs.total).toBe(5);
  });
  it('drops the shot task when not on a med', () => {
    const gs = buildGettingStarted(home({ profile: { goalWeight: 165, medicationStatus: 'none' } as unknown as HomeResponse['profile'], activeCompounds: [] }));
    expect(gs.tasks.map((t) => t.key)).not.toContain('shot');
  });
  it('marks logged-today actions done', () => {
    const gs = buildGettingStarted(home({ todayWaterOz: 8, todayCalories: 400 }));
    expect(gs.tasks.find((t) => t.key === 'water')!.done).toBe(true);
    expect(gs.tasks.find((t) => t.key === 'meal')!.done).toBe(true);
  });
  it('hides once the backend marks setup unlocked', () => {
    expect(buildGettingStarted(home({ setupProgress: { loggedItems: 5, required: 5, unlocked: true } })).show).toBe(false);
  });
});
