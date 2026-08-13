import { describe, expect, it } from 'vitest';
import {
  MEDICATION_CATALOG,
  filterMedicationsByRoute,
  searchMedications,
  type MedicationOption,
} from './medicationCatalog';

const names = (items: readonly MedicationOption[]) => items.map((i) => i.name);

describe('filterMedicationsByRoute', () => {
  it('"all" is the whole catalog, untouched', () => {
    expect(names(filterMedicationsByRoute(MEDICATION_CATALOG, 'all'))).toEqual(
      names(MEDICATION_CATALOG),
    );
  });

  it('narrows the list for a pill user', () => {
    const oral = filterMedicationsByRoute(MEDICATION_CATALOG, 'oral');
    expect(oral.length).toBeLessThan(MEDICATION_CATALOG.length);
    expect(names(oral)).toContain('Rybelsus');
    expect(names(oral)).toContain('Foundayo');
    // No branded injectable should survive an oral filter.
    expect(names(oral)).not.toContain('Zepbound');
    expect(names(oral)).not.toContain('Ozempic');
  });

  it('narrows the list for an injection user', () => {
    const injection = filterMedicationsByRoute(MEDICATION_CATALOG, 'injection');
    expect(names(injection)).toContain('Zepbound');
    expect(names(injection)).not.toContain('Rybelsus');
    expect(names(injection)).not.toContain('Wegovy Pill');
  });

  it('keeps routeAmbiguous medications under BOTH filters', () => {
    // The flag means the route is genuinely undetermined — compounded meds
    // come as injections or as oral drops/troches — so excluding them from
    // either list would hide a legitimate answer.
    for (const filter of ['injection', 'oral'] as const) {
      const kept = names(filterMedicationsByRoute(MEDICATION_CATALOG, filter));
      for (const ambiguous of MEDICATION_CATALOG.filter((i) => i.routeAmbiguous)) {
        expect(kept).toContain(ambiguous.name);
      }
    }
  });

  it('always leaves the escape hatch reachable', () => {
    // No filter may produce a list with no way out, or the user's next move is
    // to invent a medication we then have to chase down with a data-health card.
    for (const filter of ['all', 'injection', 'oral'] as const) {
      expect(filterMedicationsByRoute(MEDICATION_CATALOG, filter).some((i) => i.id === 'other')).toBe(
        true,
      );
    }
  });

  it('never returns an empty list', () => {
    for (const filter of ['all', 'injection', 'oral'] as const) {
      expect(filterMedicationsByRoute(MEDICATION_CATALOG, filter).length).toBeGreaterThan(0);
    }
  });

  it('puts pinned-route medications ahead of the ambiguous tail', () => {
    // A pill user should meet their four real options before "Compounded…".
    const oral = filterMedicationsByRoute(MEDICATION_CATALOG, 'oral');
    const firstAmbiguous = oral.findIndex((i) => i.routeAmbiguous === true);
    const lastPinned = oral.map((i) => i.routeAmbiguous === true).lastIndexOf(false);
    expect(firstAmbiguous).toBeGreaterThan(lastPinned);
  });

  it('preserves catalog order within a filter', () => {
    const oral = filterMedicationsByRoute(MEDICATION_CATALOG, 'oral');
    const catalogOrder = MEDICATION_CATALOG.filter((i) => oral.includes(i));
    expect(names(oral)).toEqual(names(catalogOrder));
  });

  it('does not mutate the catalog', () => {
    const before = names(MEDICATION_CATALOG);
    filterMedicationsByRoute(MEDICATION_CATALOG, 'oral');
    expect(names(MEDICATION_CATALOG)).toEqual(before);
  });
});

describe('search is an escape hatch from the filter', () => {
  it('finds an injectable by name even though a pill filter would hide it', () => {
    // The screen applies search INSTEAD of the filter, never both — so a real
    // medication is always reachable and nobody is pushed into "Something else".
    const filtered = filterMedicationsByRoute(MEDICATION_CATALOG, 'oral');
    expect(names(filtered)).not.toContain('Zepbound');

    const searched = searchMedications(MEDICATION_CATALOG, 'Zepbound');
    expect(names(searched)).toContain('Zepbound');
  });
});
