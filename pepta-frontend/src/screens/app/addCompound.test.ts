import { describe, expect, it } from 'vitest';
import type { MedicationOption } from '../../data/medicationCatalog';
import { buildCompoundInput, todayDateOnly } from './addCompound';

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
