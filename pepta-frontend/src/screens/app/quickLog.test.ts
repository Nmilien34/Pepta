import { describe, expect, it } from 'vitest';
import type { HomeResponse, TrackResponse } from '@pepta/shared';
import {
  defaultDoseDraft,
  isActivityValid,
  isDoseValid,
  toActivityInput,
  toDoseInput,
  toMeasurementInput,
  toProteinInput,
  toSideEffectInput,
  toWaterInput,
  toWeightInput,
  type DoseDraft,
} from './quickLog';

const NOW = '2026-06-22T15:00:00.000Z';

describe('defaultDoseDraft', () => {
  it('uses the first active compound at its planned dose + rotated site', () => {
    const home = { activeCompounds: [{ id: 'c1', name: 'Tirzepatide', plannedDose: 5, doseUnit: 'mg' }] } as unknown as HomeResponse;
    const track = { doseLogs: [{ injectionSite: 'abdomen_left', datetime: '2026-06-15T00:00:00.000Z', deletedAt: null }] } as unknown as TrackResponse;
    const draft = defaultDoseDraft(home, track)!;
    expect(draft).toMatchObject({ compoundId: 'c1', compoundName: 'Tirzepatide', amount: 5, unit: 'mg' });
    expect(draft.site).not.toBe('abdomen_left'); // rotated away from the last-used site
  });
  it('returns null with no compounds', () => {
    expect(defaultDoseDraft({ activeCompounds: [] } as unknown as HomeResponse, null)).toBeNull();
  });
});

describe('isDoseValid', () => {
  it('requires a compound + positive amount', () => {
    const base: DoseDraft = { compoundId: 'c1', compoundName: 'T', amount: 5, unit: 'mg', site: 'abdomen_left' };
    expect(isDoseValid(base)).toBe(true);
    expect(isDoseValid({ ...base, amount: 0 })).toBe(false);
    expect(isDoseValid(null)).toBe(false);
  });
});

describe('payload builders', () => {
  it('inject datetime and keep the typed shape', () => {
    const draft: DoseDraft = { compoundId: 'c1', compoundName: 'T', amount: 5, unit: 'mg', site: 'thigh_left' };
    expect(toDoseInput(draft, NOW)).toEqual({ compoundId: 'c1', amount: 5, unit: 'mg', injectionSite: 'thigh_left', datetime: NOW });
    expect(toWeightInput(184, 'lb', NOW)).toEqual({ value: 184, unit: 'lb', datetime: NOW });
    expect(toProteinInput(30, NOW)).toEqual({ grams: 30, datetime: NOW });
    expect(toWaterInput(8, NOW)).toEqual({ amountOz: 8, datetime: NOW });
    expect(toSideEffectInput(['nausea'], 2, NOW)).toEqual({ types: ['nausea'], severity: 2, datetime: NOW });
    expect(toMeasurementInput('waist', 34, 'in', NOW)).toEqual({ type: 'waist', value: 34, unit: 'in', datetime: NOW });
  });
  it('includes an optional note when provided, omits it otherwise', () => {
    expect(toSideEffectInput(['nausea'], 2, NOW, 'after dinner')).toMatchObject({ notes: 'after dinner' });
    expect(toMeasurementInput('waist', 34, 'in', NOW, 'morning')).toMatchObject({ notes: 'morning' });
    expect(toSideEffectInput(['nausea'], 2, NOW)).not.toHaveProperty('notes');
  });
});

describe('activity', () => {
  it('requires steps, minutes, or resistance', () => {
    expect(isActivityValid({ steps: 0, workoutMinutes: 0, resistanceTraining: false })).toBe(false);
    expect(isActivityValid({ steps: 8000, workoutMinutes: 0, resistanceTraining: false })).toBe(true);
    expect(isActivityValid({ steps: 0, workoutMinutes: 0, resistanceTraining: true })).toBe(true);
  });
  it('drops zero fields and keeps the resistance flag + datetime', () => {
    expect(toActivityInput({ steps: 8000, workoutMinutes: 0, resistanceTraining: true }, NOW)).toEqual({
      steps: 8000,
      resistanceTraining: true,
      datetime: NOW,
    });
  });
});
