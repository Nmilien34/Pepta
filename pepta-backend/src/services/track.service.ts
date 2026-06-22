import { trackResponseSchema, type LogListQuery } from '@pepta/shared';
import {
  activityLogService,
  doseLogService,
  mealLogService,
  measurementService,
  proteinLogService,
  sideEffectLogService,
  waterLogService,
} from './logs.service';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Section failed';
}

export async function getTrack(userId: string, query?: LogListQuery) {
  const entries = await Promise.allSettled([
    doseLogService.list(userId, query),
    mealLogService.list(userId, query),
    waterLogService.list(userId, query),
    proteinLogService.list(userId, query),
    activityLogService.list(userId, query),
    sideEffectLogService.list(userId, query),
    measurementService.list(userId, query),
  ]);
  const sectionErrors: Record<string, string> = {};
  const names = [
    'doseLogs',
    'mealLogs',
    'waterLogs',
    'proteinLogs',
    'activityLogs',
    'sideEffectLogs',
    'measurements',
  ] as const;

  for (const [index, result] of entries.entries()) {
    if (result.status === 'rejected') {
      sectionErrors[names[index]!] = errorMessage(result.reason);
    }
  }

  return trackResponseSchema.parse({
    doseLogs: entries[0]!.status === 'fulfilled' ? entries[0]!.value : [],
    mealLogs: entries[1]!.status === 'fulfilled' ? entries[1]!.value : [],
    waterLogs: entries[2]!.status === 'fulfilled' ? entries[2]!.value : [],
    proteinLogs: entries[3]!.status === 'fulfilled' ? entries[3]!.value : [],
    activityLogs: entries[4]!.status === 'fulfilled' ? entries[4]!.value : [],
    sideEffectLogs: entries[5]!.status === 'fulfilled' ? entries[5]!.value : [],
    measurements: entries[6]!.status === 'fulfilled' ? entries[6]!.value : [],
    sectionErrors,
  });
}
