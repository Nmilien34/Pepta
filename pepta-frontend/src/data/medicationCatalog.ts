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
  halfLifeDays: number;
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
    id: 'rybelsus',
    name: 'Rybelsus',
    subtitle: 'Oral · daily pill',
    drugClass: 'glp_1',
    doseUnit: 'mg',
    halfLifeDays: 1,
    route: 'oral',
    commonDoses: [3, 7, 14],
    kind: 'oral',
    tintColor: '#A8327D',
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
