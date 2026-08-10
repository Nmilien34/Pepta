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
  parseDecimalInput,
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

  it('the level card resolves to an honest suppressed state, never a curve or "log your first shot"', () => {
    const view = buildHomeView(
      homeWith({ id: 'compound-1', name: 'Foundayo', route: 'oral', doseUnit: 'mg', halfLifeDays: null }),
    );
    expect(view.medication).toBeNull();
    // Foundayo is BOTH oral and half-life-less; 'oral' wins because it is the
    // more specific explanation (and the one the user cannot fix by editing).
    expect(view.levelSuppressed).toBe('oral');
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
    expect(buildHomeView(home).levelSuppressed).toBeNull();
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

// Live-user bug, 2026-08-10: "the decimal isn't working to be able to enter
// the dose." The field rendered String(parsedNumber), so any keystroke that
// wasn't already a valid positive number was erased as you typed it. These
// pin the parser AND the invariant that the field keeps the user's raw text.
describe('decimal dose entry', () => {
  it('accepts decimals, including the in-progress states that used to be erased', () => {
    expect(parseDecimalInput('2.5')).toBe(2.5);
    expect(parseDecimalInput('0.5')).toBe(0.5);
    expect(parseDecimalInput('.5')).toBe(0.5);
    expect(parseDecimalInput('12.25')).toBe(12.25);
  });

  it('returns null for not-yet-a-number instead of clobbering the field', () => {
    // The FIELD keeps showing these; only the parsed value is null, which
    // simply leaves the save button disabled until the number is complete.
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('0')).toBeNull();
    expect(parseDecimalInput('.')).toBeNull();
    expect(parseDecimalInput('2.')).toBe(2); // "2." parses, and "2." stays on screen
    expect(parseDecimalInput('abc')).toBeNull();
  });

  it('accepts comma decimal separators (non-US keyboards)', () => {
    expect(parseDecimalInput('2,5')).toBe(2.5);
  });

  it('rejects zero and negatives — a dose must be positive', () => {
    expect(parseDecimalInput('0')).toBeNull();
    expect(parseDecimalInput('-3')).toBeNull();
  });

  it('a decimal dose survives into the compound payload', () => {
    const draft = { ...FOUNDAYO, amount: parseDecimalInput('2.5')! };
    expect(isCustomCompoundValid(draft)).toBe(true);
    expect(buildCustomCompoundInput(draft, '2026-08-10').plannedDose).toBe(2.5);
  });

  it('a decimal half-life survives too (same defect, same fix)', () => {
    const draft = { ...FOUNDAYO, halfLifeDays: parseDecimalInput('0.5') };
    expect(buildCustomCompoundInput(draft, '2026-08-10').halfLifeDays).toBe(0.5);
  });
});
