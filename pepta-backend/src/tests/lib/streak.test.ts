import { describe, expect, it } from 'vitest';
import { consecutiveActivityStreak } from '../../lib/streak';

describe('consecutiveActivityStreak', () => {
  it('counts consecutive UTC days with any log activity', () => {
    const streak = consecutiveActivityStreak(
      [
        { datetime: '2026-06-21T14:00:00.000Z' },
        { datetime: '2026-06-20T10:00:00.000Z' },
        { datetime: '2026-06-19T08:00:00.000Z' },
        { datetime: '2026-06-17T08:00:00.000Z' },
      ],
      new Date('2026-06-21T18:00:00.000Z'),
    );

    expect(streak).toBe(3);
  });
});
