import { describe, expect, it } from 'vitest';
import type { CompoundResponse, HomeResponse } from '@pepta/shared';
import { homeWithAddedCompound } from './PeptaDataContext';

const baseHome = {
  activeCompounds: [
    {
      id: 'onboarding-compound',
      name: 'Tirzepatide',
      drugClass: 'dual_glp_1_gip',
      route: 'injection',
      halfLifeDays: 5,
      doseUnit: 'mg',
      plannedDose: 5,
      startDate: '2026-06-01',
      status: 'active',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
  ],
} as HomeResponse;

const addedCompound = {
  id: 'manual-compound',
  name: 'Retatrutide',
  drugClass: 'peptide',
  route: 'injection',
  halfLifeDays: 6,
  doseUnit: 'mg',
  plannedDose: 2,
  startDate: '2026-06-23',
  status: 'active',
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:00:00.000Z',
} as CompoundResponse;

describe('homeWithAddedCompound', () => {
  it('adds a manually-created compound without replacing the onboarding compound', () => {
    const next = homeWithAddedCompound(baseHome, addedCompound);

    expect(next?.activeCompounds.map((compound) => compound.id)).toEqual([
      'manual-compound',
      'onboarding-compound',
    ]);
  });

  it('updates an existing compound instead of duplicating it', () => {
    const next = homeWithAddedCompound(baseHome, {
      ...baseHome.activeCompounds[0]!,
      plannedDose: 7.5,
    });

    expect(next?.activeCompounds).toHaveLength(1);
    expect(next?.activeCompounds[0]?.plannedDose).toBe(7.5);
  });
});
