// Pure derivation of the Home view-model from HomeResponse (testable-orchestrator
// pattern). No RN imports. Surfaces everything the backend contract provides:
// medication level + next dose, today's calories / protein / fiber / water against
// their profile targets, the logging streak, setup progress, latest weight, and
// the first insight.

import type { HomeResponse, Insight, MedicationLevelResponse } from '@pepta/shared';
import { formatShortDate } from './progressView';
import { resolveLevelView, type LevelSuppressionReason } from './levelSuppression';
import { buildMilestoneTrack, milestoneLabel, type MilestoneTrack } from './weightMilestones';

export interface MedicationView {
  name: string;
  estimate: number;
  unit: string;
  status: string;
  bars: LevelBar[];
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

export interface GoalView {
  pct: number; // 0..1 toward goal
  value: number; // latest weight
  unit: string;
  dateLabel: string;
  /** The milestone track the card draws — see weightMilestones.ts. */
  track: MilestoneTrack;
  /** "4.5 lb to go", or "Goal reached". */
  trackLabel: string;
}

export interface HomeWeightPulseView {
  title: string;
  detail: string;
  latestLabel: string | null;
  actionLabel: string;
}

export interface HomeView {
  rangeLabel: string;
  rangeDayCount: number;
  medication: MedicationView | null;
  /**
   * Set when NO active compound can carry a level curve — an oral route, or
   * a custom med with no half-life. The card shows the matching honest
   * sentence instead of a fabricated curve or the misleading
   * "log your first shot". Null means the normal empty state applies.
   */
  levelSuppressed: LevelSuppressionReason | null;
  calories: RingStat;
  protein: RingStat;
  fiber: RingStat;
  water: RingStat;
  streakDays: number;
  setup: SetupView | null; // null once the dashboard is unlocked
  weight: { value: number; unit: string } | null;
  weightPulse: HomeWeightPulseView;
  goal: GoalView | null;
  insight: Insight | null;
}

export function formatCountdown(hours: number | null): string | null {
  if (hours == null) return null;
  const total = Math.max(0, Math.round(hours));
  const days = Math.floor(total / 24);
  const h = total % 24;
  return days > 0 ? `${days}d ${h}h` : `${h}h`;
}

export interface LevelBar {
  /** 0..1, normalised to the tallest bar shown. */
  height: number;
  /** "M", "T" … — the local weekday this bar actually is. */
  letter: string;
  isToday: boolean;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The last `count` local days ending today, oldest first. */
export function recentDays(now: Date, count = 7): Date[] {
  const days: Date[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    days.push(day);
  }
  return days;
}

/** Letters alone, for the empty card — there is no curve to read there. */
export function recentDayLetters(now: Date, count = 7): string[] {
  return recentDays(now, count).map((day) => DAY_LETTERS[day.getDay()]!);
}

/**
 * One bar per local day for the last week, labelled with that day.
 *
 * WHY NOT EVENLY SPACED. The curve spans now−7d to now+7d, so taking `count`
 * evenly-spaced samples put roughly half the bars in the FUTURE — projections
 * rendered identically to history, immediately under the words "Current
 * estimate", with no labels to say which was which. Sampling per day makes the
 * row mean "your level across this past week", which is what the design's
 * M T W T F S S was always describing.
 *
 * Each day takes the last sample at or before the end of that day, clamped to
 * `now`, so today's bar is today's level and never a projection.
 */
export function medicationBars(
  curve: MedicationLevelResponse['curve'],
  now: Date = new Date(),
  count = 7,
): LevelBar[] {
  if (curve.length === 0) return [];

  const points = curve
    .map((point) => ({ at: new Date(point.datetime).getTime(), level: point.level }))
    .filter((point) => Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);
  if (points.length === 0) return [];

  const nowMs = now.getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const picked = recentDays(now, count).map((day) => {
    const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() - 1;
    const cutoff = Math.min(endOfDay, nowMs);
    let level = 0;
    for (const point of points) {
      if (point.at > cutoff) break;
      level = point.level;
    }
    return {
      level,
      letter: DAY_LETTERS[day.getDay()]!,
      isToday: day.getTime() === today,
    };
  });

  const peak = Math.max(...picked.map((p) => p.level), 1);
  return picked.map((p) => ({
    height: Math.max(0.06, p.level / peak),
    letter: p.letter,
    isToday: p.isToday,
  }));
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
  // Suppressed compounds (oral / no half-life) never reach the card: for a
  // mixed user this picks the INJECTABLE's curve rather than the oral's.
  const { level: ml, suppressed } = resolveLevelView(home);
  const compound = ml ? home.activeCompounds.find((c) => c.id === ml.compoundId) : undefined;
  const profile = home.profile;
  // Prefer the dedicated nextDose block; fall back to the level engine's value.
  const nextDoseHours = home.nextDose?.hoursUntilNextDose ?? ml?.hoursUntilNextDose ?? null;

  const setup = home.setupProgress;
  const rangeLabel = home.rangeTotals?.label ?? 'Today';
  const rangeDayCount = Math.max(1, home.rangeTotals?.dayCount ?? 1);
  const caloriesTarget = profile?.dailyCalorieTarget ? profile.dailyCalorieTarget * rangeDayCount : null;
  const proteinTarget = profile?.dailyProteinTargetGrams ? profile.dailyProteinTargetGrams * rangeDayCount : null;
  const fiberTarget = profile?.dailyFiberTargetGrams ? profile.dailyFiberTargetGrams * rangeDayCount : null;
  const waterTarget = profile?.dailyWaterTargetOz ? profile.dailyWaterTargetOz * rangeDayCount : null;

  // Goal progress: baseline (profile.currentWeight) → latest → goalWeight.
  const start = profile?.currentWeight ?? null;
  const current = home.latestWeight?.value ?? start;
  const goalWeight = profile?.goalWeight ?? null;
  let goal: GoalView | null = null;
  if (current != null && goalWeight != null && home.latestWeight) {
    let pct = 0;
    if (start != null && start !== goalWeight) pct = Math.max(0, Math.min(1, (start - current) / (start - goalWeight)));
    // The track's grid follows the unit the weight was logged in, so a metric
    // user gets 2 kg marks rather than 5 kg ones.
    const trackUnit = home.latestWeight.unit === 'kg' ? 'kg' : 'lb';
    const track = buildMilestoneTrack(current, goalWeight, trackUnit, {
      start: start ?? undefined,
    });
    goal = {
      pct,
      value: home.latestWeight.value,
      unit: home.latestWeight.unit,
      dateLabel: formatShortDate(home.latestWeight.datetime),
      track,
      trackLabel: milestoneLabel(track, trackUnit),
    };
  }
  const latestWeight = home.latestWeight;
  const weightPulse: HomeWeightPulseView = latestWeight
    ? {
        title: 'Today’s weigh-in?',
        detail: `Last check was ${formatShortDate(latestWeight.datetime)}. Update it in a few seconds.`,
        latestLabel: `${latestWeight.value} ${latestWeight.unit}`,
        actionLabel: 'Log weight',
      }
    : {
        title: 'Add your first scale check',
        detail: 'A baseline weight makes your progress timeline useful from day one.',
        latestLabel: null,
        actionLabel: 'Add weight',
      };

  return {
    rangeLabel,
    rangeDayCount,
    levelSuppressed: suppressed,
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
    calories: ring(home.rangeTotals?.calories ?? home.todayCalories, caloriesTarget),
    protein: ring(home.rangeTotals?.proteinGrams ?? home.todayProteinGrams, proteinTarget),
    fiber: ring(home.rangeTotals?.fiberGrams ?? home.todayFiberGrams, fiberTarget),
    water: ring(home.rangeTotals?.waterOz ?? home.todayWaterOz, waterTarget),
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
    weightPulse,
    goal,
    insight: home.insights[0] ?? null,
  };
}
