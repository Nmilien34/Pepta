import { describe, expect, it } from 'vitest';
import { parseHomeTimezone, resolveHomeWindow } from '../../lib/homeRange';

describe('parseHomeTimezone', () => {
  it('accepts a valid IANA zone', () => {
    expect(parseHomeTimezone('America/New_York')).toBe('America/New_York');
    expect(parseHomeTimezone(' Europe/Paris ')).toBe('Europe/Paris');
  });

  it('rejects garbage, non-strings, and oversized input', () => {
    expect(parseHomeTimezone('Not/AZone')).toBeNull();
    expect(parseHomeTimezone('')).toBeNull();
    expect(parseHomeTimezone(undefined)).toBeNull();
    expect(parseHomeTimezone(42)).toBeNull();
    expect(parseHomeTimezone(['America/New_York'])).toBeNull();
    expect(parseHomeTimezone('A'.repeat(65))).toBeNull();
  });
});

describe('resolveHomeWindow — rolling tz mode', () => {
  // 2026-08-05T02:00:00Z is still Aug 4, 10 PM in New York (UTC-4).
  const lateEveningEastern = new Date('2026-08-05T02:00:00.000Z');

  it("cuts today at the user's local midnight, not UTC midnight", () => {
    const { start, end, dayCount } = resolveHomeWindow(
      'today',
      lateEveningEastern,
      'America/New_York',
    );
    // Local day is Aug 4: 00:00 EDT = 04:00Z.
    expect(start.toISOString()).toBe('2026-08-04T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-05T04:00:00.000Z');
    expect(dayCount).toBe(1);
    // The 9 PM EDT log (01:00Z) belongs to the user's today — the exact case
    // the UTC cut got wrong (it flipped the day at 8 PM Eastern).
    const ninePmLog = new Date('2026-08-05T01:00:00.000Z');
    expect(ninePmLog >= start && ninePmLog < end).toBe(true);
  });

  it('month is the past 30 days from ask, not the calendar month', () => {
    const noon = new Date('2026-08-05T16:00:00.000Z'); // Aug 5, noon EDT
    const { start, end, dayCount } = resolveHomeWindow('month', noon, 'America/New_York');
    // 30 local days ending today: Jul 7 00:00 EDT → Aug 6 00:00 EDT.
    expect(start.toISOString()).toBe('2026-07-07T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-06T04:00:00.000Z');
    expect(dayCount).toBe(30);
    // A July 20 log is inside — under the old since-Aug-1 window it vanished.
    const midJuly = new Date('2026-07-20T15:00:00.000Z');
    expect(midJuly >= start && midJuly < end).toBe(true);
  });

  it('week and year roll 7 and 365 days', () => {
    const noon = new Date('2026-08-05T16:00:00.000Z');
    const week = resolveHomeWindow('week', noon, 'America/New_York');
    expect(week.start.toISOString()).toBe('2026-07-30T04:00:00.000Z');
    expect(week.dayCount).toBe(7);
    const year = resolveHomeWindow('year', noon, 'America/New_York');
    expect(year.start.toISOString()).toBe('2025-08-06T04:00:00.000Z');
    expect(year.dayCount).toBe(365);
  });

  it('keeps whole local days across a DST boundary', () => {
    // Nov 1 2026: US fall-back. A 30-day window ending Nov 20 spans it.
    const { start, end } = resolveHomeWindow(
      'month',
      new Date('2026-11-20T17:00:00.000Z'),
      'America/New_York',
    );
    // Oct 22 00:00 EDT (UTC-4) → Nov 21 00:00 EST (UTC-5): both true local
    // midnights even though the raw UTC gap is 30 days + 1 hour.
    expect(start.toISOString()).toBe('2026-10-22T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-21T05:00:00.000Z');
  });
});

describe('resolveHomeWindow — legacy mode (no tz)', () => {
  // Shipped clients never send tz; their windows must stay byte-identical:
  // UTC day / Monday-anchored UTC week / calendar month + year to date.
  const now = new Date('2026-08-05T16:00:00.000Z'); // a Wednesday

  it('today is the UTC day', () => {
    const { start, end, dayCount } = resolveHomeWindow('today', now, null);
    expect(start.toISOString()).toBe('2026-08-05T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-06T00:00:00.000Z');
    expect(dayCount).toBe(1);
  });

  it('month is the UTC calendar month with day count clamped to today', () => {
    const { start, end, dayCount } = resolveHomeWindow('month', now, null);
    expect(start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(dayCount).toBe(5);
  });

  it('year is the UTC calendar year with day count clamped to today', () => {
    const { start, dayCount } = resolveHomeWindow('year', now, null);
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(dayCount).toBe(217);
  });

  it('week starts on the UTC Monday', () => {
    const { start, dayCount } = resolveHomeWindow('week', now, null);
    expect(start.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(dayCount).toBe(3);
  });
});
