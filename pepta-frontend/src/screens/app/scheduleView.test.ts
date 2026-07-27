import { describe, expect, it } from 'vitest';
import type { CycleResponse, DoseLogResponse, ScheduleResponse } from '@pepta/shared';
import {
  activeCycleOf,
  cyclePillFor,
  isLastDoseOfCycle,
  patternOf,
  plannedDays,
  weekStrip,
} from './scheduleView';

const schedule = (over: Partial<ScheduleResponse>): ScheduleResponse =>
  ({
    id: 's1',
    userId: 'u1',
    compoundId: 'c1',
    frequency: 'weekly',
    daysOfWeek: [],
    active: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }) as ScheduleResponse;

const cycle = (over: Partial<CycleResponse>): CycleResponse =>
  ({
    id: 'cy1',
    userId: 'u1',
    name: 'My cycle',
    compoundIds: ['c1'],
    startDate: '2026-06-01',
    active: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }) as CycleResponse;

const dose = (datetime: string): DoseLogResponse =>
  ({
    id: `d-${datetime}`,
    userId: 'u1',
    compoundId: 'c1',
    amount: 5,
    unit: 'mg',
    datetime,
    deletedAt: null,
    createdAt: datetime,
    updatedAt: datetime,
  }) as DoseLogResponse;

// Noon UTC keeps the local calendar date stable across CI timezones.
const TODAY = new Date('2026-06-24T12:00:00.000Z');

describe('activeCycleOf + patternOf', () => {
  it('prefers the pattern-bearing active cycle and ignores soft-deleted rows', () => {
    const rows = [
      cycle({ id: 'dead', active: false, weeksOn: 4, weeksOff: 1 }),
      cycle({ id: 'plain' }),
      cycle({ id: 'patterned', weeksOn: 8, weeksOff: 2, repeats: true }),
    ];
    expect(activeCycleOf(rows)?.id).toBe('patterned');
    expect(patternOf(activeCycleOf(rows))).toEqual({
      startDate: '2026-06-01',
      weeksOn: 8,
      weeksOff: 2,
      repeats: true,
    });
  });

  it('returns null pattern for legacy cycles without on/off fields', () => {
    expect(patternOf(cycle({}))).toBeNull();
  });
});

describe('plannedDays', () => {
  it('weekly daysOfWeek uses the JS 0=Sunday convention (backend parity)', () => {
    const days = plannedDays([schedule({ daysOfWeek: [6] })], '2026-06-01', '2026-06-30');
    // Saturdays in June 2026: 6, 13, 20, 27.
    expect([...days].sort()).toEqual(['2026-06-06', '2026-06-13', '2026-06-20', '2026-06-27']);
  });

  it('custom frequency with daysOfWeek behaves like weekly (backend parity)', () => {
    const days = plannedDays(
      [schedule({ frequency: 'custom', daysOfWeek: [1], intervalDays: 10 })],
      '2026-06-01',
      '2026-06-15',
    );
    expect([...days].sort()).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
  });

  it('biweekly projects the nextDoseAt anchor both directions', () => {
    const days = plannedDays(
      [schedule({ frequency: 'biweekly', nextDoseAt: '2026-06-27T12:00:00.000Z' })],
      '2026-06-01',
      '2026-07-31',
    );
    expect([...days].sort()).toEqual(['2026-06-13', '2026-06-27', '2026-07-11', '2026-07-25']);
  });

  it('inactive schedules contribute nothing', () => {
    expect(plannedDays([schedule({ active: false, daysOfWeek: [6] })], '2026-06-01', '2026-06-30').size).toBe(0);
  });
});

describe('weekStrip', () => {
  const pattern = { startDate: '2026-06-01', weeksOn: 8, weeksOff: 2, repeats: true };

  it('is the design-lab strip: Mon 22 – Sun 28, today Wed 24, due Sat 27', () => {
    const strip = weekStrip(TODAY, [schedule({ daysOfWeek: [6] })], [], pattern);
    expect(strip.map((d) => d.dayOfMonth)).toEqual([22, 23, 24, 25, 26, 27, 28]);
    expect(strip.map((d) => d.letter).join('')).toBe('MTWTFSS');
    expect(strip[2]).toMatchObject({ isToday: true, date: '2026-06-24' });
    expect(strip.map((d) => d.mark)).toEqual([
      'none', 'none', 'none', 'none', 'none', 'due', 'none',
    ]);
  });

  it('logged beats due; past planned days show nothing', () => {
    // Wednesday's shot was logged; Monday was planned but missed (past → none).
    const strip = weekStrip(
      TODAY,
      [schedule({ daysOfWeek: [1, 3] })],
      [dose('2026-06-24T12:00:00.000Z')],
      pattern,
    );
    expect(strip[0]!.mark).toBe('none'); // Mon 22, past
    expect(strip[2]!.mark).toBe('logged'); // Wed 24
  });

  it('rest days suppress due dots', () => {
    // Aug 3 2026 sits inside the Jul 27 – Aug 9 rest window.
    const strip = weekStrip(
      new Date('2026-08-05T12:00:00.000Z'),
      [schedule({ frequency: 'daily' })],
      [],
      pattern,
    );
    expect(strip.every((d) => d.mark === 'none')).toBe(true);
  });
});

describe('cyclePillFor', () => {
  const pattern = { startDate: '2026-06-01', weeksOn: 8, weeksOff: 2, repeats: true };

  it('shows on-phase week and rest-phase week', () => {
    expect(cyclePillFor(pattern, TODAY)).toEqual({ label: 'Week 4/8', phase: 'on' });
    expect(cyclePillFor(pattern, new Date('2026-07-28T12:00:00.000Z'))).toEqual({
      label: 'Rest 1/2',
      phase: 'rest',
    });
    expect(cyclePillFor(null, TODAY)).toBeNull();
  });
});

describe('isLastDoseOfCycle', () => {
  const pattern = { startDate: '2026-06-01', weeksOn: 8, weeksOff: 2, repeats: true };

  it('true when the next planned dose after this one falls in rest', () => {
    // Saturday cadence: Jul 25 is the last on-phase Saturday (rest starts Jul 27).
    const schedules = [schedule({ daysOfWeek: [6] })];
    expect(isLastDoseOfCycle('2026-07-25T12:00:00.000Z', schedules, pattern)).toBe(true);
    expect(isLastDoseOfCycle('2026-07-18T12:00:00.000Z', schedules, pattern)).toBe(false);
    expect(isLastDoseOfCycle('2026-07-25T12:00:00.000Z', schedules, null)).toBe(false);
  });
});
