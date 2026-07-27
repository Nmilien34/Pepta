import { describe, expect, it } from 'vitest';
import { computeMix, suggestWaterMl, unitsFor } from './reconstitution';
import { doseAdvisory, doseRangeFor } from '../data/doseRanges';

describe('reconstitution math', () => {
  it('matches the design-lab example: 10 mg vial + 2 mL water + 250 mcg = 5 units', () => {
    expect(unitsFor(10, 2, 250)).toBe(5);
    const mix = computeMix({ vialMg: 10, syringeUnits: 50, doseMcg: 250, waterMl: 2 });
    expect(mix).toMatchObject({
      waterMl: 2,
      concentrationMgPerMl: 5,
      unitsToDraw: 5,
      fits: true,
      readable: true,
    });
  });

  it('water changes only the mapping, never the dose', () => {
    // Same 250 mcg with 3 mL water: lower concentration, more units.
    expect(unitsFor(10, 3, 250)).toBe(7.5);
    // And with 1 mL: fewer units.
    expect(unitsFor(10, 1, 250)).toBe(2.5);
  });

  it('suggests water that lands a clean, readable draw', () => {
    const water = suggestWaterMl(10, 50, 250);
    const units = unitsFor(10, water, 250);
    expect(units).toBeGreaterThanOrEqual(2);
    expect(units).toBeLessThanOrEqual(50 * 0.8);
    // The suggestion is used when water is omitted.
    const mix = computeMix({ vialMg: 10, syringeUnits: 50, doseMcg: 250 });
    expect(mix?.waterSuggested).toBe(true);
    expect(mix?.waterMl).toBe(water);
  });

  it('flags draws that overflow or crowd the syringe', () => {
    // 30 mg dose from a 10 mg/2 mL mix = 600 units — nowhere near a 50u barrel.
    const overflow = computeMix({ vialMg: 10, syringeUnits: 50, doseMcg: 30_000, waterMl: 2 });
    expect(overflow?.fits).toBe(false);
    // A 100 mcg draw at high concentration is under the 2-unit readability floor.
    const tiny = computeMix({ vialMg: 10, syringeUnits: 50, doseMcg: 100, waterMl: 1 });
    expect(tiny?.readable).toBe(false);
  });

  it('rejects nonsense inputs instead of NaN-ing the UI', () => {
    expect(computeMix({ vialMg: 0, syringeUnits: 50, doseMcg: 250 })).toBeNull();
    expect(computeMix({ vialMg: 10, syringeUnits: 50, doseMcg: 0 })).toBeNull();
    expect(computeMix({ vialMg: 10, syringeUnits: 50, doseMcg: 250, waterMl: 0 })).toBeNull();
  });
});

describe('dose advisory (sourced ranges only)', () => {
  it('uses FDA-labeled ranges for GLP-1s', () => {
    expect(doseRangeFor('Tirzepatide')?.label).toBe('2.5–15 mg weekly');
    expect(doseAdvisory('Tirzepatide', 20_000)?.direction).toBe('above');
    expect(doseAdvisory('Tirzepatide', 5_000)).toBeNull();
    expect(doseAdvisory('Semaglutide', 100)?.direction).toBe('below');
  });

  it('never invents a range for unlabeled research peptides', () => {
    expect(doseRangeFor('BPC-157')).toBeNull();
    expect(doseAdvisory('BPC-157', 999_999)).toBeNull();
  });
});
