// What Pep says the moment a dose is logged.
//
// The first one carries real weight: until it exists the level model computes
// nothing, the curve is blank and the next-dose countdown has nothing to
// anchor on. So the first log is the moment the app starts working, and it is
// worth saying so plainly.
//
// THE BURST FIRES ON EVERY LOG, as asked. One reservation, recorded rather
// than silently applied: a full confetti burst on dose 40 is how a celebration
// becomes wallpaper — the reward stops tracking the effort once logging is a
// habit rather than an achievement. If it starts to feel cheap, flip
// BURST_EVERY_LOG to false and the burst falls back to the first dose and the
// milestones, with the words carrying the rest. The copy already differs by
// count either way.
//
// Route-aware throughout: an oral user is never congratulated on a "shot".
//
// Pure and RN-free.

/** Flip to false to reserve confetti for the first dose + milestones. */
export const BURST_EVERY_LOG = true;

export interface DoseCelebration {
  title: string;
  line: string;
  burst: boolean;
}

export interface DoseCelebrationInput {
  /** Doses already logged BEFORE this one. 0 = this is their first. */
  previousDoseCount: number;
  /** globalDoseNoun output — "shot" or "dose", never hardcoded. */
  noun: string;
  /** Suppressed for oral/unmodelled compounds: promising a curve would lie. */
  tracksLevels: boolean;
}

export function doseCelebrationFor({
  previousDoseCount,
  noun,
  tracksLevels,
}: DoseCelebrationInput): DoseCelebration {
  if (previousDoseCount === 0) {
    return {
      title: 'You did it!',
      // The payoff is stated concretely rather than as praise — what changed
      // because of the tap, not how proud we are of them.
      line: tracksLevels
        ? `First ${noun} logged. Your medication level starts tracking from right now.`
        : `First ${noun} logged. Your history and next-${noun} timing start from right now.`,
      burst: true,
    };
  }

  // Milestones always burst, whatever BURST_EVERY_LOG says.
  const milestone = [10, 25, 50, 100].includes(previousDoseCount + 1);
  if (milestone) {
    return {
      title: `${previousDoseCount + 1} logged`,
      line: `That is ${previousDoseCount + 1} ${noun}s tracked. Consistency is the whole game.`,
      burst: true,
    };
  }

  return {
    title: 'Logged',
    line: 'Your curve just got sharper. Nice work.',
    burst: BURST_EVERY_LOG,
  };
}
