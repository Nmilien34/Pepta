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
