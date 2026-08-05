// Home range windows — the DECLARED semantics (Nick, 2026-08-05): every range
// is a ROLLING window ending today, cut at the USER'S local midnight.
// "Monthly" means the past 30 days from ask (Jul 7 → Aug 5, not "since Aug 1"),
// "Yearly" the past 365, "Weekly" the past 7 — always including today.
//
// The local-day cut requires knowing the user's zone, which shipped clients
// never send — and homeRangeTotalsSchema is STRICT on those builds, so the
// response shape for them must not change either. The `tz` query param is
// therefore the mode switch: present-and-valid → rolling/local windows (and
// the service adds activity totals); absent → the legacy UTC calendar windows
// (calendar month/year/Sunday-week to date), byte-identical to before.

import type { HomeRangeKey } from '@pepta/shared';
import { addUtcDays, startOfUtcDay, startOfUtcWeek } from './dates';
import { addDaysDateOnly, dateOnlyInTz, isValidTimeZone, zonedTimeToUtc } from './timezone';

export const ROLLING_RANGE_DAYS: Record<HomeRangeKey, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
};

/** Valid IANA zone from an untrusted query param, else null (= legacy mode). */
export function parseHomeTimezone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const timeZone = input.trim();
  if (timeZone.length === 0 || timeZone.length > 64) return null;
  return isValidTimeZone(timeZone) ? timeZone : null;
}

export interface HomeWindow {
  start: Date;
  /** Exclusive. */
  end: Date;
  /** Days the range spans — the multiplier for daily targets. */
  dayCount: number;
}

function rollingWindow(range: HomeRangeKey, now: Date, timeZone: string): HomeWindow {
  const today = dateOnlyInTz(now, timeZone);
  const days = ROLLING_RANGE_DAYS[range];
  return {
    // zonedTimeToUtc per boundary keeps DST-crossing windows honest: a 30-day
    // window spanning a spring-forward is still 30 local calendar days.
    start: zonedTimeToUtc(addDaysDateOnly(today, 1 - days), '00:00', timeZone),
    end: zonedTimeToUtc(addDaysDateOnly(today, 1), '00:00', timeZone),
    dayCount: days,
  };
}

function legacyWindow(range: HomeRangeKey, now: Date): HomeWindow {
  let start: Date;
  let end: Date;
  if (range === 'week') {
    start = startOfUtcWeek(now);
    end = addUtcDays(start, 7);
  } else if (range === 'month') {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  } else if (range === 'year') {
    start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  } else {
    start = startOfUtcDay(now);
    end = addUtcDays(start, 1);
  }

  const tomorrowStart = addUtcDays(startOfUtcDay(now), 1);
  const effectiveEnd = new Date(Math.min(end.getTime(), tomorrowStart.getTime()));
  const ms = Math.max(effectiveEnd.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
  return { start, end, dayCount: Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000))) };
}

export function resolveHomeWindow(
  range: HomeRangeKey,
  now: Date,
  timeZone: string | null,
): HomeWindow {
  return timeZone ? rollingWindow(range, now, timeZone) : legacyWindow(range, now);
}
