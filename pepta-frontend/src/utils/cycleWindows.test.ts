import { describe, expect, it } from 'vitest';
import {
  cycleDayStatus,
  hasPattern,
  isRestDay,
  restWindows,
  type CyclePattern,
} from './cycleWindows';

// The design-lab story: 8 weeks on from Jun 1 2026 (Mon), rest Jul 27–Aug 9.
const P: CyclePattern = { startDate: '2026-06-01', weeksOn: 8, weeksOff: 2, repeats: true };

describe('cycleDayStatus', () => {
  it('maps the design-lab dates exactly', () => {
    // Wed Jun 24 = week 4 of on-phase
    expect(cycleDayStatus(P, '2026-06-24')).toMatchObject({
      phase: 'on',
      weekInPhase: 4,
      weeksInPhase: 8,
      phaseEnd: '2026-07-26',
      nextPhaseStart: '2026-07-27',
    });
    // Last on-day
    expect(cycleDayStatus(P, '2026-07-26').phase).toBe('on');
    // First rest day
    expect(cycleDayStatus(P, '2026-07-27')).toMatchObject({
      phase: 'rest',
      weekInPhase: 1,
      weeksInPhase: 2,
      phaseStart: '2026-07-27',
      phaseEnd: '2026-08-09',
      nextPhaseStart: '2026-08-10',
    });
    // Rest week 2
    expect(cycleDayStatus(P, '2026-08-05').weekInPhase).toBe(2);
    // Back on
    expect(cycleDayStatus(P, '2026-08-10')).toMatchObject({ phase: 'on', weekInPhase: 1 });
  });

  it('before the start date is upcoming', () => {
    expect(cycleDayStatus(P, '2026-05-20').phase).toBe('upcoming');
  });

  it('one-cycle-only ends after its single rest window', () => {
    const once: CyclePattern = { ...P, repeats: false };
    expect(cycleDayStatus(once, '2026-08-09').phase).toBe('rest');
    expect(cycleDayStatus(once, '2026-08-10').phase).toBe('done');
    expect(cycleDayStatus(once, '2027-01-01').phase).toBe('done');
  });
});

describe('isRestDay + restWindows', () => {
  it('flags exactly the rest stretch', () => {
    expect(isRestDay(P, '2026-07-26')).toBe(false);
    expect(isRestDay(P, '2026-07-27')).toBe(true);
    expect(isRestDay(P, '2026-08-09')).toBe(true);
    expect(isRestDay(P, '2026-08-10')).toBe(false);
  });

  it('returns the windows intersecting a month (the calendar band)', () => {
    expect(restWindows(P, '2026-07-01', '2026-07-31')).toEqual([
      { start: '2026-07-27', end: '2026-08-09' },
    ]);
    // A month with no rest
    expect(restWindows(P, '2026-06-01', '2026-06-30')).toEqual([]);
    // Repeating: the next period's rest appears too
    expect(restWindows(P, '2026-08-01', '2026-10-31')).toEqual([
      { start: '2026-07-27', end: '2026-08-09' },
      { start: '2026-10-05', end: '2026-10-18' },
    ]);
  });

  it('non-repeating patterns emit exactly one window ever', () => {
    const once: CyclePattern = { ...P, repeats: false };
    expect(restWindows(once, '2026-06-01', '2027-06-01')).toEqual([
      { start: '2026-07-27', end: '2026-08-09' },
    ]);
  });
});

describe('hasPattern', () => {
  it('accepts only complete patterns', () => {
    expect(hasPattern({ weeksOn: 8, weeksOff: 2, startDate: '2026-06-01' })).toBe(true);
    expect(hasPattern({ weeksOn: 8, startDate: '2026-06-01' })).toBe(false);
    expect(hasPattern({})).toBe(false);
  });
});
