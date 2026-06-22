import {
  mealScanResponseSchema,
  type MealScanInput,
  type MealVoiceInput,
} from '@pepta/shared';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function analyzeMealScan(input: MealScanInput) {
  const scanId = input.idempotencyKey ?? `scan-${Date.now()}`;

  return mealScanResponseSchema.parse({
    scanId,
    foodName: 'Unconfirmed meal',
    servingSize: '1 serving',
    protein: 0,
    calories: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    confidence: 0.35,
    coachProse: 'Review and confirm the numbers before logging this meal.',
    engineVersion: 'meal-scan-fallback-v1',
  });
}

export async function parseVoiceMeal(input: MealVoiceInput) {
  const words = input.transcript.trim().split(/\s+/).length;
  const estimatedCalories = clamp(words * 12, 0, 1200);

  return mealScanResponseSchema.parse({
    scanId: `voice-${Date.now()}`,
    foodName: input.transcript.slice(0, 80),
    servingSize: 'voice estimate',
    protein: 0,
    calories: estimatedCalories,
    carbs: 0,
    fat: 0,
    fiber: 0,
    confidence: 0.25,
    coachProse: 'Voice parse is a draft. Confirm macros before saving.',
    engineVersion: 'voice-log-fallback-v1',
  });
}
