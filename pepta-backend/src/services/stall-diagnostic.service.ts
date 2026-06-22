import { stallDiagnosticResponseSchema, type StallDiagnosticInput } from '@pepta/shared';
import { addUtcDays, startOfUtcDay } from '../lib/dates';
import { detectStall } from '../lib/insight-detectors';
import { ActivityLogModel, DoseLogModel, MealLogModel, ProteinLogModel, WeightLogModel } from '../models';

export async function getStallDiagnostic(
  userId: string,
  input: StallDiagnosticInput,
  now = new Date(),
) {
  const since = addUtcDays(startOfUtcDay(now), -input.lookbackDays);
  const [weights, meals, proteins, activities, doses] = await Promise.all([
    WeightLogModel.find({ userId, datetime: { $gte: since } }).sort({ datetime: 1 }),
    MealLogModel.find({ userId, datetime: { $gte: since } }),
    ProteinLogModel.find({ userId, datetime: { $gte: since } }),
    ActivityLogModel.find({ userId, datetime: { $gte: since } }),
    DoseLogModel.find({ userId, datetime: { $gte: since } }),
  ]);
  const signal = detectStall(
    weights.map((weight) => ({
      value: weight.value,
      datetime: weight.datetime.toISOString(),
    })),
  );
  const deterministicReasons: string[] = [];
  const averageCalories =
    meals.reduce((sum, meal) => sum + meal.calories, 0) / Math.max(1, input.lookbackDays);
  const averageProtein =
    (meals.reduce((sum, meal) => sum + meal.protein, 0) +
      proteins.reduce((sum, protein) => sum + protein.grams, 0)) /
    Math.max(1, input.lookbackDays);
  const resistanceSessions = activities.filter((activity) => activity.resistanceTraining).length;

  if (averageCalories > 0) {
    deterministicReasons.push(`Average logged calories: ${Math.round(averageCalories)}/day`);
  }

  if (averageProtein > 0) {
    deterministicReasons.push(`Average logged protein: ${Math.round(averageProtein)}g/day`);
  }

  if (resistanceSessions < 2) {
    deterministicReasons.push('Resistance training volume is light in this lookback window.');
  }

  if (doses.length === 0) {
    deterministicReasons.push('No recent dose logs are available for cycle-timing context.');
  }

  return stallDiagnosticResponseSchema.parse({
    stalled: signal.active,
    daysWeightFlat: signal.daysWeightFlat,
    deterministicReasons,
    explanation: signal.active
      ? 'Weight has been effectively flat in the lookback window.'
      : 'The available weight trend does not meet the stall threshold.',
    suggestedFix:
      deterministicReasons.length > 0
        ? 'Tighten one measurable lever this week: protein, training, logging consistency, or dose timing.'
        : 'Keep logging weight and meals for a clearer diagnostic window.',
    engineVersion: 'stall-v1',
    copyVersion: null,
  });
}
