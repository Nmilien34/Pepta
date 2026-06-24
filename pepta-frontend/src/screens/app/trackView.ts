// Pure derivations for the Track tab (mirrors Leanient's doseHistory/doseLogForm
// helpers, adapted to Pepta's DoseLogResponse fields: `datetime`, `amount`,
// `unit`, `deletedAt`). No RN imports → testable.

import type { CompoundResponse, DoseLogResponse, SideEffectLogResponse } from '@pepta/shared';
import { MONTHS_SHORT } from '../../utils/dateParts';

export type InjectionSite = NonNullable<DoseLogResponse['injectionSite']>;

export const FRONT_SITES: InjectionSite[] = [
  'arm_left',
  'arm_right',
  'abdomen_left',
  'abdomen_right',
  'thigh_left',
  'thigh_right',
];
export const BACK_SITES: InjectionSite[] = ['buttock_left', 'buttock_right'];
// Rotation preference (abdomen first — the standard default site), independent
// of the render order above.
const ROTATION_ORDER: InjectionSite[] = [
  'abdomen_left',
  'abdomen_right',
  'thigh_left',
  'thigh_right',
  'arm_left',
  'arm_right',
  'buttock_left',
  'buttock_right',
];

const REGION_LABEL: Record<string, string> = { abdomen: 'Abdomen', thigh: 'Thigh', arm: 'Arm', buttock: 'Glute' };
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function siteLabel(site: InjectionSite): string {
  const [region, side] = site.split('_');
  return `${side === 'left' ? 'Left' : 'Right'} ${REGION_LABEL[region ?? ''] ?? region}`;
}

export function sortDoses(doseLogs: DoseLogResponse[]): DoseLogResponse[] {
  return [...doseLogs]
    .filter((d) => d.deletedAt == null)
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
}

// Sites used across the most recent doses.
export function usedSites(doseLogs: DoseLogResponse[], recent = 6): Set<InjectionSite> {
  const used = new Set<InjectionSite>();
  for (const dose of sortDoses(doseLogs).slice(0, recent)) {
    if (dose.injectionSite) used.add(dose.injectionSite);
  }
  return used;
}

// Auto-rotation: prefer a never-used site, otherwise the one used longest ago.
export function suggestNextSite(doseLogs: DoseLogResponse[]): InjectionSite {
  const lastUsedAt = new Map<InjectionSite, number>();
  for (const dose of sortDoses(doseLogs)) {
    if (dose.injectionSite && !lastUsedAt.has(dose.injectionSite)) {
      lastUsedAt.set(dose.injectionSite, new Date(dose.datetime).getTime());
    }
  }
  let best: InjectionSite = 'abdomen_left';
  let bestScore = Infinity;
  for (const site of ROTATION_ORDER) {
    const score = lastUsedAt.get(site) ?? -Infinity; // never used → most preferred
    if (score < bestScore) {
      bestScore = score;
      best = site;
    }
  }
  return best;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatDoseRelative(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return `${WEEKDAYS_SHORT[d.getDay()] ?? ''}, ${MONTHS_SHORT[d.getMonth()] ?? ''} ${d.getDate()}`;
}

export function formatDoseAmount(dose: Pick<DoseLogResponse, 'amount' | 'unit'>): string {
  return `${dose.amount} ${dose.unit}`;
}

// "Fri, Jun 27 · 8:00 PM" — the next-dose sub-line on the Track screen.
export function formatNextDoseAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const day = `${WEEKDAYS_SHORT[d.getDay()] ?? ''}, ${MONTHS_SHORT[d.getMonth()] ?? ''} ${d.getDate()}`;
  return `${day} · ${h}:${min} ${ampm}`;
}

// Compound visuals (mirrors the lab: GLP-1 → vaccine/purple, peptide → flask/teal,
// oral → pill). Pure so it's unit-testable.
export function compoundIconName(c: Pick<CompoundResponse, 'route' | 'drugClass'>): string {
  if (c.route === 'oral') return 'pill';
  if (c.drugClass === 'peptide') return 'flask';
  return 'needle';
}

export type CompoundStatus = CompoundResponse['status'];

export function compoundStatusLabel(status: CompoundStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Side effects (medication-related, so they live on Track). Drop deleted, newest first.
export function sortSideEffects(logs: SideEffectLogResponse[]): SideEffectLogResponse[] {
  return [...logs]
    .filter((l) => l.deletedAt == null)
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
}

// "injection_site_reaction" → "Injection Site Reaction".
export function sideEffectTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function sideEffectSummary(log: Pick<SideEffectLogResponse, 'types' | 'customType'>): string {
  const labels = log.types.map(sideEffectTypeLabel);
  if (log.customType) labels.push(log.customType);
  return labels.join(' · ');
}
