import { addUtcDays, startOfUtcDay, toDateOnly } from './dates';
import { addDaysDateOnly, dateOnlyInTz, isValidTimeZone } from './timezone';

/**
 * Consecutive days, ending today, on which the user logged something.
 *
 * BUCKETED IN THE USER'S DAY. This was UTC-only while every total beside it on
 * Home is measured over the user's local day — so for anyone west of UTC the
 * streak collapsed to 0 every evening: after 5pm Pacific the UTC date has
 * already advanced, "today" holds no logs yet, and the walk-back terminates
 * immediately. The rings on the same screen still showed the day's entries.
 *
 * With no usable zone it falls back to the previous UTC behaviour, so a caller
 * that cannot supply one is no worse off than before.
 */
export function consecutiveActivityStreak(
  logs: Array<{ datetime: string | Date }>,
  now = new Date(),
  timeZone?: string | null,
): number {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : null;

  const dayOf = (date: Date): string =>
    zone ? dateOnlyInTz(date, zone) : toDateOnly(startOfUtcDay(date));

  const activeDays = new Set(
    logs
      .map((log) => new Date(log.datetime))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map(dayOf),
  );

  if (zone) {
    // Date-only arithmetic: no instant is constructed, so a DST transition
    // cannot add or drop a day from the run.
    let cursor = dateOnlyInTz(now, zone);
    let streak = 0;
    while (activeDays.has(cursor)) {
      streak += 1;
      cursor = addDaysDateOnly(cursor, -1);
    }
    return streak;
  }

  let cursor = startOfUtcDay(now);
  let streak = 0;
  while (activeDays.has(toDateOnly(cursor))) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }
  return streak;
}
