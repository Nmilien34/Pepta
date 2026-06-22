import { describe, expect, it } from 'vitest';
import { craftingSteps, previewTargets, supportLine } from './planPreview';

describe('previewTargets', () => {
  it('produces sensible targets for a 184 lb light-activity user', () => {
    const t = previewTargets({ currentWeight: 184, unit: 'lb', activityLevel: 'light', weeklyLoss: 1.2 });
    expect(t.proteinG).toBe(129); // 184 * 0.7
    expect(t.calories).toBeGreaterThan(1500);
    expect(t.calories).toBeLessThan(2300);
    expect(t.waterOz).toBe(92);
    expect(t.fiberG).toBeGreaterThanOrEqual(25);
    expect(t.steps).toBe(8000);
  });

  it('handles metric input by converting to lb internally', () => {
    const metric = previewTargets({ currentWeight: 83, unit: 'kg', activityLevel: 'light', weeklyLoss: 0.5 });
    const imperial = previewTargets({ currentWeight: 183, unit: 'lb', activityLevel: 'light', weeklyLoss: 1.1 });
    expect(Math.abs(metric.proteinG - imperial.proteinG)).toBeLessThan(5);
  });
});

describe('craftingSteps', () => {
  it('adapts to side effects and worry', () => {
    expect(craftingSteps({ sideEffects: ['nausea'] })).toContain('Adjusting hydration to ease nausea');
    expect(craftingSteps({ sideEffects: ['constipation'] })).toContain('Tailoring fiber to ease constipation');
    expect(craftingSteps({ biggestWorry: 'energy' })).toContain('Setting your step goal for energy');
    expect(craftingSteps({})).toHaveLength(4);
  });
});

describe('supportLine', () => {
  it('lists up to two adjustments, or a default', () => {
    expect(supportLine(['nausea', 'fatigue'])).toBe('Personalized to ease nausea & lift your energy.');
    expect(supportLine([])).toBe('Personalized to protect your muscle.');
  });
});
