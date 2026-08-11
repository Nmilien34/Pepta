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

describe('route + device answers', () => {
  it('lets the explicit route answer override an ambiguous catalog route', () => {
    const compounded: MedicationOption = {
      ...mounjaro,
      id: 'compounded_semaglutide',
      name: 'Compounded semaglutide',
      routeAmbiguous: true,
    };
    const p = buildOnboardingPayload(
      { ...fullAnswers, medication: compounded, route: 'oral' },
      now,
    );
    expect(p.compound?.route).toBe('oral');
    expect(p.compound?.deviceType).toBeUndefined();
  });

  it('keeps the catalog route when the user is unsure and attaches the device', () => {
    const p = buildOnboardingPayload(
      { ...fullAnswers, route: 'unsure', deviceType: 'single_dose_pen' },
      now,
    );
    expect(p.compound?.route).toBe('injection');
    expect(p.compound?.deviceType).toBe('single_dose_pen');
  });
});

describe('nextDoseAt with multiple weekly shot days', () => {
  // Nick's TestFlight case: last shot Saturday, shot days Tue/Wed/Sat. The
  // interval-only math said "next Saturday"; the real next dose is Tuesday.
  it('walks to the next CHOSEN weekday, not lastShot + 7', () => {
    const now = new Date(2026, 6, 27, 9, 0); // Monday Jul 27
    const payload = buildOnboardingPayload(
      {
        ...fullAnswers,
        frequency: 'weekly',
        lastShot: { year: 2026, month: 6, day: 25 }, // Saturday Jul 25
        shotDays: [2, 3, 6], // Tue, Wed, Sat
        shotHour: 8,
      },
      now,
    );
    const next = new Date(payload.schedule!.nextDoseAt!);
    expect(next.getDay()).toBe(2); // Tuesday
    expect(next.getDate()).toBe(28); // Jul 28, not Aug 1
    expect(next.getHours()).toBe(8);
  });

  it('keeps the old behavior for a single day', () => {
    const now = new Date(2026, 6, 27, 9, 0);
    const payload = buildOnboardingPayload(
      {
        ...fullAnswers,
        frequency: 'weekly',
        lastShot: { year: 2026, month: 6, day: 25 },
        shotDays: [6],
        shotHour: 8,
      },
      now,
    );
    const next = new Date(payload.schedule!.nextDoseAt!);
    expect(next.getDay()).toBe(6);
    expect(next.getDate()).toBe(1); // next Saturday, Aug 1
  });

  it('carries every chosen day in schedule.daysOfWeek', () => {
    const payload = buildOnboardingPayload(
      { ...fullAnswers, frequency: 'weekly', shotDays: [2, 3, 6] },
      new Date(2026, 6, 27),
    );
    expect(payload.schedule?.daysOfWeek).toEqual([2, 3, 6]);
  });
});

// Daily cadence carries its dose time (2026-08-07). Without timesOfDay the
// backend falls back to the 9:00 AM default instead of the hour the user
// just chose one screen earlier.
describe('daily schedules carry the chosen time', () => {
  it('sends timesOfDay for a daily schedule', () => {
    const payload = buildOnboardingPayload(
      { ...fullAnswers, frequency: 'daily', shotDays: [], shotHour: 9 },
      new Date(2026, 7, 7, 10, 0),
    );
    expect(payload.schedule?.frequency).toBe('daily');
    expect(payload.schedule?.timesOfDay).toEqual(['09:00']);
  });

  it('pads the hour and handles evening times', () => {
    const payload = buildOnboardingPayload(
      { ...fullAnswers, frequency: 'daily', shotDays: [], shotHour: 21 },
      new Date(2026, 7, 7, 10, 0),
    );
    expect(payload.schedule?.timesOfDay).toEqual(['21:00']);
  });

  it('weekly and biweekly send NO timesOfDay — unchanged', () => {
    const weekly = buildOnboardingPayload(
      { ...fullAnswers, frequency: 'weekly', shotHour: 8 },
      new Date(2026, 7, 7, 10, 0),
    );
    expect(weekly.schedule?.timesOfDay).toBeUndefined();
    const biweekly = buildOnboardingPayload(
      { ...fullAnswers, frequency: 'biweekly', shotHour: 8 },
      new Date(2026, 7, 7, 10, 0),
    );
    expect(biweekly.schedule?.timesOfDay).toBeUndefined();
  });
});

describe('the "Something else" escape hatch', () => {
  // The catalog row carries halfLifeDays: 7, which belongs to no drug. Writing
  // it through gave an unknown medication a real-looking pharmacokinetic curve.
  const somethingElse: MedicationOption = {
    id: 'other',
    name: 'Something else',
    subtitle: 'Not listed here',
    drugClass: 'other',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'injection',
    routeAmbiguous: true,
    commonDoses: [],
    kind: 'other',
    tintColor: '#5F5E5A',
  };

  it('never fabricates a half-life for an unidentified medication', () => {
    const p = buildOnboardingPayload({ ...fullAnswers, medication: somethingElse }, now);
    expect(p.compound?.halfLifeDays).toBeNull();
  });

  it('keeps the name so the Home nudge can find the compound later', () => {
    const p = buildOnboardingPayload({ ...fullAnswers, medication: somethingElse }, now);
    expect(p.compound?.name).toBe('Something else');
  });

  it('still honours the explicit route answer', () => {
    const p = buildOnboardingPayload(
      { ...fullAnswers, medication: somethingElse, route: 'oral' },
      now,
    );
    expect(p.compound?.route).toBe('oral');
  });

  it('leaves a real medication’s half-life untouched', () => {
    const p = buildOnboardingPayload(fullAnswers, now);
    expect(p.compound?.halfLifeDays).toBe(5);
  });
});
