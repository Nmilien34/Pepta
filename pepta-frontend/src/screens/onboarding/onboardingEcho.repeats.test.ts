// The echo chain must not say the same thing twice.
//
// Each case echoes the PREVIOUS answer, so the chain is order-dependent — and
// two of them had drifted into repeating a line the user had just read one or
// two screens earlier. Nick spotted both from the device before any test did.
import { describe, expect, it } from 'vitest';
import { echoFor } from './onboardingEcho';
import { ONBOARDING_STEPS, shouldSkipStep } from './onboardingFlow';

const NOW = new Date(2026, 7, 27);
const BODY = { units: 'imperial', height: 70, weight: 226 } as const;

describe('the echo chain does not repeat itself', () => {
  // muscleFloor USED to open with "5'10\", 226 today." and goalWeight then
  // said "226 today. Thanks for trusting me with that." — the same weight
  // twice. muscleFloor was cut 2026-08-28, so the body line moved to whichever
  // screen now follows height+weight. The repeat is still what is guarded
  // against: exactly one screen in the body block may state the weight.
  it('states the current weight exactly once across the body block', () => {
    const active = {
      journeyStage: 'active', body: BODY, startWeight: 250, goalWeight: 180,
      goalWeightUnit: 'lb',
    } as never;
    const stated = (['heightWeight', 'weightJourney'] as const)
      .map((step) => echoFor(step, active, NOW) ?? '')
      .filter((line) => line.includes('226'));
    expect(stated).toHaveLength(1);

    // And on the path where startWeight is gated out, goalWeight inherits it.
    const exploring = { journeyStage: 'none', body: BODY, goalWeight: 180 } as never;
    const exploringStated = (['heightWeight', 'weightJourney'] as const)
      .map((step) => echoFor(step, exploring, NOW) ?? '')
      .filter((line) => line.includes('226'));
    expect(exploringStated).toHaveLength(1);
  });

  // route and currentDose both returned medEcho(medication) — the identical
  // sentence on two CONSECUTIVE screens for anyone whose medication does not
  // pin its own route.
  it('does not name the medication twice in a row', () => {
    const ambiguous = {
      journeyStage: 'active', route: 'injection',
      medication: { name: 'Semaglutide', doseUnit: 'mg', routeAmbiguous: true },
    } as never;

    const onRoute = echoFor('route', ambiguous, NOW) ?? '';
    const onDose = echoFor('currentDose', ambiguous, NOW) ?? '';

    expect(onRoute).toContain('Semaglutide');
    expect(onDose).not.toBe(onRoute);
  });

  // A branded medication pins its route, so the route screen never runs and
  // currentDose follows medication directly — there the medication line is
  // the correct echo and must survive.
  it('still names the medication when the route turn was skipped', () => {
    const branded = {
      journeyStage: 'active', route: 'injection',
      medication: { name: 'Zepbound', doseUnit: 'mg', routeAmbiguous: false },
    } as never;

    expect(echoFor('currentDose', branded, NOW) ?? '').toContain('Zepbound');
  });

  // The prefilled start weight is accepted by tapping Continue, which never
  // fires the wheel's onChange — so startWeight is undefined on the common
  // path. goalWeight must not fall back to the line startWeight just showed.


  // THE GENERAL GUARD. The two repeats Nick caught by eye were both "the same
  // line twice, one screen apart", and a third appeared the moment goalType
  // moved to step 5 — its echo became journeyEcho, which biggestWorry already
  // opened with. Spotting these by reading the chain does not scale; every
  // reorder can create one.
  //
  // Walks the real flow and asserts no echo repeats the one before it.
  it('never shows the same context line on consecutive screens', () => {
    const a = {
      journeyStage: 'active', route: 'injection', routeLocked: true,
      deviceType: 'auto_injector', frequency: 'weekly', halfLifeDays: 5,
      hasBody: true, sideEffects: ['nausea'], body: BODY,
      goalWeight: 180, goalWeightUnit: 'lb', startWeight: 250,
      medication: { name: 'Zepbound', doseUnit: 'mg', halfLifeDays: 5, routeAmbiguous: false },
      dose: 5, goalType: 'lose_fat', trainingStatus: 'consistent', activityLevel: 'moderate',
    } as never;

    const seen = ONBOARDING_STEPS.filter((s) => !shouldSkipStep(s, a));
    const dupes: string[] = [];
    let previous: string | undefined;
    let previousStep = '';
    for (const step of seen) {
      const line = echoFor(step, a, NOW);
      if (line && previous && (line === previous || line.startsWith(previous))) {
        dupes.push(`${previousStep} -> ${step}: "${line}"`);
      }
      if (line) {
        previous = line;
        previousStep = step;
      }
    }
    expect(dupes).toEqual([]);
  });
});
