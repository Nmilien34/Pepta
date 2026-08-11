import { describe, expect, it } from 'vitest';
import type { MedicationOption } from '../../data/medicationCatalog';
import { buildCompoundInput, buildCustomIdentityPatch, buildIdentityPatch, todayDateOnly } from './addCompound';

const option: MedicationOption = {
  id: 'mounjaro',
  name: 'Mounjaro',
  subtitle: 'Tirzepatide',
  drugClass: 'dual_glp_1_gip',
  doseUnit: 'mg',
  halfLifeDays: 5,
  route: 'injection',
  commonDoses: [2.5, 5, 7.5],
} as MedicationOption;

describe('todayDateOnly', () => {
  it('formats local Y-M-D', () => {
    expect(todayDateOnly(new Date(2026, 5, 23))).toBe('2026-06-23');
  });
});

describe('buildCompoundInput', () => {
  it('maps a catalog option + dose into a CompoundInput', () => {
    expect(buildCompoundInput(option, 5, '2026-06-23')).toEqual({
      name: 'Mounjaro',
      drugClass: 'dual_glp_1_gip',
      route: 'injection',
      halfLifeDays: 5,
      doseUnit: 'mg',
      plannedDose: 5,
      startDate: '2026-06-23',
      status: 'active',
    });
  });
  it('omits plannedDose when none chosen', () => {
    expect(buildCompoundInput(option, null, '2026-06-23')).not.toHaveProperty('plannedDose');
  });
});

describe('identity patches (rename in place)', () => {
  const option = {
    id: 'zepbound',
    name: 'Zepbound',
    subtitle: 'Tirzepatide · injection',
    drugClass: 'dual_glp_1_gip',
    doseUnit: 'mg',
    halfLifeDays: 5,
    route: 'injection',
    commonDoses: [2.5, 5],
    kind: 'brand',
    tintColor: '#000',
  } as const;

  it('carries the full identity across', () => {
    expect(buildIdentityPatch(option as never, 5)).toEqual({
      name: 'Zepbound',
      drugClass: 'dual_glp_1_gip',
      route: 'injection',
      halfLifeDays: 5,
      doseUnit: 'mg',
      plannedDose: 5,
    });
  });

  // The compound already has dose history under this id. Patching startDate or
  // status would restart or reopen a medication the user has been taking for
  // weeks — the rename must correct the label and nothing else.
  it('never touches startDate or status', () => {
    const patch = buildIdentityPatch(option as never, 5);
    expect(patch).not.toHaveProperty('startDate');
    expect(patch).not.toHaveProperty('status');
  });

  it('omits plannedDose when no dose was chosen', () => {
    expect(buildIdentityPatch(option as never, null)).not.toHaveProperty('plannedDose');
  });

  it('preserves a custom entry’s "not sure" half-life as null, never a default', () => {
    const patch = buildCustomIdentityPatch({
      name: '  Retatrutide ',
      route: 'injection',
      amount: 4,
      unit: 'mg',
      frequency: 'weekly',
      timeOfDay: '09:00',
      halfLifeDays: null,
    });
    expect(patch.name).toBe('Retatrutide');
    expect(patch.halfLifeDays).toBeNull();
    expect(patch).not.toHaveProperty('startDate');
  });
});
