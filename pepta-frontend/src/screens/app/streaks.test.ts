// Streak maths for the sheet behind the flame.
//
// The trap this file guards is agreement. The header's number comes from the
// SERVER (lib/streak.ts, bucketed in the user's timezone). The sheet's detail
// is computed here, on the device. If the two use different day rules they
// disagree in front of the user — and lib/streak.ts records exactly when that
// happens: bucketing in UTC collapsed the streak to zero every evening for
// anyone west of UTC, because the UTC date had already rolled into a day with
// no logs. These pin the client to the same local-day rule.

import { describe, expect, it } from 'vitest';
import {
  activeDays,
  bestStreak,
  currentStreak,
  habitStreaks,
  recentDays,
  shiftDay,
} from './streaks';

/** A log at 9pm local — the hour that UTC bucketing files under tomorrow. */
const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 21, 0, 0).toISOString();

describe('day bucketing matches the header, including in the evening', () => {
  it('files a 9pm log under the day it happened', () => {
    // The whole reason the server moved off UTC. If this drifts, the sheet
    // and the flame disagree every evening west of UTC.
    expect(activeDays([{ datetime: at(2026, 8, 21) }]).has('2026-08-21')).toBe(true);
  });

  it('ignores deleted logs', () => {
    // A deleted log is a correction, not history — same rule as the weight
    // chart and the log list.
    const days = activeDays([
      { datetime: at(2026, 8, 21), deletedAt: '2026-08-21T23:00:00.000Z' },
      { datetime: at(2026, 8, 20) },
    ]);

    expect(days.has('2026-08-21')).toBe(false);
    expect(days.has('2026-08-20')).toBe(true);
  });

  it('merges every kind of log into one run', () => {
    // The header counts "logged ANYTHING", so water on Monday and a meal on
    // Tuesday is a two-day streak, not two one-day streaks.
    const days = activeDays([{ datetime: at(2026, 8, 20) }], [{ datetime: at(2026, 8, 21) }]);

    expect(currentStreak(days, '2026-08-21')).toBe(2);
  });
});

describe('shiftDay does date-only arithmetic', () => {
  it('crosses a month boundary', () => {
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('survives a DST transition without gaining or losing a day', () => {
    // US DST ends 2026-11-01. Stepping through it with local instants can
    // repeat or skip a day, which would silently break or inflate a run.
    expect(shiftDay('2026-11-02', -1)).toBe('2026-11-01');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-03-08', -1)).toBe('2026-03-07');
  });
});

describe('currentStreak', () => {
  const days = (...list: string[]) => new Set(list);

  it('counts consecutive days ending today', () => {
    expect(currentStreak(days('2026-08-19', '2026-08-20', '2026-08-21'), '2026-08-21')).toBe(3);
  });

  it('stops at the first gap', () => {
    expect(
      currentStreak(days('2026-08-17', '2026-08-19', '2026-08-20', '2026-08-21'), '2026-08-21'),
    ).toBe(3);
  });

  it('keeps a run alive on a morning before today is logged', () => {
    // The deliberate difference from the server, and the reason the sheet
    // labels its state. At 9am, having logged 14 days straight and not yet
    // opened the app, "0" is a lie the user would resent. The server walks
    // back from today and stops; the sheet says 14, and says "Log today to
    // keep it".
    expect(currentStreak(days('2026-08-19', '2026-08-20'), '2026-08-21')).toBe(2);
  });

  it('is zero once the run is properly broken', () => {
    // Yesterday grace, not two days of it.
    expect(currentStreak(days('2026-08-18', '2026-08-19'), '2026-08-21')).toBe(0);
  });

  it('is zero with nothing logged at all', () => {
    expect(currentStreak(days(), '2026-08-21')).toBe(0);
  });
});

describe('bestStreak', () => {
  it('finds the longest run anywhere in the history', () => {
    const days = new Set([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', // 4
      '2026-08-10',
      '2026-08-20', '2026-08-21', // 2
    ]);

    expect(bestStreak(days)).toBe(4);
  });

  it('counts a run once, not once per day in it', () => {
    // Walking from every day rather than only from run starts is the obvious
    // way to write this and gets the answer right while doing O(n²) work; the
    // guard here is that the answer stays right.
    expect(bestStreak(new Set(['2026-08-19', '2026-08-20', '2026-08-21']))).toBe(3);
  });

  it('is never less than the current run', () => {
    const days = new Set(['2026-08-19', '2026-08-20', '2026-08-21']);

    expect(bestStreak(days)).toBeGreaterThanOrEqual(currentStreak(days, '2026-08-21'));
  });

  it('is zero with no history', () => {
    expect(bestStreak(new Set())).toBe(0);
  });
});

describe('recentDays', () => {
  it('returns the window oldest-first, ending today', () => {
    const grid = recentDays(new Set(['2026-08-21']), '2026-08-21', 5);

    expect(grid).toHaveLength(5);
    expect(grid[0]!.day).toBe('2026-08-17');
    expect(grid[4]!.day).toBe('2026-08-21');
    expect(grid[4]!.isToday).toBe(true);
    expect(grid[0]!.isToday).toBe(false);
  });

  it('lights only the days that have logs', () => {
    const grid = recentDays(new Set(['2026-08-20']), '2026-08-21', 3);

    expect(grid.map((d) => d.lit)).toEqual([false, true, false]);
  });
});

describe('habitStreaks', () => {
  it('reports each habit separately', () => {
    // The point of the breakdown: a long overall run carried by one habit
    // while another sits at zero is exactly what the user should see.
    const rows = habitStreaks(
      [
        {
          key: 'water',
          label: 'Water',
          logs: [
            { datetime: at(2026, 8, 19) },
            { datetime: at(2026, 8, 20) },
            { datetime: at(2026, 8, 21) },
          ],
        },
        { key: 'meals', label: 'Meals', logs: [{ datetime: at(2026, 8, 12) }] },
        { key: 'weight', label: 'Weight', logs: undefined },
      ],
      '2026-08-21',
    );

    expect(rows[0]).toMatchObject({ key: 'water', current: 3, loggedToday: true });
    expect(rows[1]).toMatchObject({ key: 'meals', current: 0, loggedToday: false });
    expect(rows[2]).toMatchObject({ key: 'weight', current: 0, best: 0, loggedToday: false });
  });

  it('keeps a habit missing an undefined log array from throwing', () => {
    // GET /track has shipped without fiberLogs before — see activityFeed.
    expect(() => habitStreaks([{ key: 'fiber', label: 'Fibre', logs: undefined }], '2026-08-21')).not.toThrow();
  });
});
