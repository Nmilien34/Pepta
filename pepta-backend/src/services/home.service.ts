import {
  compoundResponseSchema,
  homeResponseSchema,
  userProfileResponseSchema,
  weightLogResponseSchema,
} from '@pepta/shared';
import { addUtcDays, startOfUtcDay } from '../lib/dates';
import { consecutiveActivityStreak } from '../lib/streak';
import {
  ActivityLogModel,
  CompoundModel,
  DoseLogModel,
  MealLogModel,
  ProteinLogModel,
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

async function getProfile(userId: string) {
  const profile = await UserProfileModel.findOne({ userId });
  return profile ? serializeWithSchema(userProfileResponseSchema, profile) : null;
}

async function getActiveCompounds(userId: string) {
  const compounds = await CompoundModel.find({ userId, status: 'active' }).sort({ createdAt: -1 });
  return compounds.map((compound) => serializeWithSchema(compoundResponseSchema, compound));
}

async function getTodayTotals(userId: string, now: Date) {
  const start = startOfUtcDay(now);
  const end = addUtcDays(start, 1);
  const [meals, proteins, waterLogs] = await Promise.all([
    MealLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    ProteinLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
    WaterLogModel.find({ userId, datetime: { $gte: start, $lt: end } }),
  ]);

  return {
    protein:
      meals.reduce((sum, meal) => sum + meal.protein, 0) +
      proteins.reduce((sum, protein) => sum + protein.grams, 0),
    fiber: meals.reduce((sum, meal) => sum + (meal.fiber ?? 0), 0),
    calories: meals.reduce((sum, meal) => sum + meal.calories, 0),
    waterOz: waterLogs.reduce((sum, water) => sum + water.amountOz, 0),
    hasLog: meals.length + proteins.length + waterLogs.length > 0,
  };
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

export async function getHome(userId: string, now = new Date()) {
  const [
    profileResult,
    compoundsResult,
    levelsResult,
    totalsResult,
    latestWeightResult,
    insightsResult,
    retentionResult,
    streakResult,
  ] = await Promise.allSettled([
    getProfile(userId),
    getActiveCompounds(userId),
    getMedicationLevels(userId, now),
    getTodayTotals(userId, now),
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
        : { protein: 0, fiber: 0, calories: 0, waterOz: 0, hasLog: false },
    latestWeight: latestWeightResult.status === 'fulfilled' ? latestWeightResult.value : null,
    insights: insightsResult.status === 'fulfilled' ? insightsResult.value : [],
    weeklyRetention: retentionResult.status === 'fulfilled' ? retentionResult.value : null,
    streakDays: streakResult.status === 'fulfilled' ? streakResult.value : 0,
  };
  const namedResults = {
    profile: profileResult,
    activeCompounds: compoundsResult,
    medicationLevels: levelsResult,
    todayTotals: totalsResult,
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
    (results.totals.hasLog || results.latestWeight ? 1 : 0);

  return homeResponseSchema.parse({
    profile: results.profile,
    activeCompounds: results.activeCompounds,
    medicationLevels: results.medicationLevels,
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
