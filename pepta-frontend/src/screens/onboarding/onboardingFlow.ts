// Pure onboarding step machine — the ordered step list plus next/prev/progress.
// No React/RN imports, so it unit-tests in plain Node. The navigator consumes
// these; gating (skipping medication steps for non-medicated users, vial-only
// concentration, weekly-only shot day/time) layers on top via shouldSkipStep.
//
// v2.2 conversational flow. Interstitial beats (instrument/company/fearAnswered)
// are real steps so the progress bar moves through them. Side effects come
// BEFORE the worry so Beat C can answer the fear directly. The standalone
// privacy-consent turn is gone — a whole step to acknowledge a promise was pure
// friction; the welcome screen carries "by continuing you agree" with the live
// Terms and Privacy links instead.
//
// THE REVIEW ASK IS NOT A STEP IN THIS LIST. It lives post-purchase, in
// WelcomeInScreen, as a user-initiated "Leave a rating" button. A `rateApp`
// turn was briefly added after `reveal` (2026-07-26) on the theory that the
// plan reveal is the emotional peak; it was removed 2026-07-27 because Apple
// caps review prompts per user per year, and spending that cap on someone who
// has never used the tracker and has not paid is the likely reason the app has
// one rating. Do not reintroduce a pre-paywall rating turn.
//
// The `referral` code turn (auth → paywall) was also removed 2026-07-27 —
// see the note at its old position below.

// ORDER IS THE FUNNEL (restructured 2026-07-27). Rhythm is deliberate:
// reassure → ask → name the problem → promise the fix → ask → prove → pay off.
// Two findings drove it:
//   1. The only screen that states a PROBLEM (fearAnswered — 25–39% of weight
//      lost can be lean mass when unmanaged) sat at step 29 of 36. Anyone who
//      left before it never heard one reason to want this. It now lands at
//      step 5, still personalised because `biggestWorry` moved up with it as
//      a pair — the problem is named in the user's own words, then answered.
//   2. There were TWELVE consecutive input turns before the first payoff, and
//      the skip rules spare only people who are NOT on a GLP-1 — so the user
//      most worth converting carried the most friction. The longest run is now
//      9 (medication → shotTime), and that is the one block the skip rules DO
//      shorten. `company` moved to sit after `goalPace`, breaking what would
//      otherwise be a 12-long UNSKIPPABLE stretch that every single user walks.
//      Watch that second run: it is the one nobody escapes.
// Dropped: experience / alsoTracking / momentum. None reach the payload, and
// each only ever produced a one-line conversational echo — a question's worth
// of friction for a sentence. `momentum` also opened "Last one. Be honest."
// while six screens still followed it.
// KEPT, deliberately: `needs`. It looks like the same case on paper (also
// absent from the payload) but it is not — `buildCraftingSteps` leads the
// crafting checklist with the user's own picks, so the answer visibly comes
// back. It moved late instead, next to that payoff.
import type { SideEffectType } from '@pepta/shared';
import { symptomForWeekBeat } from './symptomWeek';

export const ONBOARDING_STEPS = [
  'welcome',
  'meetPep',
  // Optional, never a gate — the default stays 'Pep'. Sits here so the
  // introduction is still on screen; asking later would feel bolted on.
  'nameCompanion',
  'journeyStage',
  'biggestWorry',
  'fearAnswered',
  'medication',
  'route',
  'currentDose',
  'deviceType',
  'concentration',
  'frequency',
  // Conviction beat. Deliberately AFTER medication + dose + frequency: by here
  // the user has told us what they take and how often, so "the weight you lose
  // on this" is about THEIR regimen rather than an abstract statistic.
  'leanMass',
  'lastShot',
  'shotDay',
  'shotTime',
  'instrument',
  'goalType',
  'sexGender',
  'birthday',
  'heightWeight',
  'startWeight',
  'goalWeight',
  'goalPace',
  // Proof beat. It breaks the longest UNSKIPPABLE run in the flow — goalType
  // through notifications — and the STEP-1 number lands best right after the
  // user has just set a goal and a pace.
  'company',
  'dailyRoutine',
  'training',
  'sideEffects',
  // Conviction beat. Collect the worry, then draw it. Skipped for "none yet"
  // and for picks that do not follow a post-dose arc — see symptomForWeekBeat.
  'symptomWeek',
  // Kept, and moved to sit two steps before `crafting`: this answer is what the
  // crafting checklist leads with, ticking off the user's own words. Asked at
  // step 5 that payoff was twenty screens away and read as a throwaway; here
  // the loop closes almost immediately.
  'needs',
  'notifications',
  'crafting',
  'reveal',
  'auth',
  // NOTE: the 'referral' code-entry turn used to sit here (auth → paywall).
  // Removed 2026-07-27 — near-everyone who reached it tapped Skip, so it was
  // pure friction in front of the wall. `ReferralCodeScreen` is kept (it is the
  // only code-claim surface in the app) pending a lower-friction home for it.
  'paywall',
  'welcomeIn',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// The progress bar counts the full funnel — welcome (#1) through welcomeIn — so
// the count auto-adjusts if steps are added/removed.
const FUNNEL_LENGTH = ONBOARDING_STEPS.length;
const FUNNEL_OFFSET = 1; // welcome is screen #1

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  if (index < 0 || index >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[index + 1] ?? null;
}

export function prevStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  return index > 0 ? ONBOARDING_STEPS[index - 1] ?? null : null;
}

// 0..1 progress for the hairline bar. privacy → 2/35, welcomeIn → 1.
export function progressForStep(step: OnboardingStep): number {
  const index = stepIndex(step);
  if (index < 0) return 0;
  return (index + FUNNEL_OFFSET) / FUNNEL_LENGTH;
}

// Answers that gate which steps apply. Kept as plain literals so this module
// stays free of screen imports.
export interface FlowContext {
  // Whether the user has signed in — the `auth` step is skipped once true.
  authenticated?: boolean;
  // Resolved active access (approved creator or existing subscriber): the
  // referral and paywall steps are skipped — Auth → welcomeIn directly.
  accessActive?: boolean;
  journeyStage?: 'active' | 'starting_soon' | 'none';
  route?: 'injection' | 'oral';
  // True when the picked medication pins its route (branded meds) — the
  // explicit "how do you take it" step only shows for ambiguous picks.
  routeLocked?: boolean;
  deviceType?: 'single_dose_pen' | 'auto_injector' | 'syringe_vial' | 'other';
  frequency?: 'weekly' | 'biweekly' | 'daily' | 'custom';
  /** Their side-effect picks — gates the symptom-week beat. */
  sideEffects?: readonly SideEffectType[];
}

// The dosing block only makes sense for someone actively on a GLP-1.
const MEDICATION_BLOCK: readonly OnboardingStep[] = [
  'currentDose',
  'leanMass',
  'deviceType',
  'concentration',
  'frequency',
  'lastShot',
  'shotDay',
  'shotTime',
  'instrument',
];

export function shouldSkipStep(step: OnboardingStep, ctx: FlowContext): boolean {
  // Already signed in → the sign-in step is unnecessary.
  if (step === 'auth' && ctx.authenticated) return true;
  // Approved creators / active subscribers never see the wall.
  if (step === 'paywall' && ctx.accessActive) return true;
  // Not actively dosing → skip the dose/frequency/shot-day block (and the
  // instrument beat — there's no level model to arm yet).
  if (ctx.journeyStage && ctx.journeyStage !== 'active' && MEDICATION_BLOCK.includes(step)) {
    return true;
  }
  // The symptom-week beat only makes sense when they reported something that
  // actually follows a post-dose arc. "None yet", an empty pick, or only
  // injection-site/hair-loss/other → no curve to draw about them.
  if (step === 'symptomWeek' && !symptomForWeekBeat(ctx.sideEffects)) return true;
  // Not on a GLP-1 at all → also skip the medication picker (and its route question).
  if (ctx.journeyStage === 'none' && (step === 'medication' || step === 'route')) return true;
  // The route question only shows when the picked medication doesn't pin it.
  if (step === 'route' && ctx.routeLocked) return true;
  // Device type is an injection question.
  if (step === 'deviceType' && ctx.route === 'oral') return true;
  // Concentration only matters when the user draws doses from a vial.
  if (step === 'concentration' && ctx.deviceType !== 'syringe_vial') return true;
  // Shot day + time are for weekly injections only.
  if (
    (step === 'shotDay' || step === 'shotTime') &&
    (ctx.route === 'oral' || (ctx.frequency != null && ctx.frequency !== 'weekly'))
  ) {
    return true;
  }
  return false;
}
