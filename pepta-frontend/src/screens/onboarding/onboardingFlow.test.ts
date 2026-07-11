import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  nextStep,
  prevStep,
  progressForStep,
  shouldSkipStep,
} from './onboardingFlow';

describe('onboarding flow', () => {
  it('starts at privacy and ends at paywall', () => {
    expect(ONBOARDING_STEPS[0]).toBe('privacy');
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]).toBe('paywall');
  });

  it('advances forward in order', () => {
    expect(nextStep('privacy')).toBe('journeyStage');
    expect(nextStep('journeyStage')).toBe('medication');
  });

  it('returns null past the last step', () => {
    expect(nextStep('paywall')).toBeNull();
  });

  it('walks back, with no step before the first', () => {
    expect(prevStep('journeyStage')).toBe('privacy');
    expect(prevStep('privacy')).toBeNull();
  });

  it('matches the design lab progress values', () => {
    // 26-step funnel: route + deviceType joined; appleHealth left until
    // HealthKit is real (5.1.1(iv)). Welcome=1, privacy=#2.
    expect(progressForStep('privacy')).toBeCloseTo(2 / 26, 5);
    expect(progressForStep('journeyStage')).toBeCloseTo(3 / 26, 5);
    expect(progressForStep('paywall')).toBe(1);
  });
});

describe('shouldSkipStep', () => {
  it('keeps every dosing step for an active injectable, weekly user', () => {
    const ctx = { journeyStage: 'active', route: 'injection', frequency: 'weekly' } as const;
    for (const step of ['medication', 'currentDose', 'deviceType', 'frequency', 'shotDay'] as const) {
      expect(shouldSkipStep(step, ctx)).toBe(false);
    }
  });

  it('skips shot day for oral or non-weekly schedules', () => {
    expect(shouldSkipStep('shotDay', { journeyStage: 'active', route: 'oral' })).toBe(true);
    expect(shouldSkipStep('shotDay', { journeyStage: 'active', route: 'injection', frequency: 'biweekly' })).toBe(true);
    expect(shouldSkipStep('shotDay', { journeyStage: 'active', route: 'injection', frequency: 'weekly' })).toBe(false);
  });

  it('skips the dosing block for users not actively on a GLP-1', () => {
    expect(shouldSkipStep('currentDose', { journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('frequency', { journeyStage: 'none' })).toBe(true);
    expect(shouldSkipStep('medication', { journeyStage: 'none' })).toBe(true);
    expect(shouldSkipStep('medication', { journeyStage: 'starting_soon' })).toBe(false);
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

