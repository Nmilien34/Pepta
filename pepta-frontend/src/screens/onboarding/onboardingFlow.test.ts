import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  nextStep,
  prevStep,
  progressForStep,
  shouldSkipStep,
  stepIndex,
  type OnboardingStep,
} from './onboardingFlow';

describe('onboarding flow', () => {
  it('starts at welcome, sits sign-in right before the paywall, ends at welcomeIn', () => {
    expect(ONBOARDING_STEPS[0]).toBe('welcome');
    expect(ONBOARDING_STEPS[1]).toBe('meetPep');
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]).toBe('welcomeIn');
    expect(nextStep('welcome')).toBe('meetPep');
    // The rating ask is post-purchase (WelcomeInScreen), never a quiz turn.
    expect(nextStep('reveal')).toBe('paywall');
    // The referral code turn was removed — auth hands straight to the wall.
    
    expect(nextStep('paywall')).toBe('welcomeIn');
  });

  it('no longer routes anyone through a referral code turn', () => {
    expect(ONBOARDING_STEPS).not.toContain('referral');
  });

  it('never lands on a gated-out step, so per-step analytics cannot log phantom traffic', () => {
    // Mirrors OnboardingNavigator.advanceWith: the skip chain is resolved in a
    // pure walk BEFORE the step state is set, so a skipped step is never the
    // current step and never renders. The instrumentation effect keyed on that
    // state therefore cannot report a screen nobody saw.
    const advanceWith = (
      from: OnboardingStep,
      ctx: Parameters<typeof shouldSkipStep>[1],
    ): OnboardingStep | null => {
      let s = nextStep(from);
      while (s && shouldSkipStep(s, ctx)) s = nextStep(s);
      return s;
    };

    // "Just exploring" gates the widest span (medication picker + dose block).
    const ctx = { journeyStage: 'none' as const };
    const visited: OnboardingStep[] = ['welcome'];
    let current: OnboardingStep | null = 'welcome';

    while (current) {
      current = advanceWith(current, ctx);
      if (current) visited.push(current);
    }

    expect(visited.at(-1)).toBe('welcomeIn');
    visited.forEach((step) => {
      expect(shouldSkipStep(step, ctx)).toBe(false);
    });
    // The gated steps really were excluded (otherwise this proves nothing).
    expect(visited).not.toContain('medication');
    expect(visited).not.toContain('currentDose');
    expect(visited.length).toBeLessThan(ONBOARDING_STEPS.length);
  });

  it('never asks for an App Store rating inside the quiz', () => {
    // Apple caps review prompts per user per year — the ask belongs
    // post-purchase (WelcomeInScreen), not in front of a user who has neither
    // used the tracker nor paid.
    expect(ONBOARDING_STEPS).not.toContain('rateApp');
  });

  it('has no standalone sign-in step — auth lives on the merged reveal', () => {
    // Merged 2026-07-29: the reveal carries the save-your-plan auth block for
    // signed-out users and the plain Start-today CTA for signed-in ones. A
    // separate auth turn reappearing here means the merge regressed.
    expect(ONBOARDING_STEPS).not.toContain('auth');
    expect(nextStep('reveal')).toBe('paywall');
  });

  it('skips the paywall for resolved-active access (creators/subscribers)', () => {
    expect(shouldSkipStep('paywall', { accessActive: true })).toBe(true);
    expect(shouldSkipStep('paywall', {})).toBe(false);
    // welcomeIn still plays for creators.
    expect(shouldSkipStep('welcomeIn', { accessActive: true })).toBe(false);
  });

  it('has no standalone privacy-consent turn (consent rides the welcome CTA)', () => {
    expect(ONBOARDING_STEPS).not.toContain('privacy');
  });

  it('advances forward in order through the new turns', () => {
    expect(nextStep('meetPep')).toBe('nameCompanion');
    expect(nextStep('nameCompanion')).toBe('journeyStage');
    expect(nextStep('deviceType')).toBe('concentration');
    expect(nextStep('frequency')).toBe('leanMass');
    expect(nextStep('leanMass')).toBe('lastShot');
    expect(nextStep('lastShot')).toBe('shotDay');
    expect(nextStep('shotDay')).toBe('shotTime');
    expect(nextStep('shotTime')).toBe('instrument');
    expect(nextStep('goalPace')).toBe('company');
    expect(nextStep('company')).toBe('dailyRoutine');
    expect(nextStep('sideEffects')).toBe('symptomWeek');
    expect(nextStep('symptomWeek')).toBe('needs');
  });

  it('names the problem early: the worry, then the answer, before any dosing', () => {
    // The point of the 2026-07-27 restructure. fearAnswered is the only turn
    // that states a PROBLEM; it sat at step 29 of 36, so anyone who left before
    // it never heard one reason to want this.
    expect(nextStep('journeyStage')).toBe('biggestWorry');
    expect(nextStep('biggestWorry')).toBe('fearAnswered');
    expect(nextStep('fearAnswered')).toBe('medication');
    expect(stepIndex('fearAnswered')).toBeLessThan(stepIndex('currentDose'));
    expect(stepIndex('fearAnswered')).toBeLessThanOrEqual(5);
  });

  it('never runs more than 9 input turns without a payoff', () => {
    // Hand-maintained: a new beat that is NOT listed here scores as an input
    // turn and will fail this test. That is the intended failure — it forces
    // the question "is this really a payoff?" rather than passing silently.
    const BEATS = new Set<string>([
      'welcome', 'meetPep', 'fearAnswered', 'leanMass', 'company', 'instrument', 'symptomWeek',
      'crafting', 'reveal', 'paywall', 'welcomeIn',
    ]);
    const runLength = (steps: readonly string[]) => {
      let run = 0;
      let worst = 0;
      for (const step of steps) {
        run = BEATS.has(step) ? 0 : run + 1;
        worst = Math.max(worst, run);
      }
      return worst;
    };

    // 12 before the 2026-07-27 restructure, 9 after it, 7 once the lean-mass
    // beat split the dosing block. Tighten this whenever it improves — a bound
    // left loose stops catching the regression it was written for.
    expect(runLength(ONBOARDING_STEPS)).toBeLessThanOrEqual(7);

    // The longest run is now the same for everyone: the skip rules shorten the
    // dosing block to nothing, so what a non-dosing user walks is the stretch
    // nobody can escape. Both must stay under the bound.
    const unskippable = ONBOARDING_STEPS.filter(
      (s) => !shouldSkipStep(s, { journeyStage: 'none' }),
    );
    expect(runLength(unskippable)).toBeLessThanOrEqual(7);
  });

  it('offers the naming turn to everyone and never gates on it', () => {
    // Optional flourish: it has no skip rule, so it shows for every path, and
    // the screen itself returns undefined when the user keeps the default.
    expect(ONBOARDING_STEPS).toContain('nameCompanion');
    expect(shouldSkipStep('nameCompanion', {})).toBe(false);
    expect(shouldSkipStep('nameCompanion', { journeyStage: 'none' })).toBe(false);
    expect(shouldSkipStep('nameCompanion', { accessActive: true })).toBe(false);
    // It sits beside the introduction, not bolted on later.
    expect(stepIndex('nameCompanion') - stepIndex('meetPep')).toBe(1);
  });

  it('drops the echo-only turns but keeps the one that pays off', () => {
    // experience / alsoTracking / momentum each produced a single echo line.
    for (const gone of ['experience', 'alsoTracking', 'momentum']) {
      expect(ONBOARDING_STEPS).not.toContain(gone);
    }
    // `needs` stays — buildCraftingSteps leads the checklist with these picks —
    // and now sits beside that payoff instead of twenty screens away.
    expect(ONBOARDING_STEPS).toContain('needs');
    expect(stepIndex('crafting') - stepIndex('needs')).toBeLessThanOrEqual(3);
  });

  it('returns null past the last step', () => {
    expect(nextStep('welcomeIn')).toBeNull();
  });

  it('walks back, with no step before the first', () => {
    expect(prevStep('journeyStage')).toBe('nameCompanion');
    expect(prevStep('nameCompanion')).toBe('meetPep');
    expect(prevStep('meetPep')).toBe('welcome');
    expect(prevStep('welcome')).toBeNull();
  });

  it('keeps the rating step out of the flow (review ask moved post-purchase)', () => {
    expect(ONBOARDING_STEPS).not.toContain('rating');
  });

  it('matches the funnel progress values', () => {
    // welcome=#1, meetPep=#2, welcomeIn=last (denominator = full step count).
    const n = ONBOARDING_STEPS.length;
    expect(progressForStep('welcome')).toBeCloseTo(1 / n, 5);
    expect(progressForStep('meetPep')).toBeCloseTo(2 / n, 5);
    expect(progressForStep('nameCompanion')).toBeCloseTo(3 / n, 5);
    expect(progressForStep('journeyStage')).toBeCloseTo(4 / n, 5);
    expect(progressForStep('welcomeIn')).toBe(1);
  });
});

describe('shouldSkipStep', () => {
  it('keeps every dosing step for an active injectable, weekly vial user', () => {
    const ctx = {
      journeyStage: 'active',
      route: 'injection',
      deviceType: 'syringe_vial',
      frequency: 'weekly',
    } as const;
    for (const step of [
      'medication',
      'currentDose',
      'deviceType',
      'concentration',
      'frequency',
      'lastShot',
      'shotDay',
      'shotTime',
      'instrument',
    ] as const) {
      expect(shouldSkipStep(step, ctx)).toBe(false);
    }
  });

  it('asks concentration only for syringe & vial users', () => {
    expect(shouldSkipStep('concentration', { journeyStage: 'active', deviceType: 'syringe_vial' })).toBe(false);
    expect(shouldSkipStep('concentration', { journeyStage: 'active', deviceType: 'single_dose_pen' })).toBe(true);
    expect(shouldSkipStep('concentration', { journeyStage: 'active', deviceType: 'auto_injector' })).toBe(true);
    expect(shouldSkipStep('concentration', { journeyStage: 'active' })).toBe(true);
  });

  it('skips shot day + time for oral or non-weekly schedules', () => {
    expect(shouldSkipStep('shotDay', { journeyStage: 'active', route: 'oral' })).toBe(true);
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'oral' })).toBe(true);
    expect(shouldSkipStep('shotDay', { journeyStage: 'active', route: 'injection', frequency: 'biweekly' })).toBe(true);
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'injection', frequency: 'daily' })).toBe(true);
    expect(shouldSkipStep('shotDay', { journeyStage: 'active', route: 'injection', frequency: 'weekly' })).toBe(false);
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'injection', frequency: 'weekly' })).toBe(false);
  });

  it('skips the dosing block + instrument beat for users not actively on a GLP-1', () => {
    expect(shouldSkipStep('currentDose', { journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('frequency', { journeyStage: 'none' })).toBe(true);
    expect(shouldSkipStep('medication', { journeyStage: 'none' })).toBe(true);
    expect(shouldSkipStep('medication', { journeyStage: 'starting_soon' })).toBe(false);
    expect(shouldSkipStep('instrument', { journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('instrument', { journeyStage: 'active' })).toBe(false);
  });

  it('keeps the remaining profile turns for everyone', () => {
    for (const stage of ['active', 'starting_soon', 'none'] as const) {
      expect(shouldSkipStep('needs', { journeyStage: stage })).toBe(false);
      expect(shouldSkipStep('company', { journeyStage: stage })).toBe(false);
      expect(shouldSkipStep('fearAnswered', { journeyStage: stage })).toBe(false);
    }
  });

  it('does not skip non-gated steps', () => {
    expect(shouldSkipStep('goalType', { journeyStage: 'none' })).toBe(false);
    expect(shouldSkipStep('birthday', { journeyStage: 'starting_soon' })).toBe(false);
  });
});

describe('route + deviceType gating', () => {
  it('asks the route only for ambiguous medications', () => {
    expect(shouldSkipStep('route', { journeyStage: 'active', routeLocked: true })).toBe(true);
    expect(shouldSkipStep('route', { journeyStage: 'active', routeLocked: false })).toBe(false);
  });

  it('skips the route question for users not on a medication', () => {
    expect(shouldSkipStep('route', { journeyStage: 'none' })).toBe(true);
  });

  it('asks the device only for active injection users', () => {
    expect(shouldSkipStep('deviceType', { journeyStage: 'active', route: 'injection' })).toBe(false);
    expect(shouldSkipStep('deviceType', { journeyStage: 'active', route: 'oral' })).toBe(true);
    expect(shouldSkipStep('deviceType', { journeyStage: 'starting_soon', route: 'injection' })).toBe(true);
    expect(shouldSkipStep('deviceType', { journeyStage: 'none' })).toBe(true);
  });

  it('shows the symptom-week beat only when a drawable symptom was reported', () => {
    // Gated on the actual picks, unlike every other skip rule here. "None yet"
    // and picks with no post-dose arc get no curve — a nausea graph shown to
    // someone reporting nothing reads as being told what is coming.
    expect(shouldSkipStep('symptomWeek', {})).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: [] })).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['injection_site_reaction'] })).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['hair_loss', 'other'] })).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['nausea'] })).toBe(false);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['other', 'fatigue'] })).toBe(false);
  });
});
