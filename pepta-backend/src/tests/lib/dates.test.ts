import { describe, expect, it } from 'vitest';
import { cycleDay, startOfUtcWeek, toDateOnly } from '../../lib/dates';

describe('date helpers', () => {
  it('starts UTC weeks on Monday', () => {
    expect(toDateOnly(startOfUtcWeek(new Date('2026-06-21T12:00:00.000Z')))).toBe(
      '2026-06-15',
    );
    expect(toDateOnly(startOfUtcWeek(new Date('2026-06-22T00:01:00.000Z')))).toBe(
      '2026-06-22',
    );
  });

  it('calculates 1-based dose cycle day', () => {
    expect(cycleDay('2026-06-01T09:00:00.000Z', new Date('2026-06-01T23:00:00.000Z'))).toBe(1);
    expect(cycleDay('2026-06-01T09:00:00.000Z', new Date('2026-06-04T08:59:00.000Z'))).toBe(3);
  });
});
