// The side-effect acknowledgement, after the `needs` turn was cut (2026-08-21).
//
// "I'll watch for those" belongs to whichever screen directly FOLLOWS the
// side-effects turn — the echo chain is order-dependent, so cutting a step
// silently orphans whatever its case was saying. That screen is now
// `notifications`, and the no-double-acknowledgement rule the old turn carried
// has to move with it: when the symptom-week beat runs it has already named
// the picks, and saying it again reads as the app forgetting it just spoke.

import { describe, expect, it } from 'vitest';
import { echoFor } from './onboardingEcho';

describe('the side-effect acknowledgement survived the cut', () => {
  it('names the picks when no symptom-week beat ran', () => {
    // hair_loss has no post-dose arc, so symptomForWeekBeat skips the beat and
    // nothing has acknowledged the answer yet.
    expect(echoFor('notifications', { sideEffects: ['hair_loss'] })).toBe(
      'Noted — I’ll watch for those.',
    );
  });

  it('says so plainly when they reported nothing', () => {
    expect(echoFor('notifications', { sideEffects: [] })).toBe('Clean slate so far.');
    expect(echoFor('notifications', {})).toBe('Clean slate so far.');
  });

  it('does NOT repeat itself when the beat already named them', () => {
    // nausea follows a post-dose arc, so SymptomWeekBeatScreen drew it and
    // called it by name one screen ago.
    expect(echoFor('notifications', { sideEffects: ['nausea'] })).toBe(
      'You’ve given me everything I need.',
    );
  });
});
