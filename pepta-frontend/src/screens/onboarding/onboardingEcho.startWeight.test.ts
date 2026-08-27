// The muscle-floor give is acknowledged by whichever screen FOLLOWS it, and
// which screen that is now depends on journey stage: startWeight is gated to
// active users (2026-08-25), so for everyone else goalWeight follows the give
// directly and must inherit the acknowledgment. Without that, muscleFloor's
// own context ("5'10", 226 today.") and goalWeight's ("226 today. Thanks for
// trusting me with that.") land back to back, saying the same number twice.
import { describe, expect, it } from 'vitest';
import { echoFor } from './onboardingEcho';

const BODY = { units: 'imperial', heightIn: 70, weight: 226 } as const;

describe('the muscle-floor acknowledgment follows the give', () => {
  it('repeats no number when startWeight is gated out', () => {
    for (const journeyStage of ['starting_soon', 'none'] as const) {
      const a = { journeyStage, body: BODY } as never;
      const floor = echoFor('muscleFloor', a);
      const goal = echoFor('goalWeight', a);
      expect(floor).toContain('226 today');
      // The give's payoff (the protein floor) is what gets acknowledged here.
      expect(goal).toContain('Locked in');
      expect(goal).not.toContain('226 today');
    }
  });

  // UPDATED 2026-08-27. This used to assert goalWeight contained "226 today",
  // which is exactly the repeat Nick caught on the device: muscleFloor opens
  // with that same weight two screens earlier. The assertion had encoded the
  // bug. What still matters here is the half this file exists for — the
  // acknowledgment stays on startWeight for an active user — so that is kept
  // and the repeat is now asserted AGAINST. See onboardingEcho.repeats.test.
  it('leaves the active path alone — startWeight still carries the floor', () => {
    const a = { journeyStage: 'active', body: BODY } as never;
    expect(echoFor('startWeight', a)).toContain('Locked in');
    expect(echoFor('goalWeight', a)).not.toContain('226');
  });
});
