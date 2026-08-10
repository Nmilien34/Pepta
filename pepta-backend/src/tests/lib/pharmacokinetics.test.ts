import { describe, expect, it } from 'vitest';
import { computeMedicationLevel } from '../../lib/pharmacokinetics';

describe('computeMedicationLevel', () => {
  it('decays a single dose by half after one half-life', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [{ amount: 10, datetime: '2026-06-01T00:00:00.000Z' }],
      now: new Date('2026-06-08T00:00:00.000Z'),
      scheduleIntervalDays: 7,
    });

    expect(result.currentEstimate).toBeCloseTo(5, 5);
    expect(result.curve).toHaveLength(57);
    expect(result.estimateBasis).toBe('relative-dose-equivalent');
    expect(result.engineVersion).toBe('pk-v2');
  });

  it('accumulates multiple dose contributions deterministically', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [
        { amount: 10, datetime: '2026-06-01T00:00:00.000Z' },
        { amount: 10, datetime: '2026-06-08T00:00:00.000Z' },
      ],
      now: new Date('2026-06-15T00:00:00.000Z'),
      scheduleIntervalDays: 7,
    });

    expect(result.currentEstimate).toBeCloseTo(7.5, 5);
    expect(result.nextDoseAt).toBe('2026-06-15T00:00:00.000Z');
    expect(result.hoursUntilNextDose).toBe(0);
  });

  it('samples every 6 hours and reports a non-zero forward trough', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [{ amount: 10, datetime: '2026-06-01T00:00:00.000Z' }],
      now: new Date('2026-06-02T00:00:00.000Z'),
      scheduleIntervalDays: 7,
      curveDaysBefore: 1,
      curveDaysAfter: 7,
    });

    expect(result.curve[1]?.datetime).toBe('2026-06-01T06:00:00.000Z');
    expect(result.troughEstimate).toBeGreaterThan(0);
    expect(result.troughEstimate).toBeLessThan(result.currentEstimate);
  });

  it('snaps weekly schedules to the next configured shot weekday without drift', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [{ amount: 10, datetime: '2026-06-09T09:00:00.000Z' }],
      now: new Date('2026-06-14T12:00:00.000Z'),
      scheduleIntervalDays: 7,
      schedule: {
        frequency: 'weekly',
        intervalDays: 7,
        daysOfWeek: [1],
      },
    });

    expect(result.nextDoseAt).toBe('2026-06-15T09:00:00.000Z');
    expect(result.hoursUntilNextDose).toBe(21);
  });

  // On/off cycle: Jun 1 start, 8 weeks on, 2 weeks rest = rest Jul 27 – Aug 9.
  describe('cycle rest windows', () => {
    const cyclePattern = {
      startDate: '2026-06-01',
      weeksOn: 8,
      weeksOff: 2,
      repeats: true,
    };

    it('interval projection lands past the rest window, keeping time-of-day', () => {
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'semaglutide',
        halfLifeDays: 7,
        doses: [{ amount: 10, datetime: '2026-07-25T20:00:00.000Z' }],
        now: new Date('2026-07-26T00:00:00.000Z'),
        scheduleIntervalDays: 7,
        cyclePattern,
      });

      // Raw next = Aug 1, inside rest → first on-day is Aug 10.
      expect(result.nextDoseAt).toBe('2026-08-10T20:00:00.000Z');
    });

    it('weekly weekday projection skips rest Saturdays', () => {
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'semaglutide',
        halfLifeDays: 7,
        doses: [{ amount: 10, datetime: '2026-07-25T09:00:00.000Z' }],
        now: new Date('2026-07-26T00:00:00.000Z'),
        schedule: {
          frequency: 'weekly',
          intervalDays: 7,
          daysOfWeek: [6],
        },
        cyclePattern,
      });

      // Aug 1 and Aug 8 are rest Saturdays; Aug 15 is the first on-cycle one.
      expect(result.nextDoseAt).toBe('2026-08-15T09:00:00.000Z');
    });

    it('a finished one-cycle-only pattern projects no next dose at all', () => {
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'semaglutide',
        halfLifeDays: 7,
        doses: [{ amount: 10, datetime: '2026-07-25T20:00:00.000Z' }],
        now: new Date('2026-08-12T00:00:00.000Z'),
        scheduleIntervalDays: 7,
        cyclePattern: { ...cyclePattern, repeats: false },
      });

      expect(result.nextDoseAt).toBeNull();
      expect(result.hoursUntilNextDose).toBeNull();
    });

    it('without a pattern the legacy projection is untouched', () => {
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'semaglutide',
        halfLifeDays: 7,
        doses: [{ amount: 10, datetime: '2026-07-25T20:00:00.000Z' }],
        now: new Date('2026-07-26T00:00:00.000Z'),
        scheduleIntervalDays: 7,
      });

      expect(result.nextDoseAt).toBe('2026-08-01T20:00:00.000Z');
    });
  });

  // Protocol timing: schedule.timesOfDay are user-LOCAL wall-clock times,
  // converted through the profile timezone — never an echo of the last log.
  describe('protocol dose times', () => {
    it('split dosing lands on the later time the SAME day (daily, EDT)', () => {
      // 08:05 ET shot logged; next is 20:00 ET today = 00:00Z tomorrow.
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'BPC-157',
        halfLifeDays: 1,
        doses: [{ amount: 0.25, datetime: '2026-06-24T12:05:00.000Z' }],
        now: new Date('2026-06-24T12:30:00.000Z'),
        schedule: { frequency: 'daily', timesOfDay: ['08:00', '20:00'] },
        timeZone: 'America/New_York',
      });

      expect(result.nextDoseAt).toBe('2026-06-25T00:00:00.000Z');
    });

    it('weekly weekday schedules project the listed time, not the logged hour', () => {
      // Saturdays at 09:00 ET; last shot logged late (11:47). Next Saturday
      // still projects 09:00 ET (13:00Z in EDT).
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'semaglutide',
        halfLifeDays: 7,
        doses: [{ amount: 10, datetime: '2026-06-20T15:47:00.000Z' }],
        now: new Date('2026-06-22T00:00:00.000Z'),
        schedule: { frequency: 'weekly', daysOfWeek: [6], timesOfDay: ['09:00'] },
        timeZone: 'America/New_York',
      });

      expect(result.nextDoseAt).toBe('2026-06-27T13:00:00.000Z');
    });

    it('converts through the zone in winter too (EST, not a fixed offset)', () => {
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'ipamorelin',
        halfLifeDays: 1,
        doses: [{ amount: 0.3, datetime: '2026-01-10T03:00:00.000Z' }],
        now: new Date('2026-01-10T15:00:00.000Z'),
        schedule: { frequency: 'daily', timesOfDay: ['22:00'] },
        timeZone: 'America/New_York',
      });

      // 22:00 EST (UTC-5) = 03:00Z next day.
      expect(result.nextDoseAt).toBe('2026-01-11T03:00:00.000Z');
    });

    it('cycle rest windows still pause timed protocols', () => {
      // Rest Jul 27 – Aug 9 (user-local days); daily 08:00 ET resumes Aug 10.
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'BPC-157',
        halfLifeDays: 1,
        doses: [{ amount: 0.25, datetime: '2026-07-26T12:00:00.000Z' }],
        now: new Date('2026-07-27T12:00:00.000Z'),
        schedule: { frequency: 'daily', timesOfDay: ['08:00'] },
        timeZone: 'America/New_York',
        cyclePattern: { startDate: '2026-06-01', weeksOn: 8, weeksOff: 2, repeats: true },
      });

      expect(result.nextDoseAt).toBe('2026-08-10T12:00:00.000Z');
    });

    it('falls back to the legacy echo when the timezone is unusable', () => {
      const result = computeMedicationLevel({
        compoundId: 'compound-1',
        compoundName: 'semaglutide',
        halfLifeDays: 7,
        doses: [{ amount: 10, datetime: '2026-06-20T15:47:00.000Z' }],
        now: new Date('2026-06-22T00:00:00.000Z'),
        schedule: { frequency: 'weekly', intervalDays: 7, timesOfDay: ['09:00'] },
        scheduleIntervalDays: 7,
        timeZone: 'Not/AZone',
      });

      // Legacy behavior: last dose + 7 days, hour echoed.
      expect(result.nextDoseAt).toBe('2026-06-27T15:47:00.000Z');
    });
  });
});

// Daily cadence (2026-08-07): the service now maps frequency 'daily' to a
// 1-day interval, so a daily schedule WITHOUT explicit dose times still
// projects tomorrow's dose — and with times, the engine's existing daily
// branch (tested above) uses the chosen wall-clock time.
describe('daily interval projection', () => {
  it('a daily schedule with no timesOfDay projects last dose + 1 day', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'oral-daily',
      halfLifeDays: 1,
      doses: [{ amount: 3, datetime: '2026-08-06T14:00:00.000Z' }],
      now: new Date('2026-08-06T20:00:00.000Z'),
      scheduleIntervalDays: 1,
    });
    expect(result.nextDoseAt).toBe('2026-08-07T14:00:00.000Z');
  });

  it('weekly interval behavior is unchanged', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [{ amount: 10, datetime: '2026-08-02T14:00:00.000Z' }],
      now: new Date('2026-08-06T20:00:00.000Z'),
      scheduleIntervalDays: 7,
    });
    expect(result.nextDoseAt).toBe('2026-08-09T14:00:00.000Z');
  });
});

// Daily default time (2026-08-07): a daily schedule with NO stored time is
// the wild's common case — onboarding never collected one, so the old
// projection dragged the last dose's logged hour (noon, from the seeded
// lastDose) instead of a real dose time. It now projects 9:00 AM LOCAL,
// computed at read time and never written to the schedule.
describe('daily schedules with no stored time', () => {
  it('projects 9:00 AM local, not the logged hour', () => {
    // Noon-UTC seeded dose (08:00 EDT); next is 09:00 EDT = 13:00Z same day.
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'Rybelsus',
      halfLifeDays: 1,
      doses: [{ amount: 7, datetime: '2026-08-06T12:00:00.000Z' }],
      now: new Date('2026-08-06T12:30:00.000Z'),
      schedule: { frequency: 'daily' },
      timeZone: 'America/New_York',
    });

    expect(result.nextDoseAt).toBe('2026-08-06T13:00:00.000Z');
  });

  it('rolls to tomorrow once today’s 9:00 AM has passed', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'Rybelsus',
      halfLifeDays: 1,
      doses: [{ amount: 7, datetime: '2026-08-06T13:00:00.000Z' }],
      now: new Date('2026-08-06T18:00:00.000Z'),
      schedule: { frequency: 'daily' },
      timeZone: 'America/New_York',
    });

    expect(result.nextDoseAt).toBe('2026-08-07T13:00:00.000Z');
  });

  it('an explicitly chosen time always wins over the default', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'Rybelsus',
      halfLifeDays: 1,
      doses: [{ amount: 7, datetime: '2026-08-06T12:00:00.000Z' }],
      now: new Date('2026-08-06T12:30:00.000Z'),
      schedule: { frequency: 'daily', timesOfDay: ['21:00'] },
      timeZone: 'America/New_York',
    });

    // 21:00 EDT = 01:00Z next day — the default never applies.
    expect(result.nextDoseAt).toBe('2026-08-07T01:00:00.000Z');
  });

  it('without a usable timezone it degrades to the legacy interval echo', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'Rybelsus',
      halfLifeDays: 1,
      doses: [{ amount: 7, datetime: '2026-08-06T12:00:00.000Z' }],
      now: new Date('2026-08-06T12:30:00.000Z'),
      schedule: { frequency: 'daily' },
      scheduleIntervalDays: 1,
    });

    expect(result.nextDoseAt).toBe('2026-08-07T12:00:00.000Z');
  });

  it('WEEKLY with no stored time is untouched — still the logged hour', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [{ amount: 10, datetime: '2026-08-02T14:00:00.000Z' }],
      now: new Date('2026-08-06T20:00:00.000Z'),
      schedule: { frequency: 'weekly' },
      scheduleIntervalDays: 7,
      timeZone: 'America/New_York',
    });

    expect(result.nextDoseAt).toBe('2026-08-09T14:00:00.000Z');
  });

  it('BIWEEKLY with no stored time is untouched', () => {
    const result = computeMedicationLevel({
      compoundId: 'compound-1',
      compoundName: 'semaglutide',
      halfLifeDays: 7,
      doses: [{ amount: 10, datetime: '2026-08-02T14:00:00.000Z' }],
      now: new Date('2026-08-06T20:00:00.000Z'),
      schedule: { frequency: 'biweekly' },
      scheduleIntervalDays: 14,
      timeZone: 'America/New_York',
    });

    expect(result.nextDoseAt).toBe('2026-08-16T14:00:00.000Z');
  });
});
