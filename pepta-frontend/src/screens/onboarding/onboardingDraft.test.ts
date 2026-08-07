import { describe, expect, it } from 'vitest';
import { parseDraft, rewindResumeStep, serializeDraft } from './onboardingDraft';

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
