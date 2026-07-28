import { describe, expect, it } from 'vitest';
import { MEDICATION_CATALOG, searchMedications } from './medicationCatalog';

describe('searchMedications', () => {
  it('returns the full catalog for an empty query', () => {
    expect(searchMedications(MEDICATION_CATALOG, '')).toHaveLength(MEDICATION_CATALOG.length);
    expect(searchMedications(MEDICATION_CATALOG, '   ')).toHaveLength(MEDICATION_CATALOG.length);
  });

  it('matches by brand name, case-insensitive', () => {
    const results = searchMedications(MEDICATION_CATALOG, 'moun');
    expect(results.map((r) => r.id)).toEqual(['mounjaro']);
  });

  it('matches by generic in the subtitle', () => {
    const ids = searchMedications(MEDICATION_CATALOG, 'tirzepatide').map((r) => r.id);
    expect(ids).toContain('mounjaro');
    expect(ids).toContain('zepbound');
    expect(ids).toContain('compounded_tirzepatide');
  });

  it('returns nothing for an unmatched query', () => {
    expect(searchMedications(MEDICATION_CATALOG, 'aspirin')).toEqual([]);
  });
});

describe('coverage of approved GLP-1s', () => {
  it('lists every approved GLP-1 brand a user might be on', () => {
    const names = MEDICATION_CATALOG.map((m) => m.name);
    for (const brand of [
      'Ozempic', 'Wegovy', 'Mounjaro', 'Zepbound',
      'Rybelsus', 'Trulicity', 'Saxenda', 'Victoza',
    ]) {
      expect(names).toContain(brand);
    }
  });

  it('models liraglutide as a DAILY drug, not a weekly one', () => {
    // Saxenda/Victoza clear in ~13h. Giving them a weekly half-life would
    // draw a level curve that never comes down — the medication-level
    // estimate would be wrong for every user on them.
    for (const id of ['saxenda', 'victoza']) {
      const med = MEDICATION_CATALOG.find((m) => m.id === id)!;
      expect(med.halfLifeDays).toBeLessThan(1);
      expect(med.route).toBe('injection');
    }
  });

  it('gives every entry a usable half-life', () => {
    for (const med of MEDICATION_CATALOG) {
      expect(med.halfLifeDays).toBeGreaterThan(0);
    }
  });

  it('offers preset doses for brands, and none for custom-dose entries', () => {
    // Compounded and research entries intentionally ship no presets — the
    // strength varies by pharmacy, so suggesting one would be inventing a
    // dose. Those users type their own.
    for (const med of MEDICATION_CATALOG) {
      if (med.kind === 'brand' || med.kind === 'oral') {
        expect(med.commonDoses.length).toBeGreaterThan(0);
      } else {
        expect(med.commonDoses).toEqual([]);
      }
    }
  });
});
