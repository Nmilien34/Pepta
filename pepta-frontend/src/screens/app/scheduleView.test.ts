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
    expect(strip.map((d) => d.date.slice(8))).toEqual([
      '22', '23', '24', '25', '26', '27', '28',
    ]);
    expect(strip.map((d) => d.name).join(' ')).toBe('MON TUE WED THU FRI SAT SUN');
    expect(strip[2]).toMatchObject({ isToday: true, date: '2026-06-24' });
    expect(strip.map((d) => d.mark)).toEqual([
      'none', 'none', 'none', 'none', 'none', 'due', 'none',
    ]);
  });

  it('logged beats due; a planned day that passed unlogged reads as missed', () => {
    // Wednesday's shot was logged; Monday was planned and never was.
    const strip = weekStrip(
      TODAY,
      [schedule({ daysOfWeek: [1, 3] })],
      [dose('2026-06-24T12:00:00.000Z')],
      pattern,
    );
    // Was 'none' before the mark-based strip, which drew it exactly like a
    // rest day — the one distinction someone checking their protocol needs.
    expect(strip[0]!.mark).toBe('missed'); // Mon 22, planned, past, no log
    expect(strip[2]!.mark).toBe('logged'); // Wed 24
  });

  it('never calls a rest day missed — nothing was planned to miss', () => {
    // Aug 3 2026 sits inside the Jul 27 - Aug 9 rest window, on a daily
    // schedule, so every day this week is both "planned" and resting.
    const strip = weekStrip(
      new Date('2026-08-05T12:00:00.000Z'),
      [schedule({ frequency: 'daily' })],
      [],
      pattern,
    );
    expect(strip.some((d) => d.mark === 'missed')).toBe(false);
  });

  it('does not call an unplanned past day missed either', () => {
    // Saturdays only: nothing was expected on Monday, so nothing was missed.
    const strip = weekStrip(TODAY, [schedule({ daysOfWeek: [6] })], [], pattern);

    expect(strip[0]!.mark).toBe('none');
    expect(strip[5]!.mark).toBe('due');
  });

  it('counts today as still due, not already missed', () => {
    const strip = weekStrip(TODAY, [schedule({ daysOfWeek: [3] })], [], pattern);

    expect(strip[2]!.mark).toBe('due'); // Wed 24 is today
  });

  it('names each day for the strip tiles, alongside the letter the sheet uses', () => {
    const strip = weekStrip(TODAY, [schedule({ daysOfWeek: [6] })], [], pattern);

    expect(strip.map((d) => d.name)).toEqual([
      'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
    ]);
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

describe('the cadence anchor follows real doses, not the stored schedule', () => {
  // The drift this pins: for cadence schedules (weekly with no daysOfWeek,
  // biweekly, custom) plannedDays anchored on schedule.nextDoseAt — written at
  // creation and never advanced by logging. The BACKEND anchors the countdown
  // on the latest logged dose. So the first time someone logs a day late,
  // their real cadence walks away from the stored anchor, and every stale
  // anchor day thereafter passed unlogged — a phantom red "missed" X, every
  // week, for a perfectly adherent user. The nextDoseAt merge in weekStrip
  // ringed the TRUE next day but never removed the phantom.
  //
  // Fixture: schedule anchored Friday Jun 19; the user has settled into
  // Saturdays (last dose Sat Jun 20). Today is Wed Jun 24.

  const cadence = schedule({ nextDoseAt: '2026-06-19T12:00:00.000Z' });

  it('plans the user’s actual rhythm once a dose exists', () => {
    const strip = weekStrip(TODAY, [cadence], [dose('2026-06-20T12:00:00.000Z')], null);

    // Sat 27 is due (last dose Sat 20 + 7). Fri 26 — the stored anchor's
    // projection — is nothing at all.
    expect(strip[4]!).toMatchObject({ date: '2026-06-26', mark: 'none' });
    expect(strip.filter((d) => d.mark === 'due').map((d) => d.date)).toEqual(['2026-06-27']);
  });

  it('paints no phantom missed on the stale anchor day', () => {
    // Fri Jun 26 was the stored anchor's projection. With the real dose
    // anchoring the cadence, Friday is not planned, so a Friday that passes
    // unlogged cannot read as missed.
    const monday = new Date('2026-06-29T12:00:00.000Z');
    const strip = weekStrip(monday, [cadence], [dose('2026-06-20T12:00:00.000Z')], null);

    expect(strip.find((d) => d.date === '2026-06-26')).toBeUndefined(); // prev week
    // This week: Sat Jul 4 due (Jun 20 + 14), no missed anywhere.
    expect(strip.some((d) => d.mark === 'missed')).toBe(false);
    expect(strip.filter((d) => d.mark === 'due').map((d) => d.date)).toEqual(['2026-07-04']);
  });

  it('falls back to the stored anchor when nothing has been logged', () => {
    // A brand-new schedule must still show its plan — the fallback is the
    // same rule the backend applies (scheduleAnchor only when no dose exists).
    const strip = weekStrip(TODAY, [cadence], [], null);

    expect(strip.filter((d) => d.mark === 'due').map((d) => d.date)).toEqual(['2026-06-26']);
  });

  it('a deleted dose does not anchor', () => {
    const gone = { ...dose('2026-06-20T12:00:00.000Z'), deletedAt: '2026-06-21T00:00:00.000Z' };
    const strip = weekStrip(TODAY, [cadence], [gone], null);

    expect(strip.filter((d) => d.mark === 'due').map((d) => d.date)).toEqual(['2026-06-26']);
  });

  it('anchors per compound — another medication’s dose moves nothing', () => {
    const other = { ...dose('2026-06-20T12:00:00.000Z'), compoundId: 'c2' };
    const strip = weekStrip(TODAY, [cadence], [other], null);

    expect(strip.filter((d) => d.mark === 'due').map((d) => d.date)).toEqual(['2026-06-26']);
  });

  it('leaves daysOfWeek schedules alone — named days are a promise, not a drift', () => {
    // Saturday-by-name stays Saturday no matter when the user actually logs;
    // only cadence schedules follow the latest dose.
    const named = schedule({ daysOfWeek: [6] });
    const strip = weekStrip(TODAY, [named], [dose('2026-06-22T12:00:00.000Z')], null);

    expect(strip.filter((d) => d.mark === 'due').map((d) => d.date)).toEqual(['2026-06-27']);
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

describe('the marks are the user’s real doses, not a drawing', () => {
  const pattern = { startDate: '2026-06-01', weeksOn: 8, weeksOff: 2, repeats: true };

  it('checks a day only when a dose was logged on it', () => {
    const strip = weekStrip(
      TODAY,
      [schedule({ daysOfWeek: [6] })],
      [dose('2026-06-22T12:00:00.000Z')],
      pattern,
    );

    expect(strip[0]!.mark).toBe('logged'); // Mon 22, logged
    expect(strip[1]!.mark).toBe('none'); // Tue 23, nothing
  });

  it('takes the check away when the user deletes that dose', () => {
    // deletedAt is the only delete this app performs. It was filtered in
    // doseCta and nowhere else, so a removed shot kept its check here.
    const deleted = { ...dose('2026-06-22T12:00:00.000Z'), deletedAt: '2026-06-23T09:00:00.000Z' };
    const strip = weekStrip(TODAY, [schedule({ daysOfWeek: [6] })], [deleted as never], pattern);

    expect(strip[0]!.mark).not.toBe('logged');
  });

  it('rings the day the countdown above it is counting down to', () => {
    // The ring comes from the schedule, the countdown from /home. When those
    // drift, the card reads one day over a ring on another.
    const strip = weekStrip(
      TODAY,
      [schedule({ daysOfWeek: [] })], // no explicit days: nothing to derive from
      [],
      pattern,
      '2026-06-26T20:00:00.000Z', // Friday
    );

    expect(strip[4]!.mark).toBe('due'); // Fri 26
  });

  it('ignores a next dose that falls outside this week', () => {
    const strip = weekStrip(
      TODAY,
      [schedule({ daysOfWeek: [] })],
      [],
      pattern,
      '2026-07-04T20:00:00.000Z',
    );

    expect(strip.every((day) => day.mark === 'none')).toBe(true);
  });

  it('does not let a next dose overrule a day already logged', () => {
    const strip = weekStrip(
      TODAY,
      [schedule({ daysOfWeek: [] })],
      [dose('2026-06-24T08:00:00.000Z')],
      pattern,
      '2026-06-24T20:00:00.000Z',
    );

    expect(strip[2]!.mark).toBe('logged'); // Wed 24 — taken beats due
  });

  it('marks every planned day on a daily schedule, not just one', () => {
    const strip = weekStrip(TODAY, [schedule({ frequency: 'daily' })], [], pattern);
    const ahead = strip.slice(2); // Wed 24 onward

    expect(ahead.every((day) => day.mark === 'due')).toBe(true);
  });
});
