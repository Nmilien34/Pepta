import { addUtcDays, startOfUtcDay, toDateOnly } from './dates';

export function consecutiveActivityStreak(
  logs: Array<{ datetime: string | Date }>,
  now = new Date(),
): number {
  const activeDays = new Set(
    logs
      .map((log) => new Date(log.datetime))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => toDateOnly(startOfUtcDay(date))),
  );

  let cursor = startOfUtcDay(now);
  let streak = 0;

  while (activeDays.has(toDateOnly(cursor))) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }

  return streak;
}
