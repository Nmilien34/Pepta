// Pure builder for adding a medication (compound) from the local catalog option.
// No RN imports → testable. Maps a MedicationOption + chosen dose into the typed
// CompoundInput the api expects.

import type { CompoundInput } from '@pepta/shared';
import type { MedicationOption } from '../../data/medicationCatalog';

export function todayDateOnly(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function buildCompoundInput(option: MedicationOption, plannedDose: number | null, startDate: string): CompoundInput {
  return {
    name: option.name,
    drugClass: option.drugClass,
    route: option.route,
    halfLifeDays: option.halfLifeDays,
    doseUnit: option.doseUnit,
    ...(plannedDose && plannedDose > 0 ? { plannedDose } : {}),
    startDate,
    status: 'active',
  };
}
