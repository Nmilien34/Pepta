import { describe, expect, it } from 'vitest';
import type { HomeResponse } from '@pepta/shared';
import { buildCompanionNotes } from './companionNotes';

function home(overrides: Partial<HomeResponse> = {}): HomeResponse {
  return {
    profile: {
      goalWeight: 165,
      currentWeight: 184,
      weightUnit: 'lb',
      medicationStatus: 'active',
      dailyProteinTargetGrams: 120,
      dailyWaterTargetOz: 64,
      dailyCalorieTarget: 2000,
      dailyFiberTargetGrams: 30,
    },
    activeCompounds: [{ id: 'c1', name: 'Tirzepatide' }],
    medicationLevels: [{ compoundId: 'c1', compoundName: 'Tirzepatide', currentEstimate: 1, peakEstimate: 2, troughEstimate: 0.5, curve: [], hoursUntilNextDose: 24 }],
    nextDose: null,
    todayProteinGrams: 60,
    todayCalories: 800,
    todayWaterOz: 16,
    todayFiberGrams: 5,
    streakDays: 3,
    setupProgress: { loggedItems: 5, required: 5, unlocked: true },
    latestWeight: { value: 184, unit: 'lb' },
    insights: [],
    weeklyRetention: null,
    sectionErrors: {},
    ...overrides,
  } as unknown as HomeResponse;
}

describe('buildCompanionNotes', () => {
  it('nudges the protein gap with a meal action', () => {
    const note = buildCompanionNotes(home()).find((n) => n.id === 'protein-gap')!;
    expect(note.text).toBe('You’re 60g from today’s protein — a snack closes it.');
    expect(note.action).toBe('meal');
  });
  it('celebrates protein when the target is hit', () => {
    const notes = buildCompanionNotes(home({ todayProteinGrams: 130 }));
    expect(notes.find((n) => n.id === 'protein-win')?.tone).toBe('win');
    expect(notes.find((n) => n.id === 'protein-gap')).toBeUndefined();
  });
  it('walks a new user to the next setup step first', () => {
    const notes = buildCompanionNotes(home({ setupProgress: { loggedItems: 1, required: 5, unlocked: false }, medicationLevels: [] }));
    expect(notes[0]!.id).toBe('setup-shot');
    expect(notes[0]!.action).toBe('dose');
  });
  it('always returns at least one note', () => {
    const notes = buildCompanionNotes(home({ profile: null, streakDays: 0, insights: [] } as unknown as HomeResponse));
    expect(notes.length).toBeGreaterThanOrEqual(1);
  });
});
