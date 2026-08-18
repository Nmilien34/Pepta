// Oral compounds must never render a medication-level curve (2026-08-07):
// the engine has no absorption model, so a daily tablet superimposes into a
// number with no physical meaning. Suppression is PER-COMPOUND — a user on
// both an injectable and an oral keeps the full curve for the injectable.

import { describe, expect, it } from 'vitest';
import type { HomeResponse, MedicationLevelResponse } from '@pepta/shared';
import {
  LEVEL_SUPPRESSION_COPY,
  doseNoun,
  levelSuppressionFor,
  resolveLevelView,
} from './levelSuppression';
import { buildHomeView } from './homeView';
import { buildPepMood, moodNoteFor } from './pepMood';
import { buildPepReminderNotificationCopy } from './pepPriorities';
import { buildGettingStarted } from './planView';
import { deriveReminderGroups } from './reminderSettings';

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
    curve: Array.from({ length: 8 }, (_, i) => ({ datetime: `2026-08-0${i + 1}T00:00:00.000Z`, level: 30 + i })),
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

// Route-aware dose wording (2026-08-10). The helper is dumb on purpose so the
// later full sweep extends it rather than inventing a second pattern.
describe('doseNoun', () => {
  it('oral says dose, injection says shot', () => {
    expect(doseNoun('oral')).toBe('dose');
    expect(doseNoun('injection')).toBe('shot');
  });

  it('missing/undefined route reads as injection — never guess oral', () => {
    expect(doseNoun(undefined)).toBe('shot');
    expect(doseNoun(null)).toBe('shot');
    expect(doseNoun('')).toBe('shot');
  });
});

describe('reminder titles', () => {
  const homeFor = (compound: object) =>
    ({
      activeCompounds: [compound],
      medicationLevels: [],
      nextDose: { compoundId: 'c1', compoundName: 'X', nextDoseAt: '2026-08-11T13:00:00.000Z', hoursUntilNextDose: 5 },
      profile: null,
      insights: [],
      streakDays: 0,
      todayCalories: 0,
      todayProteinGrams: 0,
      todayFiberGrams: 0,
      todayWaterOz: 0,
      latestWeight: null,
    }) as unknown as HomeResponse;

  it('an ORAL compound gets dose wording in both reminder titles', () => {
    const home = homeFor({ id: 'c1', name: 'Foundayo', route: 'oral', doseUnit: 'mg', halfLifeDays: 1 });
    expect(buildPepReminderNotificationCopy('dose_due', home)!.title).toBe('Pep: dose time');
    const checkin = buildPepReminderNotificationCopy('post_dose_checkin', home)!;
    expect(checkin.title).toBe('Pep: post-dose check-in');
    // The body must agree with its own title.
    expect(checkin.body).toContain('after a dose');
    expect(checkin.body).not.toContain('shot');
  });

  it('an INJECTION compound keeps today’s titles byte-identical', () => {
    const home = homeFor({ id: 'c1', name: 'Tirzepatide', route: 'injection', doseUnit: 'mg', halfLifeDays: 5 });
    expect(buildPepReminderNotificationCopy('dose_due', home)!.title).toBe('Pep: shot time');
    const checkin = buildPepReminderNotificationCopy('post_dose_checkin', home)!;
    expect(checkin.title).toBe('Pep: post-shot check-in');
    expect(checkin.body).toBe(
      "Quick read for me: appetite, side effects, water, and protein. The first day after a shot is useful data.",
    );
  });

  it('route-undefined is identical to injection', () => {
    const home = homeFor({ id: 'c1', name: 'Legacy', doseUnit: 'mg', halfLifeDays: 5 });
    expect(buildPepReminderNotificationCopy('dose_due', home)!.title).toBe('Pep: shot time');
    expect(buildPepReminderNotificationCopy('post_dose_checkin', home)!.title).toBe('Pep: post-shot check-in');
  });

  it('non-dose reminders are untouched', () => {
    const home = homeFor({ id: 'c1', name: 'Foundayo', route: 'oral', doseUnit: 'mg', halfLifeDays: 1 });
    expect(buildPepReminderNotificationCopy('protein_anchor', home)!.title).toBe('Pep: protein checkpoint');
    expect(buildPepReminderNotificationCopy('weekly_weigh_in', home)!.title).toBe('Pep: scale check');
  });
});

// Audit finding 1 follow-through (2026-08-11): an unmodelled compound has no
// curve, but it DOES have a schedule — so the countdown, the dose reminder and
// the getting-started task must all work for it.
describe('unmodelled compounds still schedule', () => {
  const UNMODELLED = { id: 'c1', name: 'Foundayo', route: 'oral', doseUnit: 'mg', halfLifeDays: null };
  const homeWithNextDose = (compound: object) =>
    ({
      activeCompounds: [compound],
      medicationLevels: [], // backend correctly omits the curve
      nextDose: {
        compoundId: 'c1',
        compoundName: 'Foundayo',
        nextDoseAt: '2026-08-11T13:00:00.000Z',
        hoursUntilNextDose: 5,
      },
      profile: { medicationStatus: 'active' },
      insights: [],
      streakDays: 0,
      todayCalories: 0,
      todayProteinGrams: 0,
      todayFiberGrams: 0,
      todayWaterOz: 0,
      latestWeight: null,
      setupProgress: { loggedItems: 2, required: 3, unlocked: false },
    }) as unknown as HomeResponse;

  it('the level stays suppressed — no curve is resurrected', () => {
    const view = buildHomeView(homeWithNextDose(UNMODELLED));
    expect(view.medication).toBeNull();
    expect(view.levelSuppressed).toBe('oral');
  });

  it('but the countdown renders from nextDose', () => {
    const view = buildHomeView(homeWithNextDose(UNMODELLED));
    expect(view.medication).toBeNull();
    // formatCountdown consumes home.nextDose.hoursUntilNextDose, which no
    // longer depends on the level list existing.
    expect(homeWithNextDose(UNMODELLED).nextDose?.hoursUntilNextDose).toBe(5);
  });

  it('dose_due ARMS off nextDose for an unmodelled compound', () => {
    const groups = deriveReminderGroups({
      home: homeWithNextDose(UNMODELLED),
      track: null,
    });
    const doseDue = groups.flatMap((g) => g.items).find((i) => i.id === 'dose_due')!;
    expect(doseDue.defaultOn).toBe(true);
    expect(doseDue.schedule).not.toEqual({ kind: 'none' });
    // …and it says "dose", not "shot", for a pill.
    expect(doseDue.notification?.title).toBe('Pep: dose time');
  });

  it('the getting-started task completes off DOSE LOGS, not the level list', () => {
    const home = homeWithNextDose(UNMODELLED);
    const track = { doseLogs: [{ id: 'd1', deletedAt: null, datetime: '2026-08-10T22:00:00.000Z' }] };
    const before = buildGettingStarted(home).tasks.find((t) => t.key === 'shot')!;
    const after = buildGettingStarted(home, track as never).tasks.find((t) => t.key === 'shot')!;
    expect(before.done).toBe(false); // the old signal: medicationLevels is empty
    expect(after.done).toBe(true); // the dose log is what actually matters
  });

  it('a soft-deleted dose log does not count as logged', () => {
    const track = { doseLogs: [{ id: 'd1', deletedAt: '2026-08-10T23:00:00.000Z', datetime: '2026-08-10T22:00:00.000Z' }] };
    expect(
      buildGettingStarted(homeWithNextDose(UNMODELLED), track as never).tasks.find((t) => t.key === 'shot')!.done,
    ).toBe(false);
  });
});
