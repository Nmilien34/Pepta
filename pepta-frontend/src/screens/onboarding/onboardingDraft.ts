// Pure (de)serialization for the in-progress onboarding draft (current step +
// the loose flow answers). No RN imports — the AsyncStorage I/O lives in the
// navigator. A malformed blob parses to null so onboarding just starts fresh.

// BUMP THIS WHENEVER ONBOARDING_STEPS CHANGES SHAPE.
// A saved draft is just a step NAME. Reorder or remove steps and that name
// resumes at a completely different point in the flow — v1 drafts saved at
// `reveal` under the old 36-step order reopened the app at the plan graph,
// so the whole quiz appeared to have vanished. Bumped to v2 for the
// 2026-07-27 restructure; an unrecognised key simply starts fresh.
//
// Deliberately NOT bumped for the `leanMass` insertion (2026-07-28). The rule
// is about steps MOVING: a pure insertion leaves every existing step name
// meaning what it always did, so a v2 draft saved at `lastShot` still resumes
// at `lastShot` — it just skips a beat the user was already past. Bumping
// would discard every in-progress draft to buy nothing.
export const ONBOARDING_DRAFT_KEY = 'pepta.onboarding.v2';

export interface StoredDraft {
  step: string;
  answers: Record<string, unknown>;
}

export function serializeDraft(step: string, answers: Record<string, unknown>): string {
  return JSON.stringify({ step, answers });
}

/**
 * Steps that no longer exist, mapped to where their drafts should resume.
 * 'auth' was merged into 'reveal' (2026-07-29): someone who quit at the old
 * sign-in screen resumes at the merged reveal, which now carries the auth
 * block — the exact same decision point they left at.
 */
const LEGACY_STEP_MAP: Record<string, string> = {
  auth: 'reveal',
  // 'needs' was cut 2026-08-21. This entry is not optional politeness: the
  // navigator only restores a draft whose step still EXISTS, so without it
  // anyone parked on that screen when the build lands loses every answer and
  // restarts the quiz from welcome. Resume on the turn that followed it.
  needs: 'notifications',
};

export function migrateLegacyStep(step: string): string {
  return LEGACY_STEP_MAP[step] ?? step;
}

/**
 * The offer tail. A draft saved here rewinds to the reveal on a FRESH-SESSION
 * resume (2026-08-07): relaunching straight onto the paywall is the most
 * aggressive possible re-entry — the user left because they weren't ready.
 * Resuming at "Your tracker is ready" replays the payoff (their own goal path
 * drawing itself), reminds them why they wanted this, and walks them back to
 * the wall in two taps of their own. welcomeIn is deliberately NOT here: that
 * step is post-purchase — never rewind a paying user to a sales screen.
 * In-session navigator remounts restore from flowCache and skip hydration,
 * so this only fires when the app actually restarted.
 */
// trialOffer and trialCarousel are both CUT; kept in this set because a draft
// saved by an older build can still name them, and resuming onto a step that
// no longer exists would strand the user.
const OFFER_TAIL = new Set(['trialOffer', 'trialCarousel', 'trialTimeline', 'paywall']);

export function rewindResumeStep(step: string): string {
  return OFFER_TAIL.has(step) ? 'reveal' : step;
}

/**
 * Answers that GATE later steps. A draft resuming past one of these with the
 * answer missing walks a flow with a hole in it — so rewind to the gate and
 * ask it again.
 *
 * This exists because REORDERING the step list can move a gate behind a step
 * someone is already parked on. The 2026-08-21 reorder did exactly that:
 * meetPep and nameCompanion moved from positions 3–4 to 6–7, past
 * journeyStage. A draft saved at either would have resumed with journeyStage
 * never asked, and `shouldSkipStep` short-circuits on `ctx.journeyStage &&`
 * — so an undefined answer reads as "actively dosing" and hands a
 * not-on-a-GLP-1 user the entire nine-step dosing block.
 *
 * Re-asking one question beats mis-gating nine steps, so the rewind is
 * unconditional on distance. Keep this list to genuine gates: it can send a
 * far-along draft back to an early screen, which is the right trade only when
 * the missing answer actually breaks the flow.
 */
const GATE_STEPS: ReadonlyArray<{ step: string; answer: string }> = [
  { step: 'journeyStage', answer: 'journeyStage' },
];

export function rewindToUnansweredGate(
  step: string,
  answers: Record<string, unknown> | null | undefined,
  order: readonly string[],
): string {
  const at = order.indexOf(step);
  if (at < 0) return step;
  for (const gate of GATE_STEPS) {
    const gateAt = order.indexOf(gate.step);
    if (gateAt >= 0 && at > gateAt && answers?.[gate.answer] == null) return gate.step;
  }
  return step;
}

export function parseDraft(raw: string | null | undefined): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { step?: unknown }).step === 'string' &&
      (value as { answers?: unknown }).answers &&
      typeof (value as { answers?: unknown }).answers === 'object'
    ) {
      return { step: (value as StoredDraft).step, answers: (value as StoredDraft).answers };
    }
    return null;
  } catch {
    return null;
  }
}
