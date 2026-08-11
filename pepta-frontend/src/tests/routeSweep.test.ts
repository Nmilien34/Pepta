/**
 * The route sweep's two guarantees, as executable assertions.
 *
 * 1. AN INJECTABLE USER SEES ZERO DRIFT. Every string this sweep touched is
 *    byte-identical for a user whose compounds are all injectable. That is the
 *    whole safety property — the sweep may only ever change what an ORAL user
 *    reads.
 * 2. AN ORAL USER MEETS NO INJECTION LANGUAGE walking the app.
 */

import { describe, expect, it } from 'vitest';
import type { HomeResponse, TrackResponse } from '@pepta/shared';
import { makeHome } from '../mocks/home';
import { buildGettingStarted } from '../screens/app/planView';
import { buildTodaysLog } from '../screens/app/homeExtras';
import { globalDoseNoun, doseNoun, capitalize } from '../screens/app/levelSuppression';
import { buildPeptaReportExportPayload } from '../screens/app/reportExport';
import { findDuplicateCompound } from '../screens/app/addCompound';

const INJECTION_WORDS = /\b(shot|shots|inject\w*|syringe|vial|needle)\b/i;

const compound = (
  id: string,
  name: string,
  route: 'injection' | 'oral',
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    name,
    route,
    doseUnit: 'mg',
    halfLifeDays: route === 'oral' ? 1.6 : 5,
    drugClass: 'glp_1',
    startDate: '2026-08-01',
    status: 'active',
    ...extra,
  }) as never;

const homeWith = (compounds: unknown[]): HomeResponse =>
  makeHome({ activeCompounds: compounds as never });

const track = (doses: unknown[] = []): TrackResponse =>
  ({
    doseLogs: doses,
    mealLogs: [],
    waterLogs: [],
    proteinLogs: [],
    activityLogs: [],
    sideEffectLogs: [],
    measurements: [],
    sectionErrors: {},
  }) as never;

describe('injectable users see zero drift', () => {
  const injectable = homeWith([compound('c1', 'Zepbound', 'injection')]);

  it('keeps the getting-started task wording', () => {
    const task = buildGettingStarted(injectable, null).tasks.find((t) => t.key === 'shot');
    expect(task?.label).toBe('Log your first Zepbound shot');
  });

  it('keeps the unnamed fallback wording', () => {
    const bare = homeWith([compound('c1', '', 'injection')]);
    const task = buildGettingStarted(bare, null).tasks.find((t) => t.key === 'shot');
    // Falls back to the global rule, which is "shot" for an all-injectable user.
    expect(task?.label).toMatch(/shot/);
  });

  it('keeps "shot" as the global noun', () => {
    expect(globalDoseNoun(injectable.activeCompounds)).toBe('shot');
    expect(capitalize(globalDoseNoun(injectable.activeCompounds))).toBe('Shot');
  });

  it('keeps the dose-chip fallback label', () => {
    const chips = buildTodaysLog(
      track([{ id: 'd1', compoundId: 'unknown', datetime: new Date().toISOString(), deletedAt: null }]),
      injectable,
      new Date(),
    );
    expect(chips.find((c) => c.kind === 'shot')?.label).toBe('Shot');
  });

  it('treats a missing route as injection — never guesses oral', () => {
    expect(doseNoun(undefined)).toBe('shot');
    expect(doseNoun(null)).toBe('shot');
    expect(globalDoseNoun([{ route: undefined }])).toBe('shot');
    expect(globalDoseNoun([])).toBe('shot');
  });

  it('keeps every medication level in the export', () => {
    const home = makeHome({
      activeCompounds: [compound('c1', 'Zepbound', 'injection')] as never,
      medicationLevels: [{ compoundId: 'c1', compoundName: 'Zepbound', curve: [] }] as never,
    });
    const payload = buildPeptaReportExportPayload({ home, track: track(), progress: null });
    expect(payload.summary.medicationLevels).toHaveLength(1);
  });
});

describe('oral users meet no injection language', () => {
  const oral = homeWith([compound('c1', 'Foundayo', 'oral')]);

  it('getting started asks for a dose, not a shot', () => {
    const task = buildGettingStarted(oral, null).tasks.find((t) => t.key === 'shot');
    expect(task?.label).toBe('Log your first Foundayo dose');
    expect(task?.label).not.toMatch(INJECTION_WORDS);
  });

  it('the global noun is neutral', () => {
    expect(globalDoseNoun(oral.activeCompounds)).toBe('dose');
    expect(capitalize(globalDoseNoun(oral.activeCompounds))).toBe('Dose');
  });

  it('the dose-chip fallback is neutral', () => {
    const chips = buildTodaysLog(
      track([{ id: 'd1', compoundId: 'unknown', datetime: new Date().toISOString(), deletedAt: null }]),
      oral,
      new Date(),
    );
    expect(chips.find((c) => c.kind === 'shot')?.label).toBe('Dose');
  });

  it('the export drops the meaningless oral level curve', () => {
    // The backend still computes one (Foundayo has a half-life); the screens
    // refuse to draw it, and a document handed to a prescriber must agree.
    const home = makeHome({
      activeCompounds: [compound('c1', 'Foundayo', 'oral')] as never,
      medicationLevels: [{ compoundId: 'c1', compoundName: 'Foundayo', curve: [] }] as never,
    });
    const payload = buildPeptaReportExportPayload({ home, track: track(), progress: null });
    expect(payload.summary.medicationLevels).toHaveLength(0);
  });
});

describe('mixed-route users', () => {
  // Vickie's real shape: Compounded tirzepatide + Foundayo.
  const mixed = homeWith([
    compound('c1', 'Compounded tirzepatide', 'injection'),
    compound('c2', 'Foundayo', 'oral'),
  ]);

  it('uses neutral language for strings that belong to no single compound', () => {
    expect(globalDoseNoun(mixed.activeCompounds)).toBe('dose');
  });

  it('still uses each compound’s own noun where a compound is named', () => {
    expect(doseNoun('injection')).toBe('shot');
    expect(doseNoun('oral')).toBe('dose');
  });

  it('keeps the injectable’s level in the export while dropping the oral one', () => {
    const home = makeHome({
      activeCompounds: mixed.activeCompounds,
      medicationLevels: [
        { compoundId: 'c1', compoundName: 'Compounded tirzepatide', curve: [] },
        { compoundId: 'c2', compoundName: 'Foundayo', curve: [] },
      ] as never,
    });
    const payload = buildPeptaReportExportPayload({ home, track: track(), progress: null });
    expect(payload.summary.medicationLevels.map((l) => l.compoundId)).toEqual(['c1']);
  });
});

describe('D1 prevention — the duplicate warning', () => {
  const existing = [
    { name: 'Zepbound', route: 'injection' },
    { name: 'Foundayo', route: 'oral' },
  ];

  it('matches on the same normalization the detector uses', () => {
    expect(findDuplicateCompound(existing, '  zepbound ', 'injection')?.name).toBe('Zepbound');
    expect(findDuplicateCompound(existing, 'ZEPBOUND', 'injection')).not.toBeNull();
  });

  it('does not warn across routes — oral and injectable are different drugs', () => {
    expect(findDuplicateCompound(existing, 'Zepbound', 'oral')).toBeNull();
  });

  it('does not warn on a genuinely new medication', () => {
    expect(findDuplicateCompound(existing, 'Wegovy', 'injection')).toBeNull();
  });

  it('ignores an empty name', () => {
    expect(findDuplicateCompound(existing, '   ', 'injection')).toBeNull();
  });
});
