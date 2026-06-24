import {
  compoundResponseSchema,
  homeRangeKeySchema,
  homeResponseSchema,
  type HomeRangeKey,
  userProfileResponseSchema,
  weightLogResponseSchema,
} from '@pepta/shared';
import { addUtcDays, startOfUtcDay, startOfUtcWeek } from '../lib/dates';
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
import { getMedicationLevels } from './medication-level.service';
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

function utcMonthRange(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function utcYearRange(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  return { start, end };
}

function rangeBounds(range: HomeRangeKey, now: Date) {
  if (range === 'week') {
    const start = startOfUtcWeek(now);
    return { start, end: addUtcDays(start, 7) };
  }
  if (range === 'month') return utcMonthRange(now);
  if (range === 'year') return utcYearRange(now);
  const start = startOfUtcDay(now);
  return { start, end: addUtcDays(start, 1) };
}

function rangeDayCount(range: HomeRangeKey, now: Date) {
  const { start, end } = rangeBounds(range, now);
  const tomorrowStart = addUtcDays(startOfUtcDay(now), 1);
  const effectiveEnd = new Date(Math.min(end.getTime(), tomorrowStart.getTime()));
  const ms = Math.max(effectiveEnd.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

async function getProfile(userId: string) {
  const profile = await UserProfileModel.findOne({ userId });
  return profile ? serializeWithSchema(userProfileResponseSchema, profile) : null;
}

async function getActiveCompounds(userId: string) {
  const compounds = await CompoundModel.find({ userId, status: 'active' }).sort({ createdAt: -1 });
  return compounds.map((compound) => serializeWithSchema(compoundResponseSchema, compound));
}

async function getRangeTotals(userId: string, now: Date, range: HomeRangeKey) {
  const { start, end } = rangeBounds(range, now);
  const [meals, proteins, fibers, waterLogs] = await Promise.all([
    MealLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    ProteinLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    FiberLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    WaterLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
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
    dayCount: rangeDayCount(range, now),
    hasLog: meals.length + proteins.length + fibers.length + waterLogs.length > 0,
  };
}

async function getRangeAvailability(userId: string, now: Date) {
  const todayStart = startOfUtcDay(now);
  const availability: Record<HomeRangeKey, boolean> = {
    today: true,
    week: false,
    month: false,
    year: false,
  };

  await Promise.all(
    (['week', 'month', 'year'] as const).map(async (range) => {
      const { start } = rangeBounds(range, now);
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

function nextDoseFromLevels(levels: Awaited<ReturnType<typeof getMedicationLevels>>) {
  const candidates = levels.filter((level) => level.nextDoseAt && level.hoursUntilNextDose !== null);

  if (candidates.length === 0) {
    return null;
  }

  const next = candidates.sort(
    (left, right) =>
      new Date(left.nextDoseAt!).getTime() - new Date(right.nextDoseAt!).getTime(),
  )[0]!;

  return {
    compoundId: next.compoundId,
    compoundName: next.compoundName,
    nextDoseAt: next.nextDoseAt!,
    hoursUntilNextDose: next.hoursUntilNextDose!,
  };
}

export async function getHome(userId: string, now = new Date(), rangeInput: unknown = 'today') {
  const selectedRange = parseHomeRange(rangeInput);
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
  ] = await Promise.allSettled([
    getProfile(userId),
    getActiveCompounds(userId),
    getMedicationLevels(userId, now),
    getRangeTotals(userId, now, selectedRange),
    getRangeTotals(userId, now, 'today'),
    getRangeAvailability(userId, now),
    getLatestWeight(userId),
    getInsights(userId, now),
    getWeeklyRetention(userId, now),
    getStreak(userId, now),
  ]);
  const sectionErrors: Record<string, string> = {};
  const results = {
    profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
    activeCompounds: compoundsResult.status === 'fulfilled' ? compoundsResult.value : [],
    medicationLevels: levelsResult.status === 'fulfilled' ? levelsResult.value : [],
    totals:
      totalsResult.status === 'fulfilled'
        ? totalsResult.value
        : { protein: 0, fiber: 0, calories: 0, waterOz: 0, dayCount: rangeDayCount(selectedRange, now), hasLog: false },
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
    },
    rangeAvailability: results.rangeAvailability,
    todayProteinGrams: results.totals.protein,
    todayFiberGrams: results.totals.fiber,
    todayCalories: results.totals.calories,
    todayWaterOz: results.totals.waterOz,
    streakDays: results.streakDays,
    setupProgress: {
      loggedItems,
      required: 3,
      unlocked: loggedItems >= 3,
    },
    nextDose: nextDoseFromLevels(results.medicationLevels),
    latestWeight: results.latestWeight,
    insights: results.insights,
    weeklyRetention: results.weeklyRetention,
    sectionErrors,
  });
}
