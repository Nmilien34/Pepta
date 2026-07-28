import { describe, expect, it } from 'vitest';
import {
  COMPANION_NAME_MAX,
  COMPANION_NAME_PRESETS,
  DEFAULT_COMPANION_NAME,
  companionNameForSave,
  isValidCompanionName,
  randomCompanionName,
  resolveCompanionName,
} from './companion';

describe('resolveCompanionName', () => {
  it('falls back to Pep for every flavour of "not chosen"', () => {
    expect(resolveCompanionName(undefined)).toBe('Pep');
    expect(resolveCompanionName(null)).toBe('Pep');
    expect(resolveCompanionName('')).toBe('Pep');
    expect(resolveCompanionName('   ')).toBe('Pep');
  });

  it('returns the chosen name, trimmed', () => {
    expect(resolveCompanionName('Sushi')).toBe('Sushi');
    expect(resolveCompanionName('  Bean  ')).toBe('Bean');
  });

  it('never returns more than the schema allows', () => {
    const long = 'x'.repeat(40);
    expect(resolveCompanionName(long)).toHaveLength(COMPANION_NAME_MAX);
  });
});

describe('companionNameForSave', () => {
  it('stores nothing when the user left it at the default', () => {
    // Persisting "Pep" would lose the distinction between "never chose" and
    // "chose Pep", which matters if the default ever changes.
    expect(companionNameForSave('Pep')).toBeUndefined();
    expect(companionNameForSave('  Pep ')).toBeUndefined();
    expect(companionNameForSave('')).toBeUndefined();
    expect(companionNameForSave('   ')).toBeUndefined();
  });

  it('stores a real pick, trimmed and capped', () => {
    expect(companionNameForSave(' Sushi ')).toBe('Sushi');
    expect(companionNameForSave('y'.repeat(30))).toHaveLength(COMPANION_NAME_MAX);
  });

  it('round-trips through resolve', () => {
    const saved = companionNameForSave('Noodle');
    expect(resolveCompanionName(saved)).toBe('Noodle');
  });
});

describe('isValidCompanionName', () => {
  it('accepts empty (that just means Pep) and rejects over-long', () => {
    expect(isValidCompanionName('')).toBe(true);
    expect(isValidCompanionName('Gus')).toBe(true);
    expect(isValidCompanionName('z'.repeat(COMPANION_NAME_MAX))).toBe(true);
    expect(isValidCompanionName('z'.repeat(COMPANION_NAME_MAX + 1))).toBe(false);
  });
});

describe('randomCompanionName', () => {
  it('never returns the name already showing', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(randomCompanionName('Sushi', roll)).not.toBe('Sushi');
    }
  });

  it('always returns a real preset and stays in range at roll = 1', () => {
    expect(COMPANION_NAME_PRESETS).toContain(randomCompanionName('Pep', 0.999));
    expect(COMPANION_NAME_PRESETS).toContain(randomCompanionName('Pep', 1));
  });
});

describe('presets', () => {
  it('lead with the default and hold no duplicates', () => {
    expect(COMPANION_NAME_PRESETS[0]).toBe(DEFAULT_COMPANION_NAME);
    expect(new Set(COMPANION_NAME_PRESETS).size).toBe(COMPANION_NAME_PRESETS.length);
  });

  it('all fit the field', () => {
    for (const name of COMPANION_NAME_PRESETS) {
      expect(name.length).toBeLessThanOrEqual(COMPANION_NAME_MAX);
    }
  });
});
