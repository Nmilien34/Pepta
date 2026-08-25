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

  it('leaves the active path alone — startWeight still carries it', () => {
    const a = { journeyStage: 'active', body: BODY } as never;
    expect(echoFor('startWeight', a)).toContain('Locked in');
    expect(echoFor('goalWeight', a)).toContain('226 today');
  });
});
