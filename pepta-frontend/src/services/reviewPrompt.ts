// The App Store review ask, fired from inside the app at an earned moment.
//
// APPLE RENDERS THE SHEET, NOT US. StoreReview.requestReview() shows the
// system stars + "Write a Review"; there is nothing to design and nothing to
// read back — we never learn whether it appeared, whether they rated, or what
// they said. A custom star popup that routes 4-5 to the store and 1-3 to a
// feedback form is an App Review rejection, so the native call is the only
// compliant path.
//
// THE ASK IS RATIONED. iOS allows at most 3 prompts per user per 365 days and
// silently drops the rest, so a wasted call is a wasted year. The prior
// attempt spent it during onboarding (a `rateApp` turn, added 2026-07-26 and
// removed 2026-07-27) — asking someone who had never used the tracker is the
// standing explanation for the app's single rating. onboardingFlow.ts carries
// a "do not reintroduce a pre-paywall rating turn" note; this module is the
// other half of that decision, and deliberately asks LATER rather than more.
//
// So: one ask per install, only on a milestone the user actually earned.
// `setup_unlocked` fires on day one for finishing a checklist and is
// explicitly NOT review-worthy — nothing has been proven yet.

/**
 * Milestones that represent real use. Order-independent.
 *
 * streak_3 is the trigger that matters. Gating on streak_7 was correct in
 * principle and useless in practice: day-7 retention is low enough that most
 * installs would never reach the ask at all, so the cap went unspent rather
 * than being spent badly. Three consecutive days of logging is still a real
 * habit and nothing like the removed onboarding turn, which asked before the
 * user had opened the tracker once.
 */
export const REVIEW_WORTHY_MILESTONES: readonly string[] = ['streak_3', 'streak_7', 'streak_30'];

export interface ReviewAskInput {
  /** The milestone that just fired, or null when none did. */
  milestoneKey: string | null;
  /** Have we ever asked on this install? */
  alreadyAsked: boolean;
  /** StoreReview.isAvailableAsync() — false on simulators and some regions. */
  available: boolean;
}

export type ReviewAskDecision =
  | 'ask'
  | 'no-milestone'
  | 'milestone-not-earned'
  | 'already-asked'
  | 'unavailable';

/**
 * The whole decision, pure so it unit-tests without a device. Every branch
 * that declines returns WHY — a silent false made the previous version of
 * this impossible to reason about from logs.
 */
export function reviewAskDecision(input: ReviewAskInput): ReviewAskDecision {
  if (input.alreadyAsked) return 'already-asked';
  if (input.milestoneKey == null) return 'no-milestone';
  if (!REVIEW_WORTHY_MILESTONES.includes(input.milestoneKey)) return 'milestone-not-earned';
  if (!input.available) return 'unavailable';
  return 'ask';
}

export interface RequestReviewDeps {
  isAvailableAsync(): Promise<boolean>;
  requestReview(): Promise<void>;
  hasAsked(): Promise<boolean>;
  markAsked(): Promise<void>;
}

/**
 * Runs the ask if the milestone earned it. Returns the decision so callers
 * (and tests) can see what happened.
 *
 * `markAsked` fires BEFORE requestReview: if the sheet throws or the system
 * silently swallows it, we still burn our one ask. Retrying on failure would
 * mean re-asking every launch for a user iOS has already decided not to show
 * it to, which is how an install spends all three of its yearly prompts on
 * nothing.
 */
export async function maybeRequestReview(
  milestoneKey: string | null,
  deps: RequestReviewDeps,
): Promise<ReviewAskDecision> {
  // Cheap, storage-free rejections first — no I/O for the common case where
  // no milestone fired at all.
  if (milestoneKey == null) return 'no-milestone';
  if (!REVIEW_WORTHY_MILESTONES.includes(milestoneKey)) return 'milestone-not-earned';

  let alreadyAsked = true;
  let available = false;
  try {
    alreadyAsked = await deps.hasAsked();
    available = await deps.isAvailableAsync();
  } catch {
    // Storage or the native module misbehaving is never a reason to show a
    // system sheet we cannot account for.
    return 'unavailable';
  }

  const decision = reviewAskDecision({ milestoneKey, alreadyAsked, available });
  if (decision !== 'ask') return decision;

  try {
    await deps.markAsked();
    await deps.requestReview();
  } catch {
    // Best effort, exactly like WelcomeInScreen's button: the review sheet
    // must never break the screen that triggered it.
  }
  return 'ask';
}
