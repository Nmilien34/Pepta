// Pure derivation of the Home view-model from HomeResponse (testable-orchestrator
// pattern). No RN imports. Surfaces everything the backend contract provides:
// medication level + next dose, today's calories / protein / fiber / water against
// their profile targets, the logging streak, setup progress, latest weight, and
// the first insight.

import type { HomeResponse, Insight, MedicationLevelResponse } from '@pepta/shared';

export interface MedicationView {
  name: string;
  estimate: number;
  unit: string;
  status: string;
  bars: number[]; // 0..1 normalized heights
  countdown: string | null;
}

export interface RingStat {
  current: number;
  target: number | null;
  pct: number; // 0..1
}

export interface SetupView {
  loggedItems: number;
  required: number;
  pct: number; // 0..1
  unlocked: boolean;
}

export interface HomeView {
  medication: MedicationView | null;
  calories: RingStat;
  protein: RingStat;
  fiber: RingStat;
  water: RingStat;
  streakDays: number;
  setup: SetupView | null; // null once the dashboard is unlocked
  weight: { value: number; unit: string } | null;
  insight: Insight | null;
}

export function formatCountdown(hours: number | null): string | null {
  if (hours == null) return null;
  const total = Math.max(0, Math.round(hours));
  const days = Math.floor(total / 24);
  const h = total % 24;
  return days > 0 ? `${days}d ${h}h` : `${h}h`;
}

// Sample `count` points evenly across the curve, normalized to the peak.
export function medicationBars(curve: MedicationLevelResponse['curve'], count = 7): number[] {
  if (curve.length === 0) return [];
  const n = Math.min(count, curve.length);
  const step = (curve.length - 1) / Math.max(1, n - 1);
  const picks = Array.from({ length: n }, (_, i) => curve[Math.round(i * step)]?.level ?? 0);
  const peak = Math.max(...picks, 1);
  return picks.map((v) => Math.max(0.06, v / peak));
}

export function medicationStatus(ml: MedicationLevelResponse): string {
  const range = ml.peakEstimate - ml.troughEstimate;
  if (range <= 0) return 'Steady';
  const pos = (ml.currentEstimate - ml.troughEstimate) / range;
  if (pos >= 0.8) return 'Peaking';
  if (pos <= 0.25) return 'Low';
  return 'Steady';
}

function ring(current: number, target: number | null | undefined): RingStat {
  const t = target ?? null;
  return { current, target: t, pct: t && t > 0 ? Math.min(1, current / t) : 0 };
}

export function buildHomeView(home: HomeResponse): HomeView {
  const ml = home.medicationLevels[0] ?? null;
  const compound = ml ? home.activeCompounds.find((c) => c.id === ml.compoundId) : undefined;
  const profile = home.profile;
  // Prefer the dedicated nextDose block; fall back to the level engine's value.
  const nextDoseHours = home.nextDose?.hoursUntilNextDose ?? ml?.hoursUntilNextDose ?? null;

  const setup = home.setupProgress;
  return {
    medication: ml
      ? {
          name: ml.compoundName,
          estimate: ml.currentEstimate,
          unit: compound?.doseUnit ?? 'mg',
          status: medicationStatus(ml),
          bars: medicationBars(ml.curve),
          countdown: formatCountdown(nextDoseHours),
        }
      : null,
    calories: ring(home.todayCalories, profile?.dailyCalorieTarget),
    protein: ring(home.todayProteinGrams, profile?.dailyProteinTargetGrams),
    fiber: ring(home.todayFiberGrams, profile?.dailyFiberTargetGrams),
    water: ring(home.todayWaterOz, profile?.dailyWaterTargetOz),
    streakDays: home.streakDays,
    setup:
      setup && !setup.unlocked
        ? {
            loggedItems: setup.loggedItems,
            required: setup.required,
            pct: setup.required > 0 ? Math.min(1, setup.loggedItems / setup.required) : 0,
            unlocked: setup.unlocked,
          }
        : null,
    weight: home.latestWeight ? { value: home.latestWeight.value, unit: home.latestWeight.unit } : null,
    insight: home.insights[0] ?? null,
  };
}
