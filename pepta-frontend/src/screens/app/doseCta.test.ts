import { describe, expect, it } from 'vitest';
import type { CycleResponse, DoseLogResponse, ScheduleResponse } from '@pepta/shared';
import { doseCtaState } from './doseCta';

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

const dose = (
  datetime: string,
  over: Partial<DoseLogResponse> = {},
): DoseLogResponse =>
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
    ...over,
  }) as DoseLogResponse;

/** Local-noon Date, so no test can be flipped by a timezone offset. */
const day = (dateOnly: string) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0);
};
const at = (dateOnly: string, hour = 9) => {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, 0, 0).toISOString();
};

// Saturdays in Aug 2026: 1, 8, 15, 22, 29. Aug 22 2026 is a Saturday.
const SATURDAYS = schedule({ frequency: 'weekly', daysOfWeek: [6] });
const DAILY = schedule({ frequency: 'daily' });

describe('the first dose', () => {
  it('shows the beating button when nothing has ever been logged', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [],
      today: day('2026-08-19'), // a Wednesday: not a dose day, and it shows anyway
    });
    expect(state).toEqual({ show: true, pulse: true, reason: 'first-dose' });
  });

  it('treats a soft-deleted dose as no dose at all', () => {
    // Logged one shot, then removed it: they are back to having none, and must
    // not be left with a card that neither beats nor offers the button.
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-15'), { deletedAt: at('2026-08-15', 10) })],
      today: day('2026-08-19'),
    });
    expect(state.reason).toBe('first-dose');
    expect(state.pulse).toBe(true);
  });

  it('stops beating the moment a real dose exists', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-22'))],
      today: day('2026-08-22'),
    });
    expect(state.pulse).toBe(false);
  });
});

describe('the button goes away once the dose is logged', () => {
  it('hides on a day that is not a dose day', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-22'))],
      today: day('2026-08-25'), // Tuesday
    });
    expect(state).toEqual({ show: false, pulse: false, reason: 'not-due' });
  });

  it('hides on the dose day itself once that day is logged', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-15')), dose(at('2026-08-22'))],
      today: day('2026-08-22'),
    });
    expect(state.show).toBe(false);
  });

  it('collapses the same day for a daily user who has logged today', () => {
    const state = doseCtaState({
      schedules: [DAILY],
      cycles: null,
      doseLogs: [dose(at('2026-08-25', 8))],
      today: day('2026-08-25'),
    });
    expect(state.show).toBe(false);
  });
});

describe('it comes back on the next dose day', () => {
  it('returns on the following Saturday, from the onboarding frequency', () => {
    const doses = [dose(at('2026-08-22'))];
    const on = (date: string) =>
      doseCtaState({ schedules: [SATURDAYS], cycles: null, doseLogs: doses, today: day(date) });

    expect(on('2026-08-22').show).toBe(false); // logged today
    expect(on('2026-08-26').show).toBe(false); // Wednesday, nothing due
    expect(on('2026-08-29')).toEqual({ show: true, pulse: false, reason: 'due-today' });
  });

  it('returns every day for a daily schedule until that day is logged', () => {
    const state = doseCtaState({
      schedules: [DAILY],
      cycles: null,
      doseLogs: [dose(at('2026-08-24'))],
      today: day('2026-08-25'),
    });
    expect(state.reason).toBe('due-today');
  });

  it('follows a custom every-3-days interval off its anchor', () => {
    const every3 = schedule({
      frequency: 'custom',
      intervalDays: 3,
      nextDoseAt: at('2026-08-25'),
    });
    // Planned: Aug 22, 25, 28. They logged the 22nd only.
    const on = (date: string, doses: DoseLogResponse[]) =>
      doseCtaState({ schedules: [every3], cycles: null, doseLogs: doses, today: day(date) }).show;
    const logged22 = [dose(at('2026-08-22'))];

    expect(on('2026-08-24', logged22)).toBe(false); // mid-interval
    expect(on('2026-08-25', logged22)).toBe(true); // due
    expect(on('2026-08-26', logged22)).toBe(true); // the 25th was missed
    expect(on('2026-08-26', [...logged22, dose(at('2026-08-25'))])).toBe(false);
    expect(on('2026-08-28', [...logged22, dose(at('2026-08-25'))])).toBe(true);
  });

  it('comes back after a biweekly gap, not a weekly one', () => {
    const biweekly = schedule({ frequency: 'biweekly', nextDoseAt: at('2026-08-22') });
    const doses = [dose(at('2026-08-22'))];
    const on = (date: string) =>
      doseCtaState({ schedules: [biweekly], cycles: null, doseLogs: doses, today: day(date) }).show;

    expect(on('2026-08-29')).toBe(false); // one week on: not their cadence
    expect(on('2026-09-05')).toBe(true); // two weeks on
  });

  it('does not come back for an inactive schedule', () => {
    const state = doseCtaState({
      schedules: [schedule({ frequency: 'weekly', daysOfWeek: [6], active: false })],
      cycles: null,
      doseLogs: [dose(at('2026-08-22'))],
      today: day('2026-08-29'),
    });
    // No active schedule at all reads as "cadence unknown", which shows the
    // button rather than silently removing it — but never as a due day.
    expect(state.reason).toBe('schedule-unknown');
  });
});

describe('a missed dose still counts as due, but not forever', () => {
  it('keeps the button up the day after a missed Saturday', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-15'))],
      today: day('2026-08-23'), // Sunday; Saturday 22 came and went unlogged
    });
    expect(state).toEqual({ show: true, pulse: false, reason: 'missed' });
  });

  it('gives up after the lookback window, rather than nagging forever', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-15'))],
      today: day('2026-08-26'), // four days past the missed Saturday
    });
    expect(state.show).toBe(false);
  });

  it('never shows the button to someone who already dosed today', () => {
    // Safety, not tidiness: a missed day is history, and a second dose today is
    // not how it gets made up. Logging today outranks any missed day.
    const state = doseCtaState({
      schedules: [DAILY],
      cycles: null,
      doseLogs: [dose(at('2026-08-25', 8))], // yesterday and the day before missed
      today: day('2026-08-25'),
    });
    expect(state.show).toBe(false);
  });

  it('does not call a day missed when it was logged late', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: null,
      doseLogs: [dose(at('2026-08-22', 23))], // logged, just at 11pm
      today: day('2026-08-23'),
    });
    expect(state.show).toBe(false);
  });
});

describe('rest weeks are not dose days', () => {
  const RESTING = cycle({ startDate: '2026-08-03', weeksOn: 2, weeksOff: 1, repeats: true });

  it('stays hidden through a rest week even on the planned weekday', () => {
    // Aug 3 + 2 weeks on → Aug 17–23 is the rest week, so Saturday 22 is off.
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: [RESTING],
      doseLogs: [dose(at('2026-08-15'))],
      today: day('2026-08-22'),
    });
    expect(state.show).toBe(false);
  });

  it('is due again on the first planned day after the rest week', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS],
      cycles: [RESTING],
      doseLogs: [dose(at('2026-08-15'))],
      today: day('2026-08-29'),
    });
    expect(state.reason).toBe('due-today');
  });
});

describe('it only hides on positive knowledge', () => {
  it('shows while schedules are still loading', () => {
    const state = doseCtaState({
      schedules: null,
      cycles: null,
      doseLogs: [dose(at('2026-08-22'))],
      today: day('2026-08-25'),
    });
    // A failed or in-flight GET must never remove Home's logging action.
    expect(state).toEqual({ show: true, pulse: false, reason: 'schedule-unknown' });
  });

  it('shows when the user has no schedule at all', () => {
    const state = doseCtaState({
      schedules: [],
      cycles: null,
      doseLogs: [dose(at('2026-08-22'))],
      today: day('2026-08-25'),
    });
    expect(state.reason).toBe('schedule-unknown');
  });

  it('shows when the schedule carries no derivable cadence', () => {
    // Weekly with neither daysOfWeek nor an anchor: plannedDays can produce
    // nothing, and "no dose day ever" must not read as "not due today".
    const state = doseCtaState({
      schedules: [schedule({ frequency: 'weekly', daysOfWeek: [], nextDoseAt: undefined })],
      cycles: null,
      doseLogs: [dose(at('2026-08-22'))],
      today: day('2026-08-25'),
    });
    expect(state.reason).toBe('schedule-unknown');
  });

  it('handles a null dose list as a brand-new user', () => {
    const state = doseCtaState({
      schedules: null,
      cycles: null,
      doseLogs: null,
      today: day('2026-08-25'),
    });
    expect(state.reason).toBe('first-dose');
  });
});

describe('two compounds', () => {
  it('is due when either schedule wants a dose today', () => {
    const state = doseCtaState({
      schedules: [SATURDAYS, schedule({ id: 's2', compoundId: 'c2', frequency: 'daily' })],
      cycles: null,
      doseLogs: [dose(at('2026-08-24'))],
      today: day('2026-08-25'),
    });
    expect(state.reason).toBe('due-today');
  });
});
