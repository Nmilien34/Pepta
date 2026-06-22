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
});
