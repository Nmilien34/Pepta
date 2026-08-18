// "How did that shot go?" — one dose, and everything that happened in the
// window it covers.
//
// WHY IT EXISTS: "Your log" answers *what* was recorded. It cannot answer the
// question a GLP-1 user actually has about a shot they took — did I lose
// weight on it, did I eat enough protein, did it make me sick, and how long
// did I actually leave between shots. Every one of those is already in the
// payload; nothing here is new data, only data finally put next to the dose it
// belongs to.
//
// THE WINDOW is [this dose, next dose) — or [this dose, now] for the most
// recent one. That is the interval the shot is responsible for, and it is why
// the numbers here differ from the same numbers on Home, which are per-day.
//
// NOTHING IS MODELLED. Averages are over days that actually have logs, weight
// is the first and last real weigh-in inside the window, and the curve is a
// SLICE of the one the backend computed — never a client-side re-derivation of
// the pharmacokinetics. An interval the backend's ±7-day curve does not reach
// gets no chart at all, rather than an invented one.
//
// Pure and RN-free.

import type { HomeResponse, TrackResponse } from '@pepta/shared';
import type { LevelPoint } from './levelChart';
import { siteLabel, sideEffectTypeLabel } from './trackView';

const MS_PER_DAY = 86_400_000;

export interface ShotWeightChange {
  from: number;
  to: number;
  /** to − from. Negative is a loss, which is the usual direction here. */
  delta: number;
  unit: string;
  /** Number of weigh-ins the change is based on; 2 is the minimum. */
  readings: number;
}

export interface ShotSideEffect {
  label: string;
  severity: number | null;
  datetime: string;
}

export interface ShotWindow {
  doseId: string;
  compoundName: string;
  /** "5 mg" — read off the record, never recomputed. */
  amountLabel: string;
  datetime: string;
  /** "Right Thigh", or null for an oral dose with no site. */
  site: string | null;
  notes: string | null;
  /** Side effects the user attached to the dose itself, as labels. */
  taggedSideEffects: string[];

  windowStart: string;
  windowEnd: string;
  /** True when nothing has been logged after this dose — window ends at now. */
  isLatest: boolean;
  /** Whole days the window spans, at least 1. */
  windowDays: number;
  /** Days between the PREVIOUS dose and this one; null for the first. */
  daysSincePrevious: number | null;

  weight: ShotWeightChange | null;
  /** Per day, over days with logs only — never diluted by days with none. */
  avgCalories: number | null;
  avgProtein: number | null;
  sideEffects: ShotSideEffect[];
  /** Backend curve sliced to the window. Empty when it does not reach. */
  curve: LevelPoint[];
}

interface Deletable {
  deletedAt?: string | null;
}

const live = <T extends Deletable>(rows: readonly T[] | undefined): T[] =>
  (rows ?? []).filter((row) => row.deletedAt == null);

const time = (iso: string) => new Date(iso).getTime();

/** Local calendar day, so "days with logs" counts the user's days. */
function dayKey(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`;
}

/** Mean per DAY, not per entry: three snacks on one day is one day of eating. */
function dailyAverage(rows: { datetime: string; value: number }[]): number | null {
  if (rows.length === 0) return null;
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.datetime);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + row.value);
  }
  if (byDay.size === 0) return null;
  let total = 0;
  for (const value of byDay.values()) total += value;
  return Math.round(total / byDay.size);
}

export interface ShotWindowInput {
  doseId: string;
  track: TrackResponse | null;
  home: HomeResponse | null;
  now?: Date;
}

export function buildShotWindow({
  doseId,
  track,
  home,
  now = new Date(),
}: ShotWindowInput): ShotWindow | null {
  if (!track) return null;
  const dose = live(track.doseLogs).find((row) => row.id === doseId);
  if (!dose) return null;

  const compound = home?.activeCompounds.find((c) => c.id === dose.compoundId);

  // Same compound only. A BPC-157 dose logged in the middle of a weekly
  // tirzepatide gap must not cut that gap in half.
  const sameCompound = live(track.doseLogs)
    .filter((row) => row.compoundId === dose.compoundId)
    .sort((a, b) => time(a.datetime) - time(b.datetime));
  const index = sameCompound.findIndex((row) => row.id === doseId);
  const previous = index > 0 ? sameCompound[index - 1] : undefined;
  const next = sameCompound[index + 1];

  const start = time(dose.datetime);
  const end = next ? time(next.datetime) : now.getTime();
  // A dose logged in the future (or a clock skew) would otherwise produce a
  // negative window and NaN averages.
  const windowEnd = Math.max(start, end);
  const inWindow = (iso: string) => {
    const at = time(iso);
    // Half-open: the next dose's own day belongs to the next shot.
    return at >= start && at < windowEnd;
  };

  const weights = live(track.weightLogs)
    .filter((row) => inWindow(row.datetime))
    .sort((a, b) => time(a.datetime) - time(b.datetime));
  const first = weights[0];
  const last = weights[weights.length - 1];
  const weight =
    first && last && weights.length >= 2
      ? {
          from: first.value,
          to: last.value,
          delta: Number((last.value - first.value).toFixed(1)),
          unit: last.unit,
          readings: weights.length,
        }
      : null;

  const meals = live(track.mealLogs).filter((row) => inWindow(row.datetime));
  const avgCalories = dailyAverage(
    meals.map((meal) => ({ datetime: meal.datetime, value: meal.calories })),
  );
  // Protein comes from BOTH sources the app offers — the meal breakdown and
  // the standalone gram counter. Reading only one silently halves the number
  // for anyone who uses the other.
  const avgProtein = dailyAverage([
    ...meals.map((meal) => ({ datetime: meal.datetime, value: meal.protein })),
    ...live(track.proteinLogs)
      .filter((row) => inWindow(row.datetime))
      .map((row) => ({ datetime: row.datetime, value: row.grams })),
  ]);

  const sideEffects: ShotSideEffect[] = live(track.sideEffectLogs)
    .filter((row) => inWindow(row.datetime))
    .sort((a, b) => time(a.datetime) - time(b.datetime))
    .flatMap((row) =>
      (row.types ?? []).map((type) => ({
        label: sideEffectTypeLabel(type),
        severity: row.severity ?? null,
        datetime: row.datetime,
      })),
    );

  const level = home?.medicationLevels.find((ml) => ml.compoundId === dose.compoundId);
  const curve = (level?.curve ?? []).filter((point) => inWindow(point.datetime));

  return {
    doseId: dose.id,
    compoundName: compound?.name ?? 'Medication',
    amountLabel: `${dose.amount} ${dose.unit}`,
    datetime: dose.datetime,
    site: dose.injectionSite ? siteLabel(dose.injectionSite) : null,
    notes: dose.notes?.trim() ? dose.notes.trim() : null,
    taggedSideEffects: (dose.sideEffects ?? []).map(sideEffectTypeLabel),
    windowStart: dose.datetime,
    windowEnd: new Date(windowEnd).toISOString(),
    isLatest: !next,
    windowDays: Math.max(1, Math.round((windowEnd - start) / MS_PER_DAY)),
    daysSincePrevious: previous
      ? Math.max(0, Math.round((start - time(previous.datetime)) / MS_PER_DAY))
      : null,
    weight,
    avgCalories,
    avgProtein,
    sideEffects,
    // Two points is the minimum that can be drawn as a line; one is a dot with
    // no shape, which reads as data we do not have.
    curve: curve.length >= 2 ? curve : [],
  };
}

/** "7 days after your last shot" / "Your first logged shot". */
export function cadenceLabel(shot: ShotWindow): string {
  if (shot.daysSincePrevious === null) return 'Your first logged shot';
  if (shot.daysSincePrevious === 0) return 'Same day as your last shot';
  if (shot.daysSincePrevious === 1) return '1 day after your last shot';
  return `${shot.daysSincePrevious} days after your last shot`;
}

/** "Over the 7 days after" / "In the 3 days since" for the latest shot. */
export function windowLabel(shot: ShotWindow): string {
  const days = shot.windowDays === 1 ? '1 day' : `${shot.windowDays} days`;
  return shot.isLatest ? `In the ${days} since` : `Over the ${days} after`;
}
