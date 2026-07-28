import { describe, expect, it } from 'vitest';
import { MAINTAIN_BAND, goalTypeFromWeights, normalizeGoalNote } from './goalIntent';

describe('goalTypeFromWeights', () => {
  it('reads wanting to be lighter as fat loss', () => {
    expect(goalTypeFromWeights({ startWeight: 210, goalWeight: 180, unit: 'lb' })).toBe('lose_fat');
    expect(goalTypeFromWeights({ startWeight: 95, goalWeight: 80, unit: 'kg' })).toBe('lose_fat');
  });

  it('reads wanting to be heavier as recomp', () => {
    // On a GLP-1 this is someone rebuilding, not someone gaining fat.
    expect(goalTypeFromWeights({ startWeight: 150, goalWeight: 165, unit: 'lb' })).toBe('recomp');
  });

  it('treats a near-identical goal weight as maintain', () => {
    // Otherwise a 1lb difference would put a real calorie deficit on someone
    // who told us they want to hold roughly where they are.
    expect(goalTypeFromWeights({ startWeight: 180, goalWeight: 180, unit: 'lb' })).toBe('maintain');
    expect(goalTypeFromWeights({ startWeight: 180, goalWeight: 178, unit: 'lb' })).toBe('maintain');
    expect(goalTypeFromWeights({ startWeight: 80, goalWeight: 81, unit: 'kg' })).toBe('maintain');
  });

  it('applies the band in the unit it was given', () => {
    // 3lb and 1.5kg are the same distance; a single number would make the band
    // twice as wide in metric.
    const justOutsideLb = MAINTAIN_BAND.lb + 0.5;
    const justOutsideKg = MAINTAIN_BAND.kg + 0.5;
    expect(goalTypeFromWeights({ startWeight: 180, goalWeight: 180 - justOutsideLb, unit: 'lb' })).toBe('lose_fat');
    expect(goalTypeFromWeights({ startWeight: 80, goalWeight: 80 - justOutsideKg, unit: 'kg' })).toBe('lose_fat');
  });

  it('falls back to lose_fat rather than guessing on unusable numbers', () => {
    // It is what the payload already defaulted to, so a half-filled profile
    // behaves exactly as it did before this existed.
    expect(goalTypeFromWeights(null)).toBe('lose_fat');
    expect(goalTypeFromWeights(undefined)).toBe('lose_fat');
    expect(goalTypeFromWeights({ startWeight: 0, goalWeight: 180, unit: 'lb' })).toBe('lose_fat');
    expect(goalTypeFromWeights({ startWeight: NaN, goalWeight: 180, unit: 'lb' })).toBe('lose_fat');
    expect(goalTypeFromWeights({ startWeight: 180, goalWeight: -5, unit: 'lb' })).toBe('lose_fat');
  });
});

describe('normalizeGoalNote', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeGoalNote('  get strong   enough to hike again \n')).toBe(
      'get strong enough to hike again',
    );
  });

  it('reads nothing-content as no note at all', () => {
    // An empty "Something else" must not write a blank string the schema's
    // min(1) would then reject.
    for (const raw of ['', '   ', '\n\t', null, undefined]) {
      expect(normalizeGoalNote(raw)).toBeUndefined();
    }
  });

  it('caps at the schema length so the API cannot reject what the field accepted', () => {
    const note = normalizeGoalNote('x'.repeat(200));
    expect(note).toHaveLength(80);
  });
});
