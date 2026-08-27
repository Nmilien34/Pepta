// The echo chain must not say the same thing twice.
//
// Each case echoes the PREVIOUS answer, so the chain is order-dependent — and
// two of them had drifted into repeating a line the user had just read one or
// two screens earlier. Nick spotted both from the device before any test did.
import { describe, expect, it } from 'vitest';
import { echoFor } from './onboardingEcho';

const NOW = new Date(2026, 7, 27);
const BODY = { units: 'imperial', height: 70, weight: 226 } as const;

describe('the echo chain does not repeat itself', () => {
  // muscleFloor opens with "5'10\", 226 today." Two screens later goalWeight
  // said "226 today. Thanks for trusting me with that." — the same weight,
  // twice, with only startWeight between them.
  it('states the current weight once across the body block', () => {
    const a = {
      journeyStage: 'active', body: BODY, startWeight: 250, goalWeight: 180,
      goalWeightUnit: 'lb',
    } as never;

    const floor = echoFor('muscleFloor', a, NOW) ?? '';
    const goal = echoFor('goalWeight', a, NOW) ?? '';

    expect(floor).toContain('226 today');
    expect(goal).not.toContain('226');
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
  it('does not echo the muscle floor twice when start weight was left default', () => {
    const a = { journeyStage: 'active', body: BODY, goalWeight: 180 } as never;

    const onStart = echoFor('startWeight', a, NOW) ?? '';
    const onGoal = echoFor('goalWeight', a, NOW) ?? '';

    expect(onStart).toContain('Locked in');
    expect(onGoal).not.toBe(onStart);
    expect(onGoal).not.toContain('226');
  });

  it('reads the loss back when they have actually lost weight', () => {
    const a = {
      journeyStage: 'active', body: BODY, startWeight: 250, goalWeight: 180,
    } as never;
    expect(echoFor('goalWeight', a, NOW) ?? '').toContain('Down 24 lb');
  });
});
