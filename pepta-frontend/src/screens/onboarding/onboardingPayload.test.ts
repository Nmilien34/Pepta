import { describe, expect, it } from 'vitest';
import { buildOnboardingPayload, type OnboardingAnswers } from './onboardingPayload';
import type { MedicationOption } from '../../data/medicationCatalog';

const now = new Date(2026, 5, 22); // Jun 22 2026

const mounjaro: MedicationOption = {
  id: 'mounjaro',
  name: 'Mounjaro',
  subtitle: 'Tirzepatide · injection',
  drugClass: 'dual_glp_1_gip',
  doseUnit: 'mg',
  halfLifeDays: 5,
  route: 'injection',
  commonDoses: [2.5, 5],
  kind: 'brand',
  initial: 'M',
  tintColor: '#000',
};

const fullAnswers: OnboardingAnswers = {
  journeyStage: 'active',
  medication: mounjaro,
  dose: 5,
  goalType: 'lose_fat',
  genderIdentity: 'woman',
  birthday: { year: 1992, month: 5, day: 13 },
  body: { units: 'imperial', height: 66, weight: 184 },
  startWeight: 196,
  startDate: { year: 2026, month: 3, day: 4 },
  activityLevel: 'light',
  trainingStatus: 'returning',
  biggestWorry: 'losing_muscle',
  sideEffects: ['nausea'],
};

describe('buildOnboardingPayload', () => {
  it('maps a full active-user flow to the schema', () => {
    const p = buildOnboardingPayload(fullAnswers, now);
    expect(p.profile.sex).toBe('female');
    expect(p.profile.ageYears).toBe(34); // 1992 → Jun 22 2026 (birthday Jun 13 passed)
    expect(p.profile.heightUnit).toBe('in');
    expect(p.profile.weightUnit).toBe('lb');
    expect(p.profile.currentWeight).toBe(184);
    expect(p.profile.onboardingComplete).toBe(true);
    expect(p.profile.journeyStartDate).toBe('2026-04-04');
    expect(p.profile.medicationStatus).toBe('active');
    expect(p.profile.genderIdentity).toBe('woman');
    expect(p.profile.goalPace).toBe('steady');
    expect(p.profile.goalWeight).toBe(169); // fallback 184 - 15
    expect(p.compound?.name).toBe('Mounjaro');
    expect(p.compound?.route).toBe('injection');
    expect(p.compound?.plannedDose).toBe(5);
    expect(p.baselineWeight.value).toBe(196);
    expect(p.sideEffectBaseline).toEqual(['nausea']);
  });

  it('omits the compound for non-active users and maps metric', () => {
    const p = buildOnboardingPayload(
      { journeyStage: 'none', body: { units: 'metric', height: 168, weight: 83 } },
      now,
    );
    expect(p.compound).toBeUndefined();
    expect(p.profile.medicationStatus).toBe('none');
    expect(p.profile.heightUnit).toBe('cm');
    expect(p.profile.weightUnit).toBe('kg');
    expect(p.profile.goalWeightUnit).toBe('kg');
    expect(p.profile.goalWeight).toBe(76); // 83 - 7
    expect(p.baselineWeight.value).toBe(83);
    expect(p.sideEffectBaseline).toEqual([]);
  });

  it('maps man → male', () => {
    expect(buildOnboardingPayload({ genderIdentity: 'man' }, now).profile.sex).toBe('male');
  });
});
