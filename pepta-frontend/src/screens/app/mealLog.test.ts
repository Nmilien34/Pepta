import { describe, expect, it } from 'vitest';
import type { MealScanAnalysis } from '@pepta/shared';
import { analysisToMealLog, confidenceLabel, isManualMealValid, pickImageMime, toManualMealLog } from './mealLog';

const NOW = '2026-06-22T15:00:00.000Z';

const analysis: MealScanAnalysis = {
  foodName: 'Grilled chicken bowl',
  servingSize: '1 bowl',
  protein: 42,
  calories: 520,
  carbs: 45,
  fat: 14,
  fiber: 8,
  confidence: 0.86,
};

describe('analysisToMealLog', () => {
  it('maps analysis macros + source + datetime', () => {
    expect(analysisToMealLog(analysis, 'scan', NOW, 's3/key.jpg')).toEqual({
      foodName: 'Grilled chicken bowl',
      servingSize: '1 bowl',
      protein: 42,
      calories: 520,
      carbs: 45,
      fat: 14,
      fiber: 8,
      source: 'scan',
      datetime: NOW,
      photoS3Key: 's3/key.jpg',
    });
  });
  it('omits photoS3Key when absent', () => {
    expect(analysisToMealLog(analysis, 'voice', NOW)).not.toHaveProperty('photoS3Key');
  });
});

describe('manual meal', () => {
  it('validates name + at least one macro', () => {
    expect(isManualMealValid({ foodName: 'Eggs', protein: 12, calories: 140 })).toBe(true);
    expect(isManualMealValid({ foodName: '', protein: 12, calories: 140 })).toBe(false);
    expect(isManualMealValid({ foodName: 'Water', protein: 0, calories: 0 })).toBe(false);
  });
  it('builds a manual meal log, dropping empty optionals', () => {
    expect(toManualMealLog({ foodName: '  Eggs ', protein: 12, calories: 140 }, NOW)).toEqual({
      foodName: 'Eggs',
      protein: 12,
      calories: 140,
      source: 'manual',
      datetime: NOW,
    });
  });
});

describe('confidenceLabel + pickImageMime', () => {
  it('buckets confidence', () => {
    expect(confidenceLabel(0.9)).toBe('High confidence');
    expect(confidenceLabel(0.6)).toBe('Good estimate');
    expect(confidenceLabel(0.3)).toBe('Rough estimate');
  });
  it('maps mime/uri to the allowed enum', () => {
    expect(pickImageMime('image/png', 'x')).toBe('image/png');
    expect(pickImageMime(null, 'photo.webp')).toBe('image/webp');
    expect(pickImageMime(undefined, 'photo.heic')).toBe('image/jpeg');
  });
});
