import { describe, expect, it } from 'vitest';
import type { DoseLogResponse } from '@pepta/shared';
import {
  formatDoseAmount,
  formatDoseRelative,
  siteLabel,
  sideEffectSummary,
  sideEffectTypeLabel,
  sortDoses,
  sortSideEffects,
  suggestNextSite,
  usedSites,
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
});
