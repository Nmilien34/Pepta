import { describe, expect, it } from 'vitest';
import { ageInYears, ageLabel } from './age';

const AUG_25_2026 = new Date(2026, 7, 25);

describe('ageInYears', () => {
  it('counts a birthday that has already passed this year', () => {
    expect(ageInYears({ year: 2000, month: 4, day: 4 }, AUG_25_2026)).toBe(26);
  });

  // The whole reason this helper exists: `thisYear - birthYear` says 26 here.
  it('does not age someone up before their birthday arrives', () => {
    expect(ageInYears({ year: 2000, month: 10, day: 4 }, AUG_25_2026)).toBe(25);
  });

  it('turns them a year older ON the day, not before it', () => {
    expect(ageInYears({ year: 2000, month: 7, day: 25 }, AUG_25_2026)).toBe(26);
    expect(ageInYears({ year: 2000, month: 7, day: 26 }, AUG_25_2026)).toBe(25);
  });

  it('has no age for a future birth date', () => {
    expect(ageInYears({ year: 2030, month: 0, day: 1 }, AUG_25_2026)).toBeNull();
  });
});

describe('ageLabel', () => {
  it('pluralises', () => {
    expect(ageLabel({ year: 2000, month: 4, day: 4 }, AUG_25_2026)).toBe('26 years old');
    expect(ageLabel({ year: 2025, month: 4, day: 4 }, AUG_25_2026)).toBe('1 year old');
  });
});
