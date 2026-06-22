// Pure unit helpers for the height & weight pickers. Imperial stores height as
// total inches + weight as lb; metric stores height as cm + weight as kg. The
// boundary conversion to the shared schema (height/heightUnit, currentWeight/
// weightUnit) happens at draft assembly. No RN imports → unit-testable.

export type UnitSystem = 'imperial' | 'metric';

export interface BodyMeasure {
  units: UnitSystem;
  height: number; // inches (imperial) | cm (metric)
  weight: number; // lb (imperial) | kg (metric)
}

const LB_PER_KG = 2.2046226218;

export function inchesToCm(inches: number): number {
  return inches * 2.54;
}
export function cmToInches(cm: number): number {
  return cm / 2.54;
}
export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}
export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

// Convert a measurement between unit systems, rounding to whole units (people
// rarely re-toggle, so the small repeated-round drift is acceptable).
export function convertBody(body: BodyMeasure, to: UnitSystem): BodyMeasure {
  if (body.units === to) return body;
  if (to === 'metric') {
    return { units: 'metric', height: Math.round(inchesToCm(body.height)), weight: Math.round(lbToKg(body.weight)) };
  }
  return { units: 'imperial', height: Math.round(cmToInches(body.height)), weight: Math.round(kgToLb(body.weight)) };
}

export function formatHeight(body: BodyMeasure): string {
  if (body.units === 'metric') return `${body.height} cm`;
  const feet = Math.floor(body.height / 12);
  const inches = body.height % 12;
  return `${feet}'${inches}"`;
}

export function formatWeight(body: BodyMeasure): string {
  return `${body.weight} ${body.units === 'metric' ? 'kg' : 'lb'}`;
}
