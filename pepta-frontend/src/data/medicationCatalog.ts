// Seed medication catalog for onboarding. Mirrors Leanient's local
// `mocks/medications.ts` approach: a typed list the picker renders against until
// the backend exposes the real catalog (`GET /medication-catalog` →
// MedicationCatalogItem[]), at which point this is swapped for a fetch.
//
// `route` and `commonDoses` are frontend-only (not yet in the @pepta/shared
// compound schema) and drive later gating (oral hides injection-site) + the dose
// chips screen. `halfLifeDays` here are placeholder clinical values; the backend
// owns the real numbers used for medication-level estimates.

import type { DoseUnit, DrugClass } from '@pepta/shared';

export interface MedicationOption {
  id: string;
  name: string;
  subtitle: string;
  drugClass: DrugClass;
  doseUnit: DoseUnit;
  /** null = not modelled (server may say so); clients suppress the curve. */
  halfLifeDays: number | null;
  route: 'injection' | 'oral';
  // True when this pick doesn't pin the route (compounded/other meds come as
  // injections OR oral drops/troches) — onboarding then asks the user directly.
  routeAmbiguous?: boolean;
  commonDoses: number[];
  kind: 'brand' | 'oral' | 'compound' | 'other';
  initial?: string;
  tintColor: string;
}

export const MEDICATION_CATALOG: readonly MedicationOption[] = [
  {
    id: 'mounjaro',
    name: 'Mounjaro',
    subtitle: 'Tirzepatide · injection',
    drugClass: 'dual_glp_1_gip',
    doseUnit: 'mg',
    halfLifeDays: 5,
    route: 'injection',
    commonDoses: [2.5, 5, 7.5, 10, 12.5, 15],
    kind: 'brand',
    initial: 'M',
    tintColor: '#854F0B',
  },
  {
    id: 'zepbound',
    name: 'Zepbound',
    subtitle: 'Tirzepatide · injection',
    drugClass: 'dual_glp_1_gip',
    doseUnit: 'mg',
    halfLifeDays: 5,
    route: 'injection',
    commonDoses: [2.5, 5, 7.5, 10, 12.5, 15],
    kind: 'brand',
    initial: 'Z',
    tintColor: '#712B13',
  },
  {
    id: 'ozempic',
    name: 'Ozempic',
    subtitle: 'Semaglutide · injection',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'injection',
    commonDoses: [0.25, 0.5, 1, 2],
    kind: 'brand',
    initial: 'O',
    tintColor: '#0C447C',
  },
  {
    id: 'wegovy',
    name: 'Wegovy',
    subtitle: 'Semaglutide · injection',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'injection',
    commonDoses: [0.25, 0.5, 1, 1.7, 2.4],
    kind: 'brand',
    initial: 'W',
    tintColor: '#085041',
  },
  {
    id: 'trulicity',
    name: 'Trulicity',
    subtitle: 'Dulaglutide · injection',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 5,
    route: 'injection',
    commonDoses: [0.75, 1.5, 3, 4.5],
    kind: 'brand',
    initial: 'T',
    tintColor: '#5B45C9',
  },
  {
    id: 'saxenda',
    name: 'Saxenda',
    subtitle: 'Liraglutide · daily injection',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    // ~13h — the only DAILY injectable here. A weekly half-life would draw a
    // completely wrong level curve.
    halfLifeDays: 0.54,
    route: 'injection',
    commonDoses: [0.6, 1.2, 1.8, 2.4, 3],
    kind: 'brand',
    tintColor: '#B4531C',
  },
  {
    id: 'victoza',
    name: 'Victoza',
    subtitle: 'Liraglutide · daily injection',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 0.54,
    route: 'injection',
    commonDoses: [0.6, 1.2, 1.8],
    kind: 'brand',
    tintColor: '#7A3E9D',
  },
  {
    id: 'rybelsus',
    name: 'Rybelsus',
    // Molecule names live in the subtitle because search matches name+subtitle
    // — someone who only knows "semaglutide" still finds their brand.
    subtitle: 'Semaglutide · daily pill',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'oral',
    commonDoses: [3, 7, 14],
    kind: 'oral',
    tintColor: '#A8327D',
  },
  // The oral shelf. Three names people actually type, two molecules:
  // Rybelsus (diabetes brand) and Wegovy Pill (weight-loss brand) are both
  // semaglutide; Foundayo is orforglipron, a different molecule entirely.
  {
    id: 'wegovy_pill',
    name: 'Wegovy Pill',
    subtitle: 'Semaglutide · daily pill',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'oral',
    commonDoses: [1.5, 4, 9, 25],
    kind: 'oral',
    tintColor: '#7B4BC9',
  },
  {
    id: 'foundayo',
    name: 'Foundayo',
    subtitle: 'Orforglipron · daily pill',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 1.6,
    route: 'oral',
    commonDoses: [0.8, 2.5, 5.5, 9, 14.5, 17.2],
    kind: 'oral',
    tintColor: '#2F7DBF',
  },
  {
    id: 'oral_semaglutide',
    name: 'Oral semaglutide',
    subtitle: 'Semaglutide · generic oral',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'oral',
    commonDoses: [3, 7, 14],
    kind: 'oral',
    tintColor: '#9A4FB5',
  },
  {
    id: 'compounded_tirzepatide',
    name: 'Compounded tirzepatide',
    subtitle: 'Custom dose',
    drugClass: 'dual_glp_1_gip',
    doseUnit: 'mg',
    halfLifeDays: 5,
    route: 'injection',
    routeAmbiguous: true,
    commonDoses: [],
    kind: 'compound',
    tintColor: '#0F6E56',
  },
  {
    id: 'compounded_semaglutide',
    name: 'Compounded semaglutide',
    subtitle: 'Custom dose',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'injection',
    routeAmbiguous: true,
    commonDoses: [],
    kind: 'compound',
    tintColor: '#1E8E40',
  },
  {
    id: 'research_peptide',
    name: 'Research peptide',
    subtitle: 'Other compound',
    drugClass: 'peptide',
    doseUnit: 'mcg',
    halfLifeDays: 1,
    route: 'injection',
    routeAmbiguous: true,
    commonDoses: [],
    kind: 'other',
    tintColor: '#5F5E5A',
  },
  {
    id: 'other',
    name: 'Something else',
    subtitle: 'Not listed here',
    drugClass: 'other',
    doseUnit: 'mg',
    halfLifeDays: 7,
    route: 'injection',
    routeAmbiguous: true,
    commonDoses: [],
    kind: 'other',
    tintColor: '#5F5E5A',
  },
];

// Pure, testable search: matches name or subtitle, case-insensitive. Empty query
// returns the full catalog.
export function searchMedications(
  catalog: readonly MedicationOption[],
  query: string,
): MedicationOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...catalog];
  return catalog.filter(
    (item) => item.name.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
  );
}

/** Browse filter on the medication picker. Not a route answer — see below. */
export type MedicationRouteFilter = 'all' | 'injection' | 'oral';

/**
 * Narrow the browse list by how the medication is taken.
 *
 * A CONVENIENCE, NOT A BOUNDARY. Three rules keep it from ever becoming a dead
 * end that pushes someone into "Something else" — which is the junk-record path
 * the data-health D3 detector exists to clean up:
 *
 *  1. Search ignores this entirely (see MedicationPickerScreen): typing a real
 *     medication's name always finds it, whatever the filter says.
 *  2. routeAmbiguous entries appear under EVERY filter. The flag means the
 *     route is genuinely undetermined — compounded meds come as injections or
 *     as oral drops/troches — so excluding them from either list would hide a
 *     legitimate answer. They sort last in the catalog, so the medications
 *     whose route IS pinned still come first.
 *  3. It never touches compound.route. The route still comes from the picked
 *     catalog entry, or from the route question for ambiguous ones. This is why
 *     an "all" option is safe here where "Not sure" was not safe on the route
 *     question (2026-08-10): declining to narrow a list stores nothing.
 */
export function filterMedicationsByRoute(
  items: readonly MedicationOption[],
  filter: MedicationRouteFilter,
): MedicationOption[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => item.routeAmbiguous === true || item.route === filter);
}
