// Pure builders for the Quick Log sheet: turn the small per-type drafts into the
// exact typed inputs the api expects (datetime injected at call time). No RN
// imports → testable. Unit/enum types are derived from the shared input shapes so
// they can never drift.

import type {
  ActivityLogInput,
  DoseLogInput,
  HomeResponse,
  MeasurementInput,
  ProteinLogInput,
  SideEffectLogInput,
  TrackResponse,
  WaterLogInput,
  WeightLogInput,
} from '@pepta/shared';
import { suggestNextSite, type InjectionSite } from './trackView';

export type DoseUnit = DoseLogInput['unit'];
export type WeightUnit = WeightLogInput['unit'];
export type SideEffectType = SideEffectLogInput['types'][number];
export type MeasurementType = MeasurementInput['type'];

export interface DoseDraft {
  compoundId: string;
  compoundName: string;
  amount: number;
  unit: DoseUnit;
  site: InjectionSite;
}

// Smart default for "Log a shot": the first active compound at its planned dose,
// with the auto-rotated next injection site.
export function defaultDoseDraft(home: HomeResponse | null, track: TrackResponse | null): DoseDraft | null {
  const compound = home?.activeCompounds[0];
  if (!compound) return null;
  return {
    compoundId: compound.id,
    compoundName: compound.name,
    amount: compound.plannedDose ?? 0,
    unit: compound.doseUnit,
    site: suggestNextSite(track?.doseLogs ?? []),
  };
}

export function isDoseValid(draft: DoseDraft | null): draft is DoseDraft {
  return !!draft && draft.compoundId.length > 0 && draft.amount > 0;
}

export function toDoseInput(draft: DoseDraft, nowIso: string): DoseLogInput {
  return { compoundId: draft.compoundId, amount: draft.amount, unit: draft.unit, injectionSite: draft.site, datetime: nowIso };
}

export function toWeightInput(value: number, unit: WeightUnit, nowIso: string): WeightLogInput {
  return { value, unit, datetime: nowIso };
}

export function toProteinInput(grams: number, nowIso: string): ProteinLogInput {
  return { grams, datetime: nowIso };
}

export function toWaterInput(amountOz: number, nowIso: string): WaterLogInput {
  return { amountOz, datetime: nowIso };
}

export function toSideEffectInput(types: SideEffectType[], severity: number, nowIso: string, notes?: string): SideEffectLogInput {
  return { types, severity, datetime: nowIso, ...(notes ? { notes } : {}) };
}

export function toMeasurementInput(type: MeasurementType, value: number, unit: string, nowIso: string, notes?: string): MeasurementInput {
  return { type, value, unit, datetime: nowIso, ...(notes ? { notes } : {}) };
}

export interface ActivityDraft {
  steps: number;
  workoutMinutes: number;
  resistanceTraining: boolean;
}

export function isActivityValid(a: ActivityDraft): boolean {
  return a.steps > 0 || a.workoutMinutes > 0 || a.resistanceTraining;
}

export function toActivityInput(a: ActivityDraft, nowIso: string): ActivityLogInput {
  return {
    ...(a.steps > 0 ? { steps: a.steps } : {}),
    ...(a.workoutMinutes > 0 ? { workoutMinutes: a.workoutMinutes } : {}),
    resistanceTraining: a.resistanceTraining,
    datetime: nowIso,
  };
}
