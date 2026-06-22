import { describe, expect, it } from 'vitest';
import { computeMuscleRetention } from '../../lib/muscle-retention';

describe('computeMuscleRetention', () => {
  it('weights protein, training, and weight-loss pace into a 0-100 score', () => {
    const result = computeMuscleRetention({
      proteinActualGrams: 100,
      proteinTargetGrams: 125,
      proteinDaysHit: 5,
      daysInWindow: 7,
      resistanceSessions: 2,
      resistanceSessionTarget: 3,
      weeklyWeightLossPercent: 0.9,
    });

    expect(result.score).toBe(73);
    expect(result.verdict).toBe('steady');
    expect(result.penaltyApplied).toBe(false);
    expect(result.drivers.map((driver) => driver.type)).toEqual(['protein', 'training', 'pace']);
    expect(result.engineVersion).toBe('retention-v2');
  });

  it('penalizes fast-loss plus low-protein danger combos', () => {
    const penalized = computeMuscleRetention({
      proteinActualGrams: 70,
      proteinTargetGrams: 125,
      proteinDaysHit: 3,
      daysInWindow: 7,
      resistanceSessions: 3,
      resistanceSessionTarget: 3,
      weeklyWeightLossPercent: 1.8,
    });
    const unpenalized = computeMuscleRetention({
      proteinActualGrams: 70,
      proteinTargetGrams: 125,
      proteinDaysHit: 3,
      daysInWindow: 7,
      resistanceSessions: 3,
      resistanceSessionTarget: 3,
      weeklyWeightLossPercent: 1.4,
    });

    expect(penalized.penaltyApplied).toBe(true);
    expect(['watch', 'at_risk']).toContain(penalized.verdict);
    expect(penalized.score).toBeLessThan(unpenalized.score);
  });
});
