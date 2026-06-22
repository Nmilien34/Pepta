// Pure derivation of the Progress view-model from ProgressResponse + the user
// profile (goal weight, height for BMI). No RN imports → testable. Surfaces the
// whole contract: weight history (windowed by range), to-goal, BMI, difference,
// the weekly muscle-retention engine, measurements, and progress photos.

import type {
  MeasurementResponse,
  ProgressResponse,
  UserProfileResponse,
  WeeklyRetentionResponse,
  WeightLogResponse,
} from '@pepta/shared';
import { inchesToCm, lbToKg } from '../../utils/units';
import { MONTHS_SHORT } from '../../utils/dateParts';

export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, All: Infinity } as const;
export type RangeKey = keyof typeof RANGE_DAYS;
export const RANGE_KEYS = Object.keys(RANGE_DAYS) as RangeKey[];

export interface WeightPoint {
  t: number; // epoch ms
  value: number;
  iso: string;
}

export function sortWeights(weights: WeightLogResponse[]): WeightLogResponse[] {
  return [...weights].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
}

export function weightSeries(weights: WeightLogResponse[], range: RangeKey, now: Date): WeightPoint[] {
  const span = RANGE_DAYS[range];
  const cutoff = span === Infinity ? -Infinity : now.getTime() - span * 86_400_000;
  return sortWeights(weights)
    .filter((w) => new Date(w.datetime).getTime() >= cutoff)
    .map((w) => ({ t: new Date(w.datetime).getTime(), value: w.value, iso: w.datetime }));
}

export interface WeightSummary {
  current: number | null;
  start: number | null; // earliest logged (baseline), falls back to profile
  unit: string;
  difference: number | null; // current − start (negative = loss)
  goalWeight: number | null;
  toGoalPct: number; // 0..1
}

export function weightSummary(weights: WeightLogResponse[], profile: UserProfileResponse | null): WeightSummary {
  const sorted = sortWeights(weights);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = first?.value ?? profile?.currentWeight ?? null;
  const current = last?.value ?? profile?.currentWeight ?? null;
  const unit = last?.unit ?? profile?.weightUnit ?? 'lb';
  const goalWeight = profile?.goalWeight ?? null;
  const difference = start != null && current != null ? Math.round((current - start) * 10) / 10 : null;
  let toGoalPct = 0;
  if (start != null && current != null && goalWeight != null && start !== goalWeight) {
    toGoalPct = Math.max(0, Math.min(1, (start - current) / (start - goalWeight)));
  }
  return { current, start, unit, difference, goalWeight, toGoalPct };
}

export interface BmiView {
  value: number;
  category: string;
}

export function computeBmi(weightValue: number, weightUnit: string, height: number, heightUnit: string): BmiView {
  const kg = weightUnit === 'kg' ? weightValue : lbToKg(weightValue);
  const cm = heightUnit === 'cm' ? height : inchesToCm(height);
  const m = cm / 100;
  const value = m > 0 ? kg / (m * m) : 0;
  const category =
    value < 18.5 ? 'Underweight' : value < 25 ? 'Healthy range' : value < 30 ? 'Overweight range' : 'Obese range';
  return { value: Math.round(value * 10) / 10, category };
}

export function bmiView(currentWeight: number | null, weightUnit: string, profile: UserProfileResponse | null): BmiView | null {
  if (currentWeight == null || !profile?.height || !profile.heightUnit) return null;
  return computeBmi(currentWeight, weightUnit, profile.height, profile.heightUnit);
}

export type RetentionTone = 'good' | 'warn' | 'bad';

export interface RetentionView {
  score: number;
  label: string;
  tone: RetentionTone;
  prose: string;
  drivers: { label: string; score: number }[];
}

const VERDICT_META: Record<string, { label: string; tone: RetentionTone }> = {
  protected: { label: 'Protected', tone: 'good' },
  steady: { label: 'On track', tone: 'good' },
  watch: { label: 'Watch', tone: 'warn' },
  at_risk: { label: 'At risk', tone: 'bad' },
};

export function latestRetention(list: WeeklyRetentionResponse[]): RetentionView | null {
  if (list.length === 0) return null;
  const latest = [...list].sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0]!;
  const meta = VERDICT_META[latest.verdict] ?? { label: latest.verdict, tone: 'warn' as RetentionTone };
  return {
    score: latest.score,
    label: meta.label,
    tone: meta.tone,
    prose: latest.verdictProse,
    drivers: latest.drivers.map((d) => ({ label: d.label, score: d.score })),
  };
}

const MEASURE_LABEL: Record<string, string> = {
  waist: 'Waist',
  hips: 'Hips',
  chest: 'Chest',
  arm: 'Arm',
  thigh: 'Thigh',
  neck: 'Neck',
  body_fat: 'Body fat',
  face_fullness: 'Face fullness',
};

export function measurementLabel(type: string): string {
  return MEASURE_LABEL[type] ?? type;
}

export interface LatestMeasurement {
  type: string;
  label: string;
  value: number;
  unit: string;
  iso: string;
}

export function latestMeasurements(measurements: MeasurementResponse[]): LatestMeasurement[] {
  const byType = new Map<string, MeasurementResponse>();
  for (const m of [...measurements].sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())) {
    if (!byType.has(m.type)) byType.set(m.type, m);
  }
  return [...byType.values()].map((m) => ({
    type: m.type,
    label: measurementLabel(m.type),
    value: m.value,
    unit: m.unit,
    iso: m.datetime,
  }));
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS_SHORT[d.getMonth()] ?? ''} ${d.getDate()}`;
}

export function summary(progress: ProgressResponse, profile: UserProfileResponse | null) {
  const ws = weightSummary(progress.weights, profile);
  return {
    weight: ws,
    bmi: bmiView(ws.current, ws.unit, profile),
    retention: latestRetention(progress.weeklyRetention),
    measurements: latestMeasurements(progress.measurements),
    estimatedGoalDate: profile?.estimatedGoalDate ?? null,
  };
}
