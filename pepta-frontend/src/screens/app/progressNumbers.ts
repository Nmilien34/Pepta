// "What you're eating" and "What your numbers say" — the two cards on the
// frame that the screen never had.
//
// BOTH READ A FIXED 30-DAY WINDOW, not the header scope, and the frame agrees:
// its own labels say "last 30 days" and "this week". The reason is data, not
// preference — /progress carries weights, measurements, photos and retention,
// no nutrition at all, so calories and protein come from /track, which looks
// back 30 days. Binding these to a "This year" scope would mean showing a
// month of meals under a label promising twelve.
//
// NOTHING IS SHOWN WITHOUT THE LOGS BEHIND IT. Every figure returns null when
// its inputs are missing, so a user who has never logged a meal gets no card
// rather than a card full of zeroes reading like a failed week.
//
// Pure and RN-free.

import type { MealLogResponse, ProteinLogResponse, UserProfileResponse } from '@pepta/shared';

const DAY = 86_400_000;
export const NUTRITION_WINDOW_DAYS = 30;

interface Deletable {
  deletedAt?: string | null;
}

function live<T extends Deletable & { datetime: string }>(
  rows: readonly T[] | undefined,
  from: number,
): T[] {
  return (rows ?? []).filter(
    (row) => row.deletedAt == null && new Date(row.datetime).getTime() >= from,
  );
}

/** Local calendar day, so a 9pm log is not filed under tomorrow. */
function dayOf(iso: string): string {
  const at = new Date(iso);
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

export interface EatingView {
  /** Average per DAY THEY LOGGED, not per calendar day. */
  caloriesPerDay: number | null;
  proteinPerDay: number | null;
  calorieTarget: number | null;
  proteinTarget: number | null;
  /** Days in the last seven where protein met its target. */
  proteinHitDays: number;
  proteinHitOf: number;
  /** Per-day protein for the last seven days, oldest first — the bars. */
  weekBars: { day: string; grams: number; hit: boolean }[];
}

/**
 * AVERAGED OVER DAYS WITH LOGS, not over the window. Dividing a week of meals
 * by 30 would report someone eating 400 calories a day and call it a deficit;
 * the honest average of what they recorded is what they recorded.
 */
export function eatingView(
  meals: readonly (MealLogResponse & Deletable)[] | undefined,
  proteinLogs: readonly (ProteinLogResponse & Deletable)[] | undefined,
  profile: UserProfileResponse | null,
  now = new Date(),
): EatingView | null {
  const from = now.getTime() - NUTRITION_WINDOW_DAYS * DAY;
  const mealRows = live(meals, from);
  const proteinRows = live(proteinLogs, from);
  if (mealRows.length === 0 && proteinRows.length === 0) return null;

  const calorieByDay = new Map<string, number>();
  const proteinByDay = new Map<string, number>();
  for (const meal of mealRows) {
    const day = dayOf(meal.datetime);
    calorieByDay.set(day, (calorieByDay.get(day) ?? 0) + meal.calories);
    proteinByDay.set(day, (proteinByDay.get(day) ?? 0) + meal.protein);
  }
  // Standalone protein logs count too — someone logging a shake without a meal
  // is still eating protein, and leaving it out understates every average.
  for (const row of proteinRows) {
    const day = dayOf(row.datetime);
    proteinByDay.set(day, (proteinByDay.get(day) ?? 0) + row.grams);
  }

  const mean = (values: number[]) =>
    values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  const proteinTarget = profile?.dailyProteinTargetGrams ?? null;
  const weekFrom = now.getTime() - 7 * DAY;
  const weekBars = [...proteinByDay.entries()]
    .filter(([day]) => dayKeyToTime(day) >= weekFrom)
    .sort(([left], [right]) => dayKeyToTime(left) - dayKeyToTime(right))
    .map(([day, grams]) => ({
      day,
      grams: Math.round(grams),
      hit: proteinTarget != null && grams >= proteinTarget,
    }));

  return {
    caloriesPerDay: mean([...calorieByDay.values()]),
    proteinPerDay: mean([...proteinByDay.values()]),
    calorieTarget: profile?.dailyCalorieTarget ?? null,
    proteinTarget,
    proteinHitDays: weekBars.filter((bar) => bar.hit).length,
    proteinHitOf: weekBars.length,
    weekBars,
  };
}

function dayKeyToTime(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m!, d!).getTime();
}

export interface NumberStat {
  value: string;
  unit: string;
  /** The quiet line under it: "last 30 days", "aim 1.4". */
  note: string;
}

export interface NumbersView {
  stats: NumberStat[];
  /** The footer: healthy weight range and the calorie target. */
  footer: string;
}

const KG_PER_LB = 0.45359237;

/**
 * The four figures under "What your numbers say", each omitted when its inputs
 * are not there. A card with two real stats is worth more than four where two
 * are invented.
 */
export function numbersView(input: {
  currentWeight: number | null;
  weightUnit: string;
  /** Weight this far back, for the weekly rate. */
  weightThirtyDaysAgo: number | null;
  /** As stored: cm or inches, with its unit — same contract as computeBmi. */
  height: number | null;
  heightUnit: string;
  eating: EatingView | null;
  profile: UserProfileResponse | null;
}): NumbersView | null {
  const stats: NumberStat[] = [];
  const { currentWeight, weightUnit, weightThirtyDaysAgo, height, heightUnit, eating, profile } =
    input;

  if (currentWeight != null && weightThirtyDaysAgo != null) {
    const perWeek = ((weightThirtyDaysAgo - currentWeight) / 30) * 7;
    stats.push({
      value: Math.abs(perWeek).toFixed(1),
      unit: `${weightUnit}/wk`,
      note: 'last 30 days',
    });
  }

  // Distance to the top of the healthy BMI band, in the user's own unit.
  const healthy = healthyRange(height, heightUnit, weightUnit);
  if (currentWeight != null && healthy && currentWeight > healthy.max) {
    stats.push({
      value: (currentWeight - healthy.max).toFixed(1),
      unit: weightUnit,
      note: 'to Normal',
    });
  }

  if (eating?.proteinPerDay != null && currentWeight != null) {
    const kg = weightUnit === 'kg' ? currentWeight : currentWeight * KG_PER_LB;
    const perKg = eating.proteinPerDay / kg;
    const aim = profile?.proteinGramsPerKg;
    stats.push({
      value: perKg.toFixed(1),
      unit: 'g/kg',
      note: aim ? `aim ${aim.toFixed(1)}` : 'of body weight',
    });
  }

  if (eating?.caloriesPerDay != null && eating.calorieTarget != null) {
    const gap = eating.calorieTarget - eating.caloriesPerDay;
    stats.push({
      value: String(Math.abs(Math.round(gap))),
      unit: 'cal',
      note: gap >= 0 ? 'a day under' : 'a day over',
    });
  }

  if (stats.length === 0) return null;

  const parts: string[] = [];
  if (healthy) {
    parts.push(`Healthy range ${Math.round(healthy.min)}–${Math.round(healthy.max)} ${weightUnit}`);
  }
  if (eating?.calorieTarget != null) parts.push(`calories ${eating.calorieTarget} a day`);

  return { stats, footer: parts.join(' · ') };
}

/** BMI 18.5–24.9 in the user's own unit. Null without a height to compute from. */
export function healthyRange(
  height: number | null,
  heightUnit: string,
  weightUnit: string,
): { min: number; max: number } | null {
  if (!height || height <= 0) return null;
  const cm = heightUnit === 'cm' ? height : height * 2.54;
  const metres = cm / 100;
  const minKg = 18.5 * metres * metres;
  const maxKg = 24.9 * metres * metres;
  if (weightUnit === 'kg') return { min: minKg, max: maxKg };
  return { min: minKg / KG_PER_LB, max: maxKg / KG_PER_LB };
}


export interface MilestoneView {
  /** "10% of your start" — what the next round number actually is. */
  label: string;
  /** "7.6 lb to go", or null once it is behind them. */
  remaining: string | null;
}

/**
 * The tinted box under the goal ring: the next round loss milestone.
 *
 * ROUND FRACTIONS OF THE STARTING WEIGHT, because that is how the clinical
 * literature and every doctor talks about it — 5% and 10% are the thresholds
 * that mean something, not "12 lb". Past 10% it counts whole tens so the box
 * still has something to aim at rather than going blank on the people doing
 * best.
 */
export function nextMilestone(
  start: number | null,
  current: number | null,
  unit: string,
): MilestoneView | null {
  if (start == null || current == null || start <= 0) return null;
  const lostPct = ((start - current) / start) * 100;
  // The next multiple of five above where they are, computed rather than
  // looked up in a list: a fixed table runs out, and the box would go blank on
  // the people furthest along. Someone who has gained is below zero, so the
  // first threshold is still 5%.
  const next = Math.max(5, Math.floor(lostPct / 5) * 5 + 5);
  const targetWeight = start * (1 - next / 100);
  const remaining = Math.round((current - targetWeight) * 10) / 10;
  return {
    label: `${next}% of your start`,
    remaining: remaining > 0 ? `${remaining} ${unit} to go` : null,
  };
}

/** "Sun, Jun 21" — the weigh-in date under the Weight card's readout. */
export function weighInDate(iso: string | null): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(at);
  } catch {
    return iso.slice(0, 10);
  }
}


export interface DriverPreview {
  label: string;
  /** "2 of 7 days" · "not logged yet" · "on track" */
  status: string;
  /** Green when it is already going well, quiet otherwise. Never red. */
  tone: 'good' | 'quiet';
}

/**
 * The Muscle protection card BEFORE there is a score.
 *
 * A QUIET WEEK IS NOT A BAD ONE, so this never scores and never scolds. It
 * reports the three inputs the engine will use, each from real logs, so
 * someone can see what the score is waiting on instead of an empty card that
 * looks broken.
 */
export function retentionPreview(input: {
  eating: EatingView | null;
  /** Any workout minutes logged this week. */
  trainedDays: number;
  /** Weight change per week, negative for loss. Null without two weigh-ins. */
  weeklyChange: number | null;
  /** The plan's intended weekly loss, from the profile. */
  targetWeeklyLoss: number | null;
}): DriverPreview[] {
  const { eating, trainedDays, weeklyChange, targetWeeklyLoss } = input;

  const protein: DriverPreview =
    eating && eating.proteinHitOf > 0
      ? {
          label: 'Protein',
          status: `${eating.proteinHitDays} of ${eating.proteinHitOf} days`,
          tone: eating.proteinHitDays >= Math.ceil(eating.proteinHitOf / 2) ? 'good' : 'quiet',
        }
      : { label: 'Protein', status: 'not logged yet', tone: 'quiet' };

  const training: DriverPreview =
    trainedDays > 0
      ? { label: 'Training', status: `${trainedDays} ${trainedDays === 1 ? 'day' : 'days'}`, tone: 'good' }
      : { label: 'Training', status: 'not logged yet', tone: 'quiet' };

  // Losing FASTER than planned is the case worth flagging quietly — it is what
  // costs muscle — so "on track" means at or under the intended pace.
  const pace: DriverPreview =
    weeklyChange == null
      ? { label: 'Pace', status: 'not enough weigh-ins', tone: 'quiet' }
      : targetWeeklyLoss == null
        ? { label: 'Pace', status: 'no target set', tone: 'quiet' }
        : Math.abs(weeklyChange) <= targetWeeklyLoss * 1.25
          ? { label: 'Pace', status: 'on track', tone: 'good' }
          : { label: 'Pace', status: 'faster than planned', tone: 'quiet' };

  return [protein, training, pace];
}

/** Days this week with any workout logged. */
export function trainedDaysThisWeek(
  activity: readonly ({ datetime: string; workoutMinutes?: number | null } & Deletable)[] | undefined,
  now = new Date(),
): number {
  const from = now.getTime() - 7 * DAY;
  const days = new Set<string>();
  for (const row of activity ?? []) {
    if (row.deletedAt != null) continue;
    if (!row.workoutMinutes) continue;
    if (new Date(row.datetime).getTime() < from) continue;
    days.add(dayOf(row.datetime));
  }
  return days.size;
}
