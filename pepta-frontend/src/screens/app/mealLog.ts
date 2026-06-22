// Pure builders for the meal-log flow: map a scan/voice analysis (or a manual
// entry) into the typed MealLogInput the api expects. No RN imports → testable.

import type { MealLogInput, MealScanAnalysis } from '@pepta/shared';

export type MealSource = MealLogInput['source']; // 'scan' | 'voice' | 'search' | 'manual'

export function analysisToMealLog(
  analysis: MealScanAnalysis,
  source: MealSource,
  nowIso: string,
  photoS3Key?: string,
): MealLogInput {
  return {
    foodName: analysis.foodName,
    servingSize: analysis.servingSize,
    protein: analysis.protein,
    calories: analysis.calories,
    carbs: analysis.carbs,
    fat: analysis.fat,
    fiber: analysis.fiber,
    source,
    datetime: nowIso,
    ...(photoS3Key ? { photoS3Key } : {}),
  };
}

export interface ManualMeal {
  foodName: string;
  servingSize?: string;
  protein: number;
  calories: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

export function isManualMealValid(m: ManualMeal): boolean {
  return m.foodName.trim().length > 0 && m.protein >= 0 && m.calories >= 0 && (m.protein > 0 || m.calories > 0);
}

export function toManualMealLog(m: ManualMeal, nowIso: string): MealLogInput {
  return {
    foodName: m.foodName.trim(),
    ...(m.servingSize ? { servingSize: m.servingSize } : {}),
    protein: m.protein,
    calories: m.calories,
    ...(m.carbs != null ? { carbs: m.carbs } : {}),
    ...(m.fat != null ? { fat: m.fat } : {}),
    ...(m.fiber != null ? { fiber: m.fiber } : {}),
    source: 'manual',
    datetime: nowIso,
  };
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= 0.5) return 'Good estimate';
  return 'Rough estimate';
}

// Map an image picker asset's mime/uri to the scan endpoint's allowed enum.
export function pickImageMime(mimeType: string | null | undefined, uri: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  const value = (mimeType ?? '').toLowerCase();
  if (value.includes('png') || /\.png$/i.test(uri)) return 'image/png';
  if (value.includes('webp') || /\.webp$/i.test(uri)) return 'image/webp';
  return 'image/jpeg';
}
