// Oral compounds must never render a medication-level curve (2026-08-07):
// the engine has no absorption model, so a daily tablet superimposes into a
// number with no physical meaning. Suppression is PER-COMPOUND — a user on
// both an injectable and an oral keeps the full curve for the injectable.

import { describe, expect, it } from 'vitest';
import type { HomeResponse, MedicationLevelResponse } from '@pepta/shared';
import {
  LEVEL_SUPPRESSION_COPY,
  levelSuppressionFor,
  resolveLevelView,
} from './levelSuppression';
import { buildHomeView } from './homeView';
import { buildPepMood, moodNoteFor } from './pepMood';

const ORAL = { id: 'oral-1', name: 'Rybelsus', route: 'oral', doseUnit: 'mg', halfLifeDays: 7 };
const INJECTION = { id: 'inj-1', name: 'Tirzepatide', route: 'injection', doseUnit: 'mg', halfLifeDays: 5 };
const NO_ROUTE = { id: 'legacy-1', name: 'Legacy', doseUnit: 'mg', halfLifeDays: 5 };

function level(compoundId: string, overrides: Partial<MedicationLevelResponse> = {}) {
  return {
    compoundId,
    compoundName: 'X',
    currentEstimate: 31.2,
    peakEstimate: 34,
    troughEstimate: 30,
    curve: Array.from({ length: 8 }, (_, i) => ({ at: `2026-08-0${i + 1}T00:00:00.000Z`, level: 30 + i })),
    nextDoseAt: null,
    hoursUntilNextDose: null,
    estimateBasis: 'relative-dose-equivalent',
    engineVersion: 'pk-v2',
    ...overrides,
  } as unknown as MedicationLevelResponse;
}

function home(compounds: object[], levels: MedicationLevelResponse[]): HomeResponse {
  return {
    activeCompounds: compounds,
    medicationLevels: levels,
    nextDose: null,
    todayCalories: 0,
    todayProteinGrams: 0,
    todayFiberGrams: 0,
    todayWaterOz: 0,
    latestWeight: null,
    profile: null,
    insights: [],
    streakDays: 0,
  } as unknown as HomeResponse;
}

describe('levelSuppressionFor', () => {
  it('suppresses oral', () => {
    expect(levelSuppressionFor(ORAL)).toBe('oral');
  });

  it('suppresses a compound with no half-life', () => {
    expect(levelSuppressionFor({ route: 'injection', halfLifeDays: null })).toBe('unmodeled');
  });

  it('cites the ORAL reason when a compound is both', () => {
    expect(levelSuppressionFor({ route: 'oral', halfLifeDays: null })).toBe('oral');
  });

  it('never suppresses an injectable with a half-life, or a route-undefined one', () => {
    expect(levelSuppressionFor(INJECTION)).toBeNull();
    expect(levelSuppressionFor(NO_ROUTE)).toBeNull();
  });
});

describe('resolveLevelView', () => {
  it('an ORAL user gets no level and the oral reason', () => {
    const view = resolveLevelView(home([ORAL], [level('oral-1')]));
    expect(view.level).toBeNull();
    expect(view.suppressed).toBe('oral');
  });

  it('an INJECTABLE user is untouched', () => {
    const view = resolveLevelView(home([INJECTION], [level('inj-1')]));
    expect(view.level).not.toBeNull();
    expect(view.suppressed).toBeNull();
  });

  it('route-undefined behaves exactly like injection', () => {
    const view = resolveLevelView(home([NO_ROUTE], [level('legacy-1')]));
    expect(view.level).not.toBeNull();
    expect(view.suppressed).toBeNull();
  });

  it('MIXED user: the injectable keeps its curve even when the oral is listed first', () => {
    const view = resolveLevelView(home([ORAL, INJECTION], [level('oral-1'), level('inj-1')]));
    expect(view.level?.compoundId).toBe('inj-1');
    expect(view.suppressed).toBeNull();
  });

  it('MIXED user whose injectable has no doses yet gets the NORMAL empty state, not a suppression claim', () => {
    // The injectable could still produce a curve — telling them oral levels
    // aren't supported would be answering a question they didn't ask.
    const view = resolveLevelView(home([ORAL, INJECTION], [level('oral-1')]));
    expect(view.level).toBeNull();
    expect(view.suppressed).toBeNull();
  });

  it('no compounds at all → no suppression claim', () => {
    expect(resolveLevelView(home([], [])).suppressed).toBeNull();
  });
});

describe('level surfaces', () => {
  it('Home: an oral user gets no number, no bars, no Peaking/Low pill', () => {
    const view = buildHomeView(home([ORAL], [level('oral-1')]));
    expect(view.medication).toBeNull(); // kills estimate, bars AND status pill
    expect(view.levelSuppressed).toBe('oral');
    expect(LEVEL_SUPPRESSION_COPY[view.levelSuppressed!]).toBe(
      'Level tracking isn’t available for oral medications yet.',
    );
  });

  it('Home: an injectable user keeps the number, bars and pill', () => {
    const view = buildHomeView(home([INJECTION], [level('inj-1')]));
    expect(view.medication).not.toBeNull();
    expect(view.medication!.bars.length).toBeGreaterThan(0);
    expect(view.medication!.status).toBeTruthy();
    expect(view.levelSuppressed).toBeNull();
  });

  it('Home: a mixed user renders the injectable simultaneously with oral suppression', () => {
    const view = buildHomeView(home([ORAL, INJECTION], [level('oral-1'), level('inj-1')]));
    expect(view.medication).not.toBeNull();
    expect(view.levelSuppressed).toBeNull();
  });
});

describe('Pep mood', () => {
  it('an oral compound produces NO level-derived mood line — absent, not defaulted', () => {
    const oralHome = home([ORAL], [level('oral-1', { currentEstimate: 30.1 })]);
    const mood = buildPepMood({
      level: resolveLevelView(oralHome).level,
      resting: false,
      milestone: false,
    });
    // The "Shot day is close." line rides the Low state; with no level there
    // is no fraction, so no level-derived line at all.
    expect(mood.line).toBeUndefined();
    expect(moodNoteFor(mood)).toBeNull();
  });

  it('an injectable at a low level still gets its mood line', () => {
    const injHome = home([INJECTION], [level('inj-1', { currentEstimate: 30.1 })]);
    const mood = buildPepMood({
      level: resolveLevelView(injHome).level,
      resting: false,
      milestone: false,
    });
    expect(mood.line).toBeTruthy();
  });
});
