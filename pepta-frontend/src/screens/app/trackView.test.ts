import { describe, expect, it } from 'vitest';
import type { DoseLogResponse } from '@pepta/shared';
import {
  compoundIconName,
  rotationReason,
  compoundStatusLabel,
  formatDoseAmount,
  formatDoseRelative,
  formatNextDoseAt,
  siteLabel,
  sideEffectSummary,
  sideEffectTypeLabel,
  sortDoses,
  sortSideEffects,
  suggestNextSite,
  usedSites,
  compoundLine,
  cadenceLabel,
} from './trackView';
import type { SideEffectLogResponse } from '@pepta/shared';

const now = new Date(2026, 5, 22); // Jun 22 2026

function dose(partial: Partial<DoseLogResponse>): DoseLogResponse {
  return {
    id: 'd',
    userId: 'u',
    compoundId: 'c',
    amount: 5,
    unit: 'mg',
    datetime: '2026-06-20T20:00:00.000Z',
    deletedAt: null,
    createdAt: '2026-06-20T20:00:00.000Z',
    updatedAt: '2026-06-20T20:00:00.000Z',
    ...partial,
  } as DoseLogResponse;
}

describe('siteLabel', () => {
  it('formats region + side', () => {
    expect(siteLabel('abdomen_left')).toBe('Left Abdomen');
    expect(siteLabel('buttock_right')).toBe('Right Glute');
  });
});

describe('sortDoses', () => {
  it('drops deleted and sorts newest first', () => {
    const doses = [
      dose({ id: 'a', datetime: '2026-06-10T00:00:00.000Z' }),
      dose({ id: 'b', datetime: '2026-06-20T00:00:00.000Z' }),
      dose({ id: 'c', datetime: '2026-06-15T00:00:00.000Z', deletedAt: '2026-06-16T00:00:00.000Z' }),
    ];
    expect(sortDoses(doses).map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('usedSites + suggestNextSite', () => {
  it('tracks used sites and rotates to a fresh one', () => {
    const doses = [
      dose({ datetime: '2026-06-20T00:00:00.000Z', injectionSite: 'abdomen_left' }),
      dose({ datetime: '2026-06-13T00:00:00.000Z', injectionSite: 'abdomen_right' }),
    ];
    expect(usedSites(doses).has('abdomen_left')).toBe(true);
    // Both abdomen sites used → suggestion should be a never-used site.
    expect(['arm_left', 'arm_right', 'thigh_left', 'thigh_right', 'buttock_left', 'buttock_right'])
      .toContain(suggestNextSite(doses));
  });

  it('defaults to abdomen_left with no history', () => {
    expect(suggestNextSite([])).toBe('abdomen_left');
  });
});

describe('formatDoseRelative', () => {
  it('uses relative words for the past week', () => {
    expect(formatDoseRelative('2026-06-22T08:00:00.000Z', now)).toBe('Today');
    expect(formatDoseRelative('2026-06-21T08:00:00.000Z', now)).toBe('Yesterday');
    expect(formatDoseRelative('2026-06-19T08:00:00.000Z', now)).toBe('3 days ago');
  });
});

describe('formatDoseAmount', () => {
  it('joins amount + unit', () => {
    expect(formatDoseAmount({ amount: 5, unit: 'mg' })).toBe('5 mg');
  });
});

describe('side effects', () => {
  function se(partial: Partial<SideEffectLogResponse>): SideEffectLogResponse {
    return {
      id: 's',
      userId: 'u',
      types: ['nausea'],
      severity: 2,
      datetime: '2026-06-20T12:00:00.000Z',
      deletedAt: null,
      createdAt: '2026-06-20T12:00:00.000Z',
      updatedAt: '2026-06-20T12:00:00.000Z',
      ...partial,
    } as SideEffectLogResponse;
  }

  it('labels and summarizes types', () => {
    expect(sideEffectTypeLabel('injection_site_reaction')).toBe('Injection Site Reaction');
    expect(sideEffectSummary({ types: ['nausea', 'fatigue'], customType: 'Metallic taste' })).toBe(
      'Nausea · Fatigue · Metallic taste',
    );
  });

  it('drops deleted and sorts newest first', () => {
    const logs = [
      se({ id: 'a', datetime: '2026-06-10T00:00:00.000Z' }),
      se({ id: 'b', datetime: '2026-06-19T00:00:00.000Z' }),
      se({ id: 'c', datetime: '2026-06-15T00:00:00.000Z', deletedAt: '2026-06-16T00:00:00.000Z' }),
    ];
    expect(sortSideEffects(logs).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('formats the next-dose datetime in 12h time', () => {
    expect(formatNextDoseAt('2026-06-27T20:00:00')).toBe('Sat, Jun 27 · 8:00 PM');
    expect(formatNextDoseAt('2026-06-27T00:05:00')).toBe('Sat, Jun 27 · 12:05 AM');
    expect(formatNextDoseAt('not-a-date')).toBe('—');
  });

  it('picks compound icon by route then drug class', () => {
    expect(compoundIconName({ route: 'oral', drugClass: 'glp_1' })).toBe('pill');
    expect(compoundIconName({ route: 'injection', drugClass: 'peptide' })).toBe('flask');
    expect(compoundIconName({ route: 'injection', drugClass: 'glp_1' })).toBe('needle');
  });

  it('capitalizes the compound status label', () => {
    expect(compoundStatusLabel('active')).toBe('Active');
    expect(compoundStatusLabel('paused')).toBe('Paused');
    expect(compoundStatusLabel('completed')).toBe('Completed');
  });
});

describe('rotationReason', () => {
  it('welcomes a first shot instead of inventing history', () => {
    expect(rotationReason(new Set())).toContain('first');
  });

  it('is truthful about what suggestNextSite guarantees', () => {
    // It prefers a never-used site, else the one used longest ago — so the
    // copy may claim "rested longest", never "safest" or a medical outcome.
    const two = rotationReason(new Set(['abdomen_left', 'thigh_left'] as const));
    expect(two).toContain('2');
    expect(two.toLowerCase()).not.toMatch(/safe|prevent|avoid|damage/);
  });

  it('does not say "your last 1"', () => {
    expect(rotationReason(new Set(['abdomen_left'] as const))).not.toContain('last 1');
  });
});

describe('the line under a compound name', () => {
  it('is the frame\'s three facts, in its order', () => {
    expect(
      compoundLine(
        { plannedDose: 5, doseUnit: 'mg', halfLifeDays: 5 },
        { frequency: 'weekly' },
      ),
    ).toBe('5 mg · weekly · half-life 5d');
  });

  it('omits a half-life the compound does not have', () => {
    // The frame's own second compound. This used to render the literal
    // "half-life d" — halfLifeDays is nullish, and nothing checked.
    expect(
      compoundLine({ plannedDose: 250, doseUnit: 'mcg', halfLifeDays: null }, { frequency: 'daily' }),
    ).toBe('250 mcg · daily');
  });

  it('omits the cadence when nothing is scheduled', () => {
    expect(compoundLine({ plannedDose: 5, doseUnit: 'mg', halfLifeDays: 5 }, null)).toBe(
      '5 mg · half-life 5d',
    );
  });

  it('falls back to the unit when no dose is planned', () => {
    expect(compoundLine({ doseUnit: 'mg', halfLifeDays: 7 }, { frequency: 'weekly' })).toBe(
      'mg · weekly · half-life 7d',
    );
  });

  it('says a custom cadence as its interval, never the word "custom"', () => {
    expect(cadenceLabel({ frequency: 'custom', intervalDays: 10 })).toBe('every 10 days');
    expect(cadenceLabel({ frequency: 'custom' })).toBe('');
  });

  it('spells biweekly out — "every 2 weeks" is not misread as twice a week', () => {
    expect(cadenceLabel({ frequency: 'biweekly' })).toBe('every 2 weeks');
  });

  it('never leaves a dangling separator, whatever is missing', () => {
    const cases = [
      compoundLine({ doseUnit: 'mg' }, null),
      compoundLine({ doseUnit: 'mg', halfLifeDays: 5 }, null),
      compoundLine({ plannedDose: 1, doseUnit: 'mg' }, { frequency: 'custom' }),
    ];
    for (const line of cases) {
      expect(line).not.toMatch(/·\s*$/);
      expect(line).not.toMatch(/·\s*·/);
    }
  });
});
