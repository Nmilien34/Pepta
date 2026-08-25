import { weeklyRetentionResponseSchema } from '@pepta/shared';
import { computeMuscleRetention } from '../lib/muscle-retention';
import { poundsFromWeight } from '../lib/nutrition';
import { utcWeekRange } from '../lib/week';
import {
  ActivityLogModel,
  MealLogModel,
  ProteinLogModel,
  UserProfileModel,
  WeeklyRetentionModel,
  WeightLogModel,
} from '../models';
import { NotFoundError } from '../lib/errors';

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fallbackVerdict(verdict: string): string {
  if (verdict === 'protected') {
    return 'Protein, training, and pace are lining up well for muscle retention this week.';
  }

  if (verdict === 'steady') {
    return 'This week is mostly on track, with one or two retention levers worth tightening.';
  }

  if (verdict === 'watch') {
    return 'Muscle retention needs attention this week. Protein consistency or pace is slipping.';
  }

  return 'This week has a higher muscle-retention risk. Prioritize protein and resistance work.';
}

export async function getWeeklyRetention(userId: string, now = new Date()) {
  const profile = await UserProfileModel.findOne({ userId });

  if (!profile) {
    throw new NotFoundError('Profile not found');
  }

  const range = utcWeekRange(now);
  const [mealLogs, proteinLogs, activityLogs, currentWeight, previousWeight] = await Promise.all([
    MealLogModel.find({
      userId,
      datetime: { $gte: range.start, $lt: range.end },
    }),
    ProteinLogModel.find({
      userId,
      datetime: { $gte: range.start, $lt: range.end },
    }),
    ActivityLogModel.find({
      userId,
      datetime: { $gte: range.start, $lt: range.end },
      resistanceTraining: true,
    }),
    WeightLogModel.findOne({
      userId,
      datetime: { $gte: range.start, $lt: range.end },
    }).sort({ datetime: -1 }),
    WeightLogModel.findOne({
      userId,
      datetime: { $lt: range.start },
    }).sort({ datetime: -1 }),
  ]);

  const proteinByDay = new Map<string, number>();

  for (const meal of mealLogs) {
    const key = dateKey(meal.datetime);
    proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + meal.protein);
  }

  for (const proteinLog of proteinLogs) {
    const key = dateKey(proteinLog.datetime);
    proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + proteinLog.grams);
  }

  // SCALE TO THE DAYS THAT HAVE HAPPENED (2026-08-25). utcWeekRange returns the
  // Monday-anchored week CONTAINING now, so this query is week-to-DATE: on a
  // Monday evening it can only hold one day of logs. Dividing by a hard 7 (and
  // passing daysInWindow: 7) scored a user who had hit their target perfectly
  // at one seventh of it, and the fold — protein at 0.45, training at 0.35 —
  // dropped the total into verdictForScore's "at_risk" band, telling someone
  // on target that "this week has a higher muscle-retention risk". Every
  // Monday and Tuesday, for everyone. meal-scan.service.ts already scales its
  // identical Monday-anchored window by elapsedWeekDays; this is that fix.
  const elapsedDays = Math.min(
    7,
    Math.max(
      1,
      Math.floor((now.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    ),
  );
  const totalProtein = [...proteinByDay.values()].reduce((sum, grams) => sum + grams, 0);
  const proteinActualGrams = totalProtein / elapsedDays;
  const proteinDaysHit = [...proteinByDay.values()].filter(
    (grams) => grams >= profile.dailyProteinTargetGrams,
  ).length;
  const previousWeightLb = previousWeight
    ? poundsFromWeight(previousWeight.value, previousWeight.unit)
    : null;
  const currentWeightLb = currentWeight ? poundsFromWeight(currentWeight.value, currentWeight.unit) : null;
  const weeklyWeightLossPercent =
    previousWeightLb && currentWeightLb && previousWeightLb > currentWeightLb
      ? ((previousWeightLb - currentWeightLb) / previousWeightLb) * 100
      : 0;

  const result = computeMuscleRetention({
    proteinActualGrams,
    proteinTargetGrams: profile.dailyProteinTargetGrams,
    proteinDaysHit,
    daysInWindow: elapsedDays,
    resistanceSessions: activityLogs.length,
    // Scaled for the same reason: 3 sessions is a WEEK's target, and demanding
    // all three by Monday scored every user 0 on a third of the verdict.
    // Never below 1, or a fresh week would divide by zero.
    resistanceSessionTarget: Math.max(1, Math.round((3 * elapsedDays) / 7)),
    weeklyWeightLossPercent,
  });

  const cached = await WeeklyRetentionModel.findOneAndUpdate(
    { userId, weekOf: range.weekOf },
    {
      $set: {
        userId,
        weekOf: range.weekOf,
        score: result.score,
        verdict: result.verdict,
        verdictProse: fallbackVerdict(result.verdict),
        drivers: result.drivers,
        penaltyApplied: result.penaltyApplied,
        engineVersion: result.engineVersion,
        copyVersion: null,
        generatedAt: new Date(),
      },
    },
    { new: true, upsert: true, runValidators: true },
  );

  return weeklyRetentionResponseSchema.parse({
    weekOf: cached.weekOf,
    score: cached.score,
    verdict: cached.verdict,
    verdictProse: cached.verdictProse,
    drivers: cached.drivers.map((driver) => ({
      type: driver.type,
      label: driver.label,
      score: driver.score,
      contribution: driver.contribution,
    })),
    penaltyApplied: cached.penaltyApplied,
    engineVersion: cached.engineVersion,
    copyVersion: cached.copyVersion,
  });
}
