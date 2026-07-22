import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  nextStep,
  prevStep,
  progressForStep,
  shouldSkipStep,
} from './onboardingFlow';

describe('onboarding flow', () => {
  it('starts at welcome, sits sign-in right before the paywall, ends at welcomeIn', () => {
    expect(ONBOARDING_STEPS[0]).toBe('welcome');
    expect(ONBOARDING_STEPS[1]).toBe('privacy');
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]).toBe('welcomeIn');
    expect(nextStep('welcome')).toBe('privacy');
    expect(nextStep('reveal')).toBe('auth');
    expect(nextStep('auth')).toBe('referral');
    expect(nextStep('referral')).toBe('paywall');
    expect(nextStep('paywall')).toBe('welcomeIn');
  });

  it('skips the sign-in step once authenticated', () => {
    expect(shouldSkipStep('auth', {})).toBe(false);
    expect(shouldSkipStep('auth', { authenticated: true })).toBe(true);
  });

  it('skips referral and paywall for resolved-active access (creators/subscribers)', () => {
    expect(shouldSkipStep('referral', { accessActive: true })).toBe(true);
    expect(shouldSkipStep('paywall', { accessActive: true })).toBe(true);
    expect(shouldSkipStep('referral', {})).toBe(false);
    expect(shouldSkipStep('paywall', {})).toBe(false);
    // welcomeIn still plays for creators.
    expect(shouldSkipStep('welcomeIn', { accessActive: true })).toBe(false);
  });

  it('advances forward in order through the new turns', () => {
    expect(nextStep('privacy')).toBe('meetPep');
    expect(nextStep('meetPep')).toBe('journeyStage');
    expect(nextStep('journeyStage')).toBe('experience');
    expect(nextStep('experience')).toBe('needs');
    expect(nextStep('needs')).toBe('medication');
    expect(nextStep('deviceType')).toBe('concentration');
    expect(nextStep('frequency')).toBe('lastShot');
    expect(nextStep('lastShot')).toBe('shotDay');
    expect(nextStep('shotDay')).toBe('shotTime');
    expect(nextStep('shotTime')).toBe('instrument');
    expect(nextStep('goalType')).toBe('alsoTracking');
    expect(nextStep('goalPace')).toBe('company');
    expect(nextStep('sideEffects')).toBe('biggestWorry');
    expect(nextStep('biggestWorry')).toBe('fearAnswered');
  });

  it('returns null past the last step', () => {
    expect(nextStep('welcomeIn')).toBeNull();
  });

  it('walks back, with no step before the first', () => {
    expect(prevStep('journeyStage')).toBe('meetPep');
    expect(prevStep('meetPep')).toBe('privacy');
    expect(prevStep('privacy')).toBe('welcome');
    expect(prevStep('welcome')).toBeNull();
  });

  it('keeps the rating step out of the flow (review ask moved post-purchase)', () => {
    expect(ONBOARDING_STEPS).not.toContain('rating');
  });

  it('matches the funnel progress values', () => {
    // welcome=#1, privacy=#2, welcomeIn=last (denominator = full step count).
    const n = ONBOARDING_STEPS.length;
    expect(progressForStep('welcome')).toBeCloseTo(1 / n, 5);
    expect(progressForStep('privacy')).toBeCloseTo(2 / n, 5);
    expect(progressForStep('meetPep')).toBeCloseTo(3 / n, 5);
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

  it('keeps the new profile turns for everyone', () => {
    for (const stage of ['active', 'starting_soon', 'none'] as const) {
      expect(shouldSkipStep('experience', { journeyStage: stage })).toBe(false);
      expect(shouldSkipStep('needs', { journeyStage: stage })).toBe(false);
      expect(shouldSkipStep('alsoTracking', { journeyStage: stage })).toBe(false);
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
});
