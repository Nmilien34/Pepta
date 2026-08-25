// The conversation's pace — every timing the onboarding flow animates on, in
// one place.
//
// These were dialled by Nick on 2026-08-24 against the side-by-side prototype
// in design-lab/onboarding-pace.html, which plays the shipped values and a
// candidate set on two phones at once. Re-tune there, not by guessing here.
//
// THE BRIEF WAS EMOTIONAL, NOT MECHANICAL. The flow read as a quiz, and the
// two causes were measurable rather than matters of taste:
//
//   Typing ran at 32ms/char — about 341 words per minute. People read at
//   200–250, so the line finished before it had been taken in and the user
//   was never listening, only waiting for the next question. 59ms lands near
//   185wpm: slower than reading, which is what makes it feel spoken.
//
//   The step fade ran out in 90ms. Below roughly 120ms the eye does not
//   register a dissolve at all, just a cut with a flicker — so every turn
//   snapped away instead of settling.
//
// COST, MEASURED, NOT ESTIMATED. Across the 32 typed questions in the flow
// (735 characters) the typing alone goes 23.5s → 43.4s. With the longer step
// fades and breaths on top, the whole onboarding gains roughly a minute. That
// is a real trade against drop-off and it was made deliberately.

export const pace = {
  /** Ms per character for the question — the line the user is meant to hear. */
  typeMs: 59,
  /**
   * Ceiling on how long ANY one question may take to type.
   *
   * A per-character speed alone is a sentence-length tax: at a flat 59ms the
   * four longest questions ran past two seconds ("How deep are you in the
   * peptide world?" took 2.24s) and the measured pace tipped into a wait.
   * Long lines now compress just enough to fit this budget; short ones are
   * untouched.
   *
   * 1800 was chosen off the real distribution, which is bimodal — four
   * questions are 35–38 characters and every other one is 27 or fewer. The
   * crossover this implies (1800/59 ≈ 31 chars) falls inside that gap, so no
   * question sits near the boundary where a small copy edit would visibly
   * change its pace.
   */
  maxQuestionMs: 1800,
  /**
   * Floor on the compressed speed. However long a line gets, it never types
   * faster than this — the point of the pace work was that a question read
   * faster than a person reads is a quiz, and a budget with no floor would
   * walk straight back there one long question at a time.
   *
   * Engages above 40 characters, so today it is a guard on future copy rather
   * than something the current flow reaches.
   */
  minTypeMs: 45,
  /**
   * The context line types far faster and silently. It is a recap or an
   * aside, not the thing being said, so it should already be there by the
   * time the eye arrives.
   */
  contextTypeMs: 14,
  /** The beat before the question starts — a breath, not a pause. */
  questionDelayMs: 650,
  /** Sub-line, stat and answer rows easing in after the question lands. */
  revealMs: 570,
  /**
   * Gap between consecutive answer rows.
   *
   * SCALES WITH ROW COUNT — this is the one number that behaves differently
   * on the real screens than it did in the prototype, which showed three
   * rows. DiscoverySourceScreen has eight, so its last row now arrives 1.40s
   * after its first (it was 0.56s). If that reads as slow, lower this rather
   * than assuming the screen is broken.
   */
  staggerMs: 175,
  /** How long the sent bubble and typing dots hold before the flow advances. */
  acknowledgeMs: 1050,
  /** The leaving turn dips out… */
  stepFadeOutMs: 475,
  /** …and the next one eases in. Together, one soft blink of ~1.0s. */
  stepFadeInMs: 550,
  /**
   * Points of upward drift on the incoming turn.
   *
   * A REVERSAL, not a tune. StepFade previously documented "no slide, no
   * scale" as deliberate, and at a 250ms swap that was right. At ~1.0s a pure
   * opacity fade reads as the app hesitating; a few points of rise is what
   * makes the same duration read as settling instead of lagging.
   */
  stepRisePt: 10,
} as const;

/**
 * How fast a question of this length should type.
 *
 * Short questions get the full measured pace. Long ones compress toward
 * `minTypeMs` only as far as `maxQuestionMs` requires, so the line finishes in
 * a bounded time without any question suddenly sounding hurried relative to
 * the one before it. Pure, so the curve is testable without rendering.
 */
export function questionSpeedMs(length: number): number {
  if (length <= 0) return pace.typeMs;
  const fitted = pace.maxQuestionMs / length;
  // Never faster than the floor, never slower than the base pace.
  return Math.max(pace.minTypeMs, Math.min(pace.typeMs, fitted));
}
