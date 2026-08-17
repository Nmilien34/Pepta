import { describe, expect, it } from 'vitest';
import {
  COMPANION_NAME_MAX,
  COMPANION_NAME_PRESETS,
  DEFAULT_COMPANION_NAME,
  companionNameForSave,
  isValidCompanionName,
  surpriseCompanionName,
  SURPRISE_POOL,
  COMPANION_CHIP_NAMES,
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

describe('surpriseCompanionName', () => {
  it('never hands back a name already on screen as a chip', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999, 1]) {
      const picked = surpriseCompanionName('Pep', new Set(), roll);
      expect(COMPANION_CHIP_NAMES as readonly string[]).not.toContain(picked);
      expect(SURPRISE_POOL).toContain(picked);
    }
  });

  it('never repeats the current pick', () => {
    for (const roll of [0, 0.4, 0.999]) {
      expect(surpriseCompanionName('Waffle', new Set(), roll)).not.toBe('Waffle');
    }
  });

  it('walks the whole pool before repeating anything', () => {
    // The point of the bag: rolling repeatedly meets every name once. With
    // replacement you get Waffle, Waffle, Bean and it reads as a bug.
    const seen = new Set<string>();
    let current = 'Pep';
    for (let i = 0; i < SURPRISE_POOL.length; i += 1) {
      const picked = surpriseCompanionName(current, seen, 0);
      expect(seen.has(picked)).toBe(false);
      seen.add(picked);
      current = picked;
    }
    expect(seen.size).toBe(SURPRISE_POOL.length);
  });

  it('refills once the bag is empty rather than giving up', () => {
    const everything = new Set(SURPRISE_POOL);
    const picked = surpriseCompanionName('Pep', everything, 0.5);
    expect(SURPRISE_POOL).toContain(picked);
  });

  it('still refuses the current name when the bag refills', () => {
    const everything = new Set(SURPRISE_POOL);
    for (const roll of [0, 0.5, 0.999]) {
      expect(surpriseCompanionName('Bean', everything, roll)).not.toBe('Bean');
    }
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
