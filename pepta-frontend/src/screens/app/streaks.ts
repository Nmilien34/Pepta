// Streaks, for the sheet behind the flame.
//
// The header already shows ONE number, computed on the server
// (consecutiveActivityStreak → home.streakDays). Everything here is the detail
// behind it, and the rule that governs this file is:
//
//   THE SHEET MUST NEVER CONTRADICT THE FLAME THAT OPENED IT.
//
// So the headline count is NOT recomputed here — the server's number is passed
// straight through. What this module adds is what the server does not send:
// the best run so far, which days are lit, and which individual habit is
// carrying or breaking the run.
//
// DAY BUCKETING IS THE WHOLE GAME. The server buckets in the user's timezone
// for a reason recorded in lib/streak.ts: doing it in UTC collapsed the streak
// to zero every evening for anyone west of UTC, because the UTC date had
// already rolled over into a day with no logs yet. The client is *in* the
// user's zone, so `localDay` (device-local, already used by the activity feed)
// is the matching rule. Any other bucketing here would make this sheet
// disagree with the header on exactly those evenings.

import { localDay } from './activityFeed';

export interface StreakLog {
  datetime: string;
  deletedAt?: string | null;
}

/** The distinct local days a set of logs covers, deleted rows excluded. */
export function activeDays(...groups: ReadonlyArray<readonly StreakLog[] | undefined>): Set<string> {
  const days = new Set<string>();
  for (const group of groups) {
    for (const log of group ?? []) {
      // A deleted log is a correction, not history — the same rule the log
      // list and the weight chart follow.
      if (log.deletedAt != null) continue;
      const day = localDay(log.datetime);
      if (day) days.add(day);
    }
  }
  return days;
}

/** Today's key in the device's zone — the same rule `localDay` applies. */
export function localToday(now = new Date()): string {
  return localDay(now.toISOString());
}

/** Step a `YYYY-MM-DD` key by whole days without constructing an instant. */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  // Date-only arithmetic through UTC noon: a DST transition cannot add or drop
  // a day from the run, which is the same guard lib/streak.ts uses.
  const at = new Date(Date.UTC(year, month - 1, date, 12));
  at.setUTCDate(at.getUTCDate() + delta);
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(
    at.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * Consecutive days ending today.
 *
 * A run that ends YESTERDAY still counts, because the day is not over: at
 * 9am, having logged every day for a fortnight and not yet opened the app,
 * the honest answer is 14 and not 0. The server's own walk-back starts at
 * today and stops immediately, which is why the header can read 0 on a
 * morning — this is the one place the two can differ, and it is deliberate.
 * The sheet labels it so ("Logged today" vs "Log today to keep it").
 */
export function currentStreak(days: ReadonlySet<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  if (!days.has(cursor)) return 0;
  let run = 0;
  while (days.has(cursor)) {
    run += 1;
    cursor = shiftDay(cursor, -1);
  }
  return run;
}

/** The longest run anywhere in the history. */
export function bestStreak(days: ReadonlySet<string>): number {
  let best = 0;
  for (const day of days) {
    // Only count from the START of a run, so each run is walked once rather
    // than once per day in it.
    if (days.has(shiftDay(day, -1))) continue;
    let run = 0;
    let cursor = day;
    while (days.has(cursor)) {
      run += 1;
      cursor = shiftDay(cursor, 1);
    }
    if (run > best) best = run;
  }
  return best;
}

export interface StreakDay {
  day: string;
  lit: boolean;
  isToday: boolean;
}

/** The last `count` days, oldest first — the run made visible. */
export function recentDays(
  days: ReadonlySet<string>,
  today: string,
  count: number,
): StreakDay[] {
  const out: StreakDay[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = shiftDay(today, -i);
    out.push({ day, lit: days.has(day), isToday: i === 0 });
  }
  return out;
}

export interface HabitStreak {
  key: string;
  label: string;
  current: number;
  best: number;
  loggedToday: boolean;
}

/**
 * Per-habit runs.
 *
 * The single header number answers "am I showing up". These answer "at what",
 * which is the question a person actually acts on: a 12-day overall streak
 * carried entirely by water, with meals at 0, is worth seeing.
 */
export function habitStreaks(
  habits: ReadonlyArray<{ key: string; label: string; logs: readonly StreakLog[] | undefined }>,
  today: string,
): HabitStreak[] {
  return habits.map((habit) => {
    const days = activeDays(habit.logs);
    return {
      key: habit.key,
      label: habit.label,
      current: currentStreak(days, today),
      best: bestStreak(days),
      loggedToday: days.has(today),
    };
  });
}
