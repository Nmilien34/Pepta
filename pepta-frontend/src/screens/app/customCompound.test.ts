// Integration of the custom-medication path (2026-08-07): a "Foundayo, oral,
// daily" entry flows end-to-end — compound input with route oral and NO
// fabricated half-life, a daily schedule carrying the chosen time (the
// backend engine's daily+timesOfDay branch is pinned in
// pepta-backend/src/tests/lib/pharmacokinetics.test.ts), a dose log with no
// injection site, and the honest unmodelled level state instead of a curve.

import { describe, expect, it } from 'vitest';
import type { HomeResponse, TrackResponse } from '@pepta/shared';
import {
  buildCustomCompoundInput,
  buildCustomScheduleInput,
  isCustomCompoundValid,
  type CustomCompoundDraft,
} from './addCompound';
import { defaultDoseDraft, toDoseInput } from './quickLog';
import { buildHomeView } from './homeView';

const FOUNDAYO: CustomCompoundDraft = {
  name: 'Foundayo',
  route: 'oral',
  amount: 3,
  unit: 'mg',
  frequency: 'daily',
  timeOfDay: '09:00',
  halfLifeDays: null,
};

function homeWith(compound: Record<string, unknown>): HomeResponse {
  return {
    activeCompounds: [compound],
    medicationLevels: [],
    nextDose: null,
    todayCalories: 0,
    todayProteinGrams: 0,
    todayFiberGrams: 0,
    todayWaterOz: 0,
    latestWeight: null,
    profile: null,
    insights: [],
  } as unknown as HomeResponse;
}

describe('custom oral daily medication — end to end', () => {
  it('builds an oral compound with a real name and NO fabricated half-life', () => {
    expect(isCustomCompoundValid(FOUNDAYO)).toBe(true);
    const input = buildCustomCompoundInput(FOUNDAYO, '2026-08-07');
    expect(input).toMatchObject({
      name: 'Foundayo',
      drugClass: 'other',
      route: 'oral',
      halfLifeDays: null,
      doseUnit: 'mg',
      plannedDose: 3,
      status: 'active',
    });
  });

  it('creates the daily schedule with the chosen time in the same save', () => {
    const schedule = buildCustomScheduleInput(FOUNDAYO, 'compound-1');
    expect(schedule).toEqual({
      compoundId: 'compound-1',
      frequency: 'daily',
      daysOfWeek: [],
      active: true,
      timesOfDay: ['09:00'],
    });
  });

  it('weekly custom compounds carry no timesOfDay — weekly behavior unchanged', () => {
    const schedule = buildCustomScheduleInput({ ...FOUNDAYO, frequency: 'weekly' }, 'compound-1');
    expect('timesOfDay' in schedule).toBe(false);
    expect(schedule.frequency).toBe('weekly');
  });

  it('logging a dose against it: no BodyMap site seeded, no injectionSite persisted', () => {
    const home = homeWith({
      id: 'compound-1',
      name: 'Foundayo',
      route: 'oral',
      doseUnit: 'mg',
      plannedDose: 3,
      halfLifeDays: null,
    });
    const draft = defaultDoseDraft(home, { doseLogs: [] } as unknown as TrackResponse)!;
    expect(draft.site).toBeNull();
    const input = toDoseInput(draft, '2026-08-07T13:00:00.000Z');
    expect('injectionSite' in input).toBe(false);
  });

  it('the level card resolves to the honest unmodelled state, never a curve or "log your first shot"', () => {
    const view = buildHomeView(
      homeWith({ id: 'compound-1', name: 'Foundayo', route: 'oral', doseUnit: 'mg', halfLifeDays: null }),
    );
    expect(view.medication).toBeNull();
    expect(view.medicationUnmodeled).toBe(true);
  });

  it('a custom INJECTION compound with a half-life keeps the full pipeline: site + curve eligibility', () => {
    const draft: CustomCompoundDraft = {
      name: 'Custom peptide',
      route: 'injection',
      amount: 250,
      unit: 'mcg',
      frequency: 'weekly',
      timeOfDay: '09:00',
      halfLifeDays: 2,
    };
    const input = buildCustomCompoundInput(draft, '2026-08-07');
    expect(input.halfLifeDays).toBe(2);
    const home = homeWith({
      id: 'compound-2',
      name: 'Custom peptide',
      route: 'injection',
      doseUnit: 'mcg',
      plannedDose: 250,
      halfLifeDays: 2,
    });
    const doseDraft = defaultDoseDraft(home, { doseLogs: [] } as unknown as TrackResponse)!;
    expect(doseDraft.site).not.toBeNull();
    expect(toDoseInput(doseDraft, '2026-08-07T13:00:00.000Z').injectionSite).toBe(doseDraft.site);
    expect(buildHomeView(home).medicationUnmodeled).toBe(false);
  });

  it('route and frequency are explicit choices — no default sneaks through validity', () => {
    expect(isCustomCompoundValid({ ...FOUNDAYO, route: null })).toBe(false);
    expect(isCustomCompoundValid({ ...FOUNDAYO, frequency: null })).toBe(false);
    expect(isCustomCompoundValid({ ...FOUNDAYO, name: '  ' })).toBe(false);
    expect(isCustomCompoundValid({ ...FOUNDAYO, amount: null })).toBe(false);
    // Skipping the half-life is explicitly valid.
    expect(isCustomCompoundValid({ ...FOUNDAYO, halfLifeDays: null })).toBe(true);
  });
});
