import { trackResponseSchema, type LogListQuery } from '@pepta/shared';
import {
  activityLogService,
  doseLogService,
  fiberLogService,
  mealLogService,
  measurementService,
  proteinLogService,
  sideEffectLogService,
  waterLogService,
  weightLogService,
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
    // Weight joins Track for the activity feed. Home only ever carried
    // latestWeight — a single value, not a history — so a feed of "everything
    // you logged" could not include the thing users log most after doses.
    weightLogService.list(userId, query),
    // Fibre is logged from the Home stepper like water and protein; without it
    // here the user could create rows they could never see or remove.
    fiberLogService.list(userId, query),
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
    'weightLogs',
    'fiberLogs',
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
    weightLogs: entries[7]!.status === 'fulfilled' ? entries[7]!.value : [],
    fiberLogs: entries[8]!.status === 'fulfilled' ? entries[8]!.value : [],
    sectionErrors,
  });
}
