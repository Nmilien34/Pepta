import { describe, expect, it } from 'vitest';
import { parseDraft, rewindResumeStep, rewindToUnansweredGate, serializeDraft } from './onboardingDraft';
import { ONBOARDING_STEPS } from './onboardingFlow';

describe('onboarding draft', () => {
  it('round-trips step + answers', () => {
    const raw = serializeDraft('goalType', { goalType: 'lose_fat', body: { weight: 184 } });
    expect(parseDraft(raw)).toEqual({ step: 'goalType', answers: { goalType: 'lose_fat', body: { weight: 184 } } });
  });

  it('returns null for empty / malformed / wrong-shape input', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('{bad')).toBeNull();
    expect(parseDraft(JSON.stringify({ step: 'x' }))).toBeNull(); // no answers
    expect(parseDraft(JSON.stringify({ answers: {} }))).toBeNull(); // no step
    expect(parseDraft(JSON.stringify({ step: 1, answers: {} }))).toBeNull(); // step not string
  });
});

describe('rewindResumeStep', () => {
  it('rewinds the whole offer tail to the reveal — a fresh session must reopen on the payoff, never the paywall', () => {
    expect(rewindResumeStep('paywall')).toBe('reveal');
    expect(rewindResumeStep('trialOffer')).toBe('reveal');
    expect(rewindResumeStep('trialCarousel')).toBe('reveal');
  });

  it('never rewinds a paying user: welcomeIn is post-purchase and resumes in place', () => {
    expect(rewindResumeStep('welcomeIn')).toBe('welcomeIn');
  });

  it('leaves every other step exactly where the user left it', () => {
    expect(rewindResumeStep('medication')).toBe('medication');
    expect(rewindResumeStep('reveal')).toBe('reveal');
    expect(rewindResumeStep('goalPace')).toBe('goalPace');
  });
});

describe('rewindToUnansweredGate', () => {
  const at = (step: string) => ONBOARDING_STEPS.indexOf(step as never);

  it('catches the draft the 2026-08-21 reorder stranded', () => {
    // meetPep and nameCompanion moved from positions 3–4 to 6–7, past
    // journeyStage. Someone parked on either when the build shipped would
    // otherwise resume with the medication-block gate never asked.
    expect(rewindToUnansweredGate('meetPep', {}, ONBOARDING_STEPS)).toBe('journeyStage');
    expect(rewindToUnansweredGate('nameCompanion', {}, ONBOARDING_STEPS)).toBe('journeyStage');
  });

  it('is why it matters: an undefined gate reads as "actively dosing"', () => {
    // shouldSkipStep short-circuits on `ctx.journeyStage &&`, so a missing
    // answer hands a not-on-a-GLP-1 user the whole dosing block. This test
    // documents the consequence the rewind exists to prevent.
    expect(at('journeyStage')).toBeLessThan(at('meetPep'));
    expect(at('journeyStage')).toBeLessThan(at('medication'));
  });

  it('leaves a draft alone once the gate is answered', () => {
    expect(
      rewindToUnansweredGate('nameCompanion', { journeyStage: 'active' }, ONBOARDING_STEPS),
    ).toBe('nameCompanion');
    expect(
      rewindToUnansweredGate('goalPace', { journeyStage: 'none' }, ONBOARDING_STEPS),
    ).toBe('goalPace');
  });

  it('never rewinds a step that sits at or before the gate', () => {
    expect(rewindToUnansweredGate('journeyStage', {}, ONBOARDING_STEPS)).toBe('journeyStage');
    expect(rewindToUnansweredGate('notAlone', {}, ONBOARDING_STEPS)).toBe('notAlone');
    expect(rewindToUnansweredGate('welcome', {}, ONBOARDING_STEPS)).toBe('welcome');
  });

  it('passes through a step it does not recognise, and a missing answers bag', () => {
    expect(rewindToUnansweredGate('nonsense', {}, ONBOARDING_STEPS)).toBe('nonsense');
    expect(rewindToUnansweredGate('nameCompanion', null, ONBOARDING_STEPS)).toBe('journeyStage');
  });
});
