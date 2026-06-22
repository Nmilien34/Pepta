import { describe, expect, it } from 'vitest';
import {
  clampDay,
  clampToToday,
  daysInMonth,
  formatLongDate,
  numberRange,
  recentYears,
  toIsoDate,
} from './dateParts';

describe('dateParts', () => {
  it('counts days in a month, including leap February', () => {
    expect(daysInMonth(2026, 1)).toBe(28); // Feb 2026
    expect(daysInMonth(2024, 1)).toBe(29); // Feb 2024 (leap)
    expect(daysInMonth(2026, 3)).toBe(30); // Apr
  });

  it('clamps an overflowing day to the month length', () => {
    expect(clampDay({ year: 2026, month: 1, day: 31 })).toEqual({ year: 2026, month: 1, day: 28 });
  });

  it('pulls future dates back to today', () => {
    const now = new Date(2026, 5, 21); // Jun 21 2026
    expect(clampToToday({ year: 2026, month: 7, day: 1 }, now)).toEqual({ year: 2026, month: 5, day: 21 });
    expect(clampToToday({ year: 2026, month: 3, day: 4 }, now)).toEqual({ year: 2026, month: 3, day: 4 });
  });

  it('formats ISO and long dates', () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 4 })).toBe('2026-04-04');
    expect(formatLongDate({ year: 2026, month: 3, day: 4 })).toBe('Apr 4, 2026');
  });

  it('builds ranges', () => {
    expect(numberRange(2, 5)).toEqual([2, 3, 4, 5]);
    expect(recentYears(new Date(2026, 0, 1), 2)).toEqual([2024, 2025, 2026]);
  });
});
