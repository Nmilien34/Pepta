import { describe, expect, it } from 'vitest';
import { cycleDayFromShotDay, daysSinceDose, utcWeekRange } from '../../lib/week';

describe('week helpers', () => {
  it('returns UTC Monday week ranges', () => {
    const range = utcWeekRange(new Date('2026-06-21T12:00:00.000Z'));

    expect(range.weekOf).toBe('2026-06-15');
    expect(range.start.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-06-22T00:00:00.000Z');
  });

  it('computes dose distance and one-based cycle day', () => {
    const now = new Date('2026-06-21T12:00:00.000Z');

    expect(daysSinceDose('2026-06-18T08:00:00.000Z', now)).toBe(3);
    expect(cycleDayFromShotDay('2026-06-18T08:00:00.000Z', now)).toBe(4);
  });
});
