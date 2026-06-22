import {
  progressPhotoSchema,
  progressResponseSchema,
  weeklyRetentionResponseSchema,
  type LogListQuery,
} from '@pepta/shared';
import { ProgressPhotoModel, WeeklyRetentionModel } from '../models';
import { measurementService, weightLogService } from './logs.service';
import { serializeWithSchema } from './serializers';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Section failed';
}

function serializeWeeklyRetention(document: {
  weekOf: string;
  score: number;
  verdict: string;
  verdictProse: string;
  drivers: unknown[];
  penaltyApplied?: boolean;
  engineVersion: string;
  copyVersion: string | null;
}) {
  return weeklyRetentionResponseSchema.parse({
    weekOf: document.weekOf,
    score: document.score,
    verdict: document.verdict,
    verdictProse: document.verdictProse,
    drivers: document.drivers,
    penaltyApplied: document.penaltyApplied,
    engineVersion: document.engineVersion,
    copyVersion: document.copyVersion,
  });
}

export async function getProgress(userId: string, query?: LogListQuery) {
  const entries = await Promise.allSettled([
    weightLogService.list(userId, query),
    measurementService.list(userId, query),
    ProgressPhotoModel.find({ userId, status: { $ne: 'deleted' } }).sort({ captureDate: -1 }),
    WeeklyRetentionModel.find({ userId }).sort({ weekOf: -1 }).limit(12),
  ]);
  const sectionErrors: Record<string, string> = {};
  const names = ['weights', 'measurements', 'progressPhotos', 'weeklyRetention'] as const;

  for (const [index, result] of entries.entries()) {
    if (result.status === 'rejected') {
      sectionErrors[names[index]!] = errorMessage(result.reason);
    }
  }

  return progressResponseSchema.parse({
    weights: entries[0]!.status === 'fulfilled' ? entries[0]!.value : [],
    measurements: entries[1]!.status === 'fulfilled' ? entries[1]!.value : [],
    progressPhotos:
      entries[2]!.status === 'fulfilled'
        ? entries[2]!.value.map((photo) => serializeWithSchema(progressPhotoSchema, photo))
        : [],
    weeklyRetention:
      entries[3]!.status === 'fulfilled'
        ? entries[3]!.value.map((retention) => serializeWeeklyRetention(retention))
        : [],
    sectionErrors,
  });
}
