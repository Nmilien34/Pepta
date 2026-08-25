// The pace, pinned to its REASONS rather than to its numbers.
//
// Nick dialled these against design-lab/onboarding-pace.html on 2026-08-24
// with a specific brief: the flow read as a quiz, and it should feel like
// someone talking. Numbers get nudged; what must not happen is a nudge that
// quietly puts the quiz back. So each assertion here states the threshold the
// value has to stay on the right side of, and says which side that is.

import { describe, expect, it } from "vitest";
import { pace, questionSpeedMs } from "./convoPace";

/** Average English word ≈ 5 characters plus a space. */
const wpm = (msPerChar: number) => 60000 / (msPerChar * 6);

describe("the question is spoken, not printed", () => {
  it("types slower than people read", () => {
    // THE core fix. At the old 32ms/char the line ran at ~341wpm — finished
    // before it was taken in, so the user was never listening, just waiting
    // for the next question. Reading is 200–250wpm; below that it reads as
    // speech.
    expect(wpm(pace.typeMs)).toBeLessThan(200);
  });

  it("does not type so slowly it becomes a stunt", () => {
    // Past roughly 90ms/char the caret is something you watch rather than
    // read, which is its own kind of wrong.
    expect(pace.typeMs).toBeLessThanOrEqual(90);
  });

  it("keeps the context line far faster than the question", () => {
    // It is an aside or a recap, not the thing being said — it should already
    // be there by the time the eye arrives.
    expect(pace.contextTypeMs * 2).toBeLessThan(pace.typeMs);
  });

  it("takes a breath before speaking", () => {
    expect(pace.questionDelayMs).toBeGreaterThanOrEqual(400);
  });
});

describe("the turn change is a fade, not a cut", () => {
  it("stays above the threshold where a dissolve is perceived at all", () => {
    // Below ~120ms neither half reads as a fade; it reads as a cut with a
    // flicker. This shipped at 90/160.
    expect(pace.stepFadeOutMs).toBeGreaterThanOrEqual(120);
    expect(pace.stepFadeInMs).toBeGreaterThanOrEqual(120);
  });

  it("does not become a scene transition", () => {
    // The brief was "not too much, to not make it feel dramatic".
    expect(pace.stepFadeOutMs + pace.stepFadeInMs).toBeLessThanOrEqual(1400);
  });

  it("carries a rise, because a long fade alone reads as hesitation", () => {
    expect(pace.stepRisePt).toBeGreaterThan(0);
    // Enough to register, not enough to be a slide.
    expect(pace.stepRisePt).toBeLessThanOrEqual(24);
  });
});

describe("the stagger has to survive the longest list", () => {
  it("does not keep the user waiting on an eight-row screen", () => {
    // The prototype these were dialled on showed THREE rows.
    // DiscoverySourceScreen has eight, so the cost is nearly 3x what was on
    // screen when the number was chosen — the one value the prototype could
    // not show honestly. Guarded here at the real row count.
    const LONGEST_LIST = 8;

    expect(pace.staggerMs * (LONGEST_LIST - 1)).toBeLessThanOrEqual(1500);
  });
});

// The real lengths of every typed question in the flow, on 2026-08-24. The
// distribution is bimodal — four questions at 35–38 characters, everything
// else at 27 or fewer — which is why the budget's crossover was placed in the
// gap between them.
const QUESTION_LENGTHS = [
  38, 36, 36, 35, 27, 25, 25, 25, 25, 24, 24, 24, 23, 22, 22, 22, 22, 21, 21,
  20, 20, 20, 20, 20, 19, 19, 19, 19, 17, 16, 15, 14,
];
const LONGEST = "How deep are you in the peptide world?";

describe("long questions compress, short ones do not", () => {
  it("leaves the whole short end at the full measured pace", () => {
    // The ask was explicitly to keep the slower pace everywhere except where
    // it was dragging, so this is the assertion that matters most.
    const short = QUESTION_LENGTHS.filter((n) => n <= 27);

    expect(short).toHaveLength(28);
    for (const n of short) expect(questionSpeedMs(n)).toBe(pace.typeMs);
  });

  it("only the four longest change at all", () => {
    const changed = QUESTION_LENGTHS.filter((n) => questionSpeedMs(n) < pace.typeMs);

    expect(changed).toEqual([38, 36, 36, 35]);
  });

  it("brings the longest question under the budget", () => {
    expect(LONGEST).toHaveLength(38);
    const before = LONGEST.length * pace.typeMs;
    const after = LONGEST.length * questionSpeedMs(LONGEST.length);

    expect(before).toBeGreaterThan(pace.maxQuestionMs);
    expect(Math.round(after)).toBeLessThanOrEqual(pace.maxQuestionMs);
  });

  it("no question anywhere in the flow runs past the budget", () => {
    for (const n of QUESTION_LENGTHS) {
      expect(n * questionSpeedMs(n)).toBeLessThanOrEqual(pace.maxQuestionMs + 1);
    }
  });

  it("never types faster than the floor, however long the line gets", () => {
    // The failure this prevents: a budget with no floor walks back to quiz
    // pace one long question at a time. 400 characters would be 4.5ms/char.
    for (const n of [40, 60, 120, 400]) {
      expect(questionSpeedMs(n)).toBeGreaterThanOrEqual(pace.minTypeMs);
    }
    expect(questionSpeedMs(400)).toBe(pace.minTypeMs);
  });

  it("stays well clear of the speed that made it feel like a quiz", () => {
    // 32ms/char, ~341wpm. Even fully compressed the pace must not approach it.
    expect(pace.minTypeMs).toBeGreaterThan(32 * 1.3);
  });

  it("has no cliff — one more character never jolts the pace", () => {
    // A threshold ("if longer than N, go faster") would make two adjacent
    // screens sound different for a one-word copy edit. The curve is smooth.
    for (let n = 1; n < 120; n++) {
      expect(Math.abs(questionSpeedMs(n + 1) - questionSpeedMs(n))).toBeLessThan(2);
    }
  });

  it("degrades safely on an empty question", () => {
    expect(questionSpeedMs(0)).toBe(pace.typeMs);
  });
});
