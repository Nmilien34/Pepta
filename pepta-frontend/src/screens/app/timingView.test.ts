import { describe, expect, it } from 'vitest';
import type { ScheduleResponse } from '@pepta/shared';
import {
  defaultTimesFor,
  formatTimeOfDay,
  formatTimesOfDay,
  primarySchedule,
  stepTime,
  timingLabel,
} from './timingView';

const schedule = (over: Partial<ScheduleResponse>): ScheduleResponse =>
  ({
    id: 's1',
    userId: 'u1',
    compoundId: 'c1',
    frequency: 'daily',
    daysOfWeek: [],
    active: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }) as ScheduleResponse;

describe('formatTimeOfDay', () => {
  it('renders 24h wall times as 12h labels', () => {
    expect(formatTimeOfDay('00:00')).toBe('12:00 AM');
    expect(formatTimeOfDay('08:05')).toBe('8:05 AM');
    expect(formatTimeOfDay('12:30')).toBe('12:30 PM');
    expect(formatTimeOfDay('21:05')).toBe('9:05 PM');
  });

  it('joins split-dose times sorted', () => {
    expect(formatTimesOfDay(['20:00', '08:00'])).toBe('8:00 AM & 8:00 PM');
  });
});

describe('stepTime', () => {
  it('steps by minutes and wraps midnight both ways', () => {
    expect(stepTime('08:00', 30)).toBe('08:30');
    expect(stepTime('23:45', 30)).toBe('00:15');
    expect(stepTime('00:15', -30)).toBe('23:45');
    expect(stepTime('08:00', 720)).toBe('20:00');
  });
});

describe('defaultTimesFor', () => {
  it('prefers saved protocol times, sorted', () => {
    expect(defaultTimesFor(schedule({ timesOfDay: ['20:00', '08:00'] }))).toEqual([
      '08:00',
      '20:00',
    ]);
  });

  it('falls back to the nextDoseAt wall time, else 8 AM', () => {
    const seeded = defaultTimesFor(schedule({ nextDoseAt: '2026-06-27T13:00:00.000Z' }));
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(defaultTimesFor(null)).toEqual(['08:00']);
  });
});

describe('primarySchedule + timingLabel', () => {
  it('picks the first active schedule', () => {
    const rows = [schedule({ id: 'off', active: false }), schedule({ id: 'on' })];
    expect(primarySchedule(rows)?.id).toBe('on');
    expect(primarySchedule(null)).toBeNull();
  });

  it('labels contexts, hiding the anytime default', () => {
    expect(timingLabel('before_bed')).toBe('Before bed');
    expect(timingLabel('fasted')).toBe('Fasted');
    expect(timingLabel('anytime')).toBeNull();
    expect(timingLabel(undefined)).toBeNull();
  });
});
