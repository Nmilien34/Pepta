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

/**
 * THE DEVICE-LOCAL GATE (5.6.3, rejected 2026-08-28).
 *
 * The milestone gate below was already in place and still produced a
 * first-launch ask, because every one of its conditions came from ACCOUNT
 * data. seedDemoUser backdates the review account by weeks, so the reviewer's
 * fresh install received a ready-made streak and fired on first render.
 *
 * These four conditions are all measured on THIS INSTALL and cannot be
 * backdated by any account. `MIN_DAYS_SINCE_FIRST_OPEN` alone makes a
 * first-launch ask structurally impossible, which is the property the
 * rejection actually demands.
 */
export const MIN_DAYS_SINCE_FIRST_OPEN = 4;
export const MIN_LOGGED_DAYS = 3;
/**
 * 60 days between asks. iOS also rate-limits to 3 sheets per 365 days and
 * silently drops the rest, so this is the app being a good citizen inside
 * that budget rather than the only thing holding the line.
 */
export const REVIEW_COOLDOWN_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewGateInput {
  now: number;
  /** First launch on THIS install, ms. Null when never recorded. */
  firstOpenAt: number | null;
  /** Local YYYY-MM-DD strings for days the user logged something. */
  loggedDays: readonly string[];
  onboardingActive: boolean;
  /** When the sheet was last requested, ms. Null when never. */
  lastAskedAt: number | null;
  available: boolean;
}

export type ReviewGateDecision =
  | 'ask'
  | 'too-new'
  | 'not-enough-days'
  | 'onboarding-active'
  | 'cooldown'
  | 'unavailable';

/**
 * Pure, so every branch is testable without a device. Each refusal names
 * itself — a bare false is why the previous version could not be diagnosed
 * from logs.
 */
export function reviewGateDecision(input: ReviewGateInput): ReviewGateDecision {
  if (input.onboardingActive) return 'onboarding-active';

  // A missing marker means "assume brand new", never "assume old". Reading an
  // absent value as long-installed is exactly how this fires on first launch.
  if (input.firstOpenAt == null) return 'too-new';
  if (input.now - input.firstOpenAt < MIN_DAYS_SINCE_FIRST_OPEN * DAY_MS) return 'too-new';

  // DISTINCT days: one heavy session logging ten doses is one day of habit.
  if (new Set(input.loggedDays).size < MIN_LOGGED_DAYS) return 'not-enough-days';

  if (
    input.lastAskedAt != null &&
    input.now - input.lastAskedAt < REVIEW_COOLDOWN_DAYS * DAY_MS
  ) {
    return 'cooldown';
  }

  if (!input.available) return 'unavailable';
  return 'ask';
}

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
  /**
   * The device-local engagement gate. A function rather than plain values so
   * the storage reads it needs are skipped entirely when the cheap
   * account-side checks have already declined.
   */
  gate(): Promise<ReviewGateDecision>;
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
): Promise<ReviewAskDecision | ReviewGateDecision> {
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

  // THE DEVICE-LOCAL GATE RUNS LAST AND HAS A VETO (5.6.3).
  //
  // Everything above this line is derived from the ACCOUNT, and that is
  // precisely how the sheet reached App Review on a first launch: the seeded
  // reviewer account arrives with weeks of backdated history, so the milestone
  // was already earned before the app had been used once. These conditions are
  // measured on THIS install and cannot be backdated by any account.
  const gate = await deps.gate();
  if (gate !== 'ask') return gate;

  try {
    await deps.markAsked();
    await deps.requestReview();
  } catch {
    // Best effort, exactly like WelcomeInScreen's button: the review sheet
    // must never break the screen that triggered it.
  }
  return 'ask';
}
