import { describe, expect, it } from 'vitest';
import { parseDraft, serializeDraft } from './onboardingDraft';

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
