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

/** What the custom-entry form collects. Route and frequency are EXPLICIT
 *  choices (null until the user picks — never defaulted); halfLifeDays null
 *  = "not sure", which suppresses the level curve rather than fabricating a
 *  number. */
export interface CustomCompoundDraft {
  name: string;
  route: 'injection' | 'oral' | null;
  amount: number | null;
  unit: CompoundInput['doseUnit'];
  frequency: 'daily' | 'weekly' | 'biweekly' | null;
  /** "HH:MM" — asked only for daily cadence; arms the daily nextDoseAt. */
  timeOfDay: string;
  halfLifeDays: number | null;
}

export function isCustomCompoundValid(draft: CustomCompoundDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.route != null &&
    draft.frequency != null &&
    draft.amount != null &&
    draft.amount > 0 &&
    (draft.halfLifeDays == null || draft.halfLifeDays > 0)
  );
}

export function buildCustomCompoundInput(draft: CustomCompoundDraft, startDate: string): CompoundInput {
  return {
    name: draft.name.trim(),
    drugClass: 'other',
    route: draft.route ?? 'injection',
    // null stays null — "not modelled". The backend stores absence; no
    // 7-day fallback anywhere in this path.
    halfLifeDays: draft.halfLifeDays,
    doseUnit: draft.unit,
    ...(draft.amount && draft.amount > 0 ? { plannedDose: draft.amount } : {}),
    startDate,
    status: 'active',
  };
}

/** The schedule that rides along with a custom compound — created in the same
 *  save, not as a separate step. Daily carries the chosen time so the daily
 *  nextDoseAt projection has something to project from. */
export function buildCustomScheduleInput(
  draft: CustomCompoundDraft,
  compoundId: string,
): { compoundId: string; frequency: 'daily' | 'weekly' | 'biweekly'; daysOfWeek: number[]; active: boolean; timesOfDay?: string[] } {
  return {
    compoundId,
    frequency: draft.frequency ?? 'weekly',
    daysOfWeek: [],
    active: true,
    ...(draft.frequency === 'daily' ? { timesOfDay: [draft.timeOfDay] } : {}),
  };
}
