import {
  compoundResponseSchema,
  homeRangeKeySchema,
  homeResponseSchema,
  type HomeRangeKey,
  userProfileResponseSchema,
  weightLogResponseSchema,
} from '@pepta/shared';
import { addUtcDays, startOfUtcDay } from '../lib/dates';
import { parseHomeTimezone, resolveHomeWindow } from '../lib/homeRange';
import { consecutiveActivityStreak } from '../lib/streak';
import {
  ActivityLogModel,
  CompoundModel,
  DoseLogModel,
  MealLogModel,
  ProteinLogModel,
  FiberLogModel,
  UserProfileModel,
  WaterLogModel,
  WeightLogModel,
} from '../models';
import { getInsights } from './insights.service';
import { getMedicationLevels, getNextDoseCandidates } from './medication-level.service';
import { getWeeklyRetention } from './muscle-retention.service';
import { serializeWithSchema } from './serializers';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Section failed';
}

const RANGE_LABEL: Record<HomeRangeKey, string> = {
  today: 'Today',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

function parseHomeRange(input: unknown): HomeRangeKey {
  const parsed = homeRangeKeySchema.safeParse(input);
  return parsed.success ? parsed.data : 'today';
}


async function getProfile(userId: string) {
  const profile = await UserProfileModel.findOne({ userId });
  return profile ? serializeWithSchema(userProfileResponseSchema, profile) : null;
}

async function getActiveCompounds(userId: string, includeUnmodeled: boolean) {
  const compounds = await CompoundModel.find({ userId, status: 'active' }).sort({ createdAt: -1 });
  // ⚠️ LOAD-BEARING COMPAT FILTER — DO NOT REMOVE (2026-08-07, tz-param
  // precedent; re-affirmed by the 2026-08-11 audit).
  // compoundResponseSchema extends compoundInputSchema, whose halfLifeDays
  // became nullish when custom medications shipped. Every 1.0.4/1.0.5 client
  // — and any 1.0.6 build that has not taken the recent OTAs — bundles the
  // OLD strict schema where halfLifeDays is a REQUIRED positive number. Such
  // a client hard-fails its entire /home parse on a single unmodelled
  // compound: not a missing card, a blank Home screen. Only callers that
  // send ?unmodeled=1 assert they can handle null. Deleting this filter, or
  // defaulting the flag to true, silently bricks Home for every stale
  // install. Widen only after those builds are provably gone.
  const visible = includeUnmodeled
    ? compounds
    : compounds.filter((compound) => compound.halfLifeDays != null);
  return visible.map((compound) => serializeWithSchema(compoundResponseSchema, compound));
}

interface RangeTotals {
  protein: number;
  fiber: number;
  calories: number;
  waterOz: number;
  dayCount: number;
  hasLog: boolean;
  /** Present only in tz mode — see getRangeTotals. */
  steps?: number;
  workoutMinutes?: number;
}

async function getRangeTotals(
  userId: string,
  now: Date,
  range: HomeRangeKey,
  tz: string | null,
): Promise<RangeTotals> {
  const { start, end, dayCount } = resolveHomeWindow(range, now, tz);
  const [meals, proteins, fibers, waterLogs, activities] = await Promise.all([
    MealLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    ProteinLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    FiberLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    WaterLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    // Activity totals ride along only for tz-mode clients — legacy builds
    // strict-parse rangeTotals and must not receive the extra keys.
    tz ? ActivityLogModel.find({ userId, datetime: { $gte: start, $lt: end } }) : Promise.resolve([]),
  ]);

  return {
    protein:
      meals.reduce((sum, meal) => sum + meal.protein, 0) +
      proteins.reduce((sum, protein) => sum + protein.grams, 0),
    fiber:
      meals.reduce((sum, meal) => sum + (meal.fiber ?? 0), 0) +
      fibers.reduce((sum, fiber) => sum + fiber.grams, 0),
    calories: meals.reduce((sum, meal) => sum + meal.calories, 0),
    waterOz: waterLogs.reduce((sum, water) => sum + water.amountOz, 0),
    dayCount,
    hasLog: meals.length + proteins.length + fibers.length + waterLogs.length > 0,
    ...(tz
      ? {
          steps: activities.reduce((sum, activity) => sum + (activity.steps ?? 0), 0),
          workoutMinutes: activities.reduce(
            (sum, activity) => sum + (activity.workoutMinutes ?? 0),
            0,
          ),
        }
      : {}),
  };
}

async function getRangeAvailability(userId: string, now: Date, tz: string | null) {
  const todayStart = resolveHomeWindow('today', now, tz).start;
  const availability: Record<HomeRangeKey, boolean> = {
    today: true,
    week: false,
    month: false,
    year: false,
  };

  await Promise.all(
    (['week', 'month', 'year'] as const).map(async (range) => {
      const { start } = resolveHomeWindow(range, now, tz);
      const query = { userId, datetime: { $gte: start, $lt: todayStart } };
      const [meals, proteins, fibers, waterLogs, activities, weights, doses] = await Promise.all([
        MealLogModel.exists(query),
        ProteinLogModel.exists(query),
        FiberLogModel.exists(query),
        WaterLogModel.exists(query),
        ActivityLogModel.exists(query),
        WeightLogModel.exists(query),
        DoseLogModel.exists(query),
      ]);
      availability[range] = Boolean(meals || proteins || fibers || waterLogs || activities || weights || doses);
    }),
  );

  return availability;
}

async function getLatestWeight(userId: string) {
  const latestWeight = await WeightLogModel.findOne({ userId }).sort({ datetime: -1 });
  return latestWeight ? serializeWithSchema(weightLogResponseSchema, latestWeight) : null;
}

async function getStreak(userId: string, now: Date) {
  const since = addUtcDays(startOfUtcDay(now), -90);
  const [doses, meals, proteins, waterLogs, activities, weights] = await Promise.all([
    DoseLogModel.find({ userId, datetime: { $gte: since } }).select('datetime'),
    MealLogModel.find({ userId, datetime: { $gte: since } }).select('datetime'),
    ProteinLogModel.find({ userId, datetime: { $gte: since } }).select('datetime'),
    WaterLogModel.find({ userId, datetime: { $gte: since } }).select('datetime'),
    ActivityLogModel.find({ userId, datetime: { $gte: since } }).select('datetime'),
    WeightLogModel.find({ userId, datetime: { $gte: since } }).select('datetime'),
  ]);
  const logs = [...doses, ...meals, ...proteins, ...waterLogs, ...activities, ...weights].map(
    (log) => ({ datetime: log.datetime }),
  );

  return consecutiveActivityStreak(logs, now);
}

/**
 * Soonest next dose across ALL active schedules — modelled or not.
 *
 * This used to read medicationLevels, which silently made scheduling a
 * property of the pharmacokinetic model: getMedicationLevels skips compounds
 * with no half-life, so a custom medication produced no countdown and no
 * dose_due reminder (dose_due arms off home.nextDose). Level data is still
 * absent for those compounds — no curve is resurrected here, only timing.
 */
function soonestNextDose(candidates: Awaited<ReturnType<typeof getNextDoseCandidates>>) {
  if (candidates.length === 0) return null;
  const next = [...candidates].sort(
    (left, right) => new Date(left.nextDoseAt).getTime() - new Date(right.nextDoseAt).getTime(),
  )[0]!;
  return {
    compoundId: next.compoundId,
    compoundName: next.compoundName,
    nextDoseAt: next.nextDoseAt,
    hoursUntilNextDose: next.hoursUntilNextDose,
  };
}

export async function getHome(
  userId: string,
  now = new Date(),
  rangeInput: unknown = 'today',
  options: { allowAIInsightProse?: boolean; tz?: unknown; includeUnmodeledCompounds?: boolean } = {},
) {
  const selectedRange = parseHomeRange(rangeInput);
  const tz = parseHomeTimezone(options.tz);
  const [
    profileResult,
    compoundsResult,
    levelsResult,
    totalsResult,
    todayTotalsResult,
    rangeAvailabilityResult,
    latestWeightResult,
    insightsResult,
    retentionResult,
    streakResult,
    nextDoseResult,
  ] = await Promise.allSettled([
    getProfile(userId),
    getActiveCompounds(userId, options.includeUnmodeledCompounds === true),
    getMedicationLevels(userId, now),
    getRangeTotals(userId, now, selectedRange, tz),
    getRangeTotals(userId, now, 'today', tz),
    getRangeAvailability(userId, now, tz),
    getLatestWeight(userId),
    getInsights(userId, now, { allowAIProse: options.allowAIInsightProse === true }),
    getWeeklyRetention(userId, now),
    getStreak(userId, now),
    getNextDoseCandidates(userId, now),
  ]);
  const sectionErrors: Record<string, string> = {};
  const results = {
    profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
    activeCompounds: compoundsResult.status === 'fulfilled' ? compoundsResult.value : [],
    medicationLevels: levelsResult.status === 'fulfilled' ? levelsResult.value : [],
    totals:
      totalsResult.status === 'fulfilled'
        ? totalsResult.value
        : {
            protein: 0,
            fiber: 0,
            calories: 0,
            waterOz: 0,
            dayCount: resolveHomeWindow(selectedRange, now, tz).dayCount,
            hasLog: false,
          },
    todayTotals:
      todayTotalsResult.status === 'fulfilled'
        ? todayTotalsResult.value
        : { protein: 0, fiber: 0, calories: 0, waterOz: 0, dayCount: 1, hasLog: false },
    rangeAvailability:
      rangeAvailabilityResult.status === 'fulfilled'
        ? rangeAvailabilityResult.value
        : { today: true, week: false, month: false, year: false },
    latestWeight: latestWeightResult.status === 'fulfilled' ? latestWeightResult.value : null,
    insights: insightsResult.status === 'fulfilled' ? insightsResult.value : [],
    weeklyRetention: retentionResult.status === 'fulfilled' ? retentionResult.value : null,
    streakDays: streakResult.status === 'fulfilled' ? streakResult.value : 0,
  };
  const namedResults = {
    profile: profileResult,
    activeCompounds: compoundsResult,
    medicationLevels: levelsResult,
    rangeTotals: totalsResult,
    todayTotals: todayTotalsResult,
    rangeAvailability: rangeAvailabilityResult,
    latestWeight: latestWeightResult,
    insights: insightsResult,
    weeklyRetention: retentionResult,
    streak: streakResult,
  };

  for (const [name, result] of Object.entries(namedResults)) {
    if (result.status === 'rejected') {
      sectionErrors[name] = errorMessage(result.reason);
    }
  }

  const loggedItems =
    (results.profile ? 1 : 0) +
    (results.activeCompounds.length > 0 ? 1 : 0) +
    (results.todayTotals.hasLog || results.latestWeight ? 1 : 0);

  return homeResponseSchema.parse({
    profile: results.profile,
    activeCompounds: results.activeCompounds,
    medicationLevels: results.medicationLevels,
    selectedRange,
    rangeTotals: {
      key: selectedRange,
      label: RANGE_LABEL[selectedRange],
      proteinGrams: results.totals.protein,
      fiberGrams: results.totals.fiber,
      calories: results.totals.calories,
      waterOz: results.totals.waterOz,
      dayCount: results.totals.dayCount,
      hasData: results.totals.hasLog,
      ...(results.totals.steps !== undefined
        ? { steps: results.totals.steps, workoutMinutes: results.totals.workoutMinutes }
        : {}),
    },
    rangeAvailability: results.rangeAvailability,
    // TODAY's totals, from the 'today' window computed above — NOT
    // results.totals, which is the SELECTED range. These four feed
    // todayStat() on the client, whose whole job is "today's number against
    // today's target, whatever range Home is showing", plus the widget
    // preview and the report export. Wired to the range totals, switching
    // Home to Monthly made the Protein screen read a month of grams against
    // a daily target — the exact claim todayStat's comment says is
    // impossible. rangeTotals below is where the range's numbers belong.
    todayProteinGrams: results.todayTotals.protein,
    todayFiberGrams: results.todayTotals.fiber,
    todayCalories: results.todayTotals.calories,
    todayWaterOz: results.todayTotals.waterOz,
    streakDays: results.streakDays,
    setupProgress: {
      loggedItems,
      required: 3,
      unlocked: loggedItems >= 3,
    },
    nextDose: soonestNextDose(
      nextDoseResult.status === 'fulfilled' ? nextDoseResult.value : [],
    ),
    latestWeight: results.latestWeight,
    insights: results.insights,
    weeklyRetention: results.weeklyRetention,
    sectionErrors,
  });
}
