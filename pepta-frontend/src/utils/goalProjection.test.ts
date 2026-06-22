import { describe, expect, it } from 'vitest';
import { projectGoal } from './goalProjection';

const now = new Date(2026, 5, 21); // Jun 21 2026

describe('projectGoal', () => {
  it('loses faster at a higher pace', () => {
    const gentle = projectGoal({ currentWeight: 184, goalWeight: 165, pace: 0, now });
    const ambitious = projectGoal({ currentWeight: 184, goalWeight: 165, pace: 1, now });
    expect(ambitious.weeklyLoss).toBeGreaterThan(gentle.weeklyLoss);
    expect(ambitious.weeks).toBeLessThan(gentle.weeks ?? Infinity);
  });

  it('returns a sensible mid-pace rate (~1 unit/week for 184 lb)', () => {
    const steady = projectGoal({ currentWeight: 184, goalWeight: 165, pace: 0.5, now });
    expect(steady.weeklyLoss).toBeGreaterThan(0.9);
    expect(steady.weeklyLoss).toBeLessThan(1.3);
    expect(steady.estimatedDate).not.toBeNull();
  });

  it('returns nulls when there is nothing to lose', () => {
    const maintain = projectGoal({ currentWeight: 165, goalWeight: 165, pace: 0.5, now });
    expect(maintain.weeks).toBeNull();
    expect(maintain.estimatedDate).toBeNull();
  });
});
