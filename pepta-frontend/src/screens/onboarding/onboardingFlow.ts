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
//
// ALSO DROPPED (2026-08-21): `needs`, the "what would help most" multi-select,
// which had been kept on the argument that buildCraftingSteps led the crafting
// checklist with the user's own words. Two of the three reasons its own header
// gave for existing were never wired: the paywall renders as
// `<PaywallScreen onComplete={goNext} />` and never received the picks, and
// nothing ever POSTed them or logged an event, so the promised "product-
// priority signal in aggregate" did not exist. What remained was three lines
// in a 3.7-second animation, bought with a MANDATORY screen (the CTA was
// disabled until you picked) two turns before the paywall — and for an active
// weekly injector who picked `schedule`, one of those lines duplicated the
// shot-day row the checklist already appended.
// The checklist rows are now DERIVED from answers we already hold — see
// buildCraftingSteps in OnboardingNavigator. Wire it back only if the paywall
// really will lead with the picks; that was the trade, and it was not taken.
import type { SideEffectType } from '@pepta/shared';
import { symptomForWeekBeat } from './symptomWeek';

/**
 * Below this half-life the forgiveness give has no honest version — a drug
 * mostly gone in a day cannot absorb a missed day. Oral semaglutide is ~1.6.
 *
 * Lives HERE, not on the screen, because this file is deliberately RN-free so
 * it unit-tests in plain Node. Importing the constant from the .tsx would drag
 * react-native into the step machine and break that.
 */
export const FORGIVING_HALF_LIFE_DAYS = 2;

export const ONBOARDING_STEPS = [
  'welcome',
  // The gift, given before anything is asked. Was the welcome screen's payload
  // until the carousel took screen 1 — see NotAloneScreen.
  'notAlone',
  // The commitment pact, HERE by explicit call (Nick, 2026-08-24). It sat
  // before the paywall, where a personal promise softening a sales page is a
  // persuasion technique. Here it is 35 screens from any price, so it cannot
  // read as one — and an early commitment shapes everything after it, which a
  // post-purchase one cannot. It follows notAlone because the pact answers
  // that screen: you are not the only one, so here is what I am in for.
  'commitment',
  // ASK ABOUT THEM BEFORE INTRODUCING THE MASCOT (moved 2026-08-21, Nick).
  // Pep used to be screens 3–4, immediately after "you're not the only one
  // doing this" — a cartoon shown to someone the app had not yet said one
  // useful thing to. journeyStage is self-identifying and biggestWorry is the
  // question people actually want asked, so they earn the screen that
  // reassurance alone does not.
  //
  // NOTE THE PAIR: biggestWorry → fearAnswered stay ADJACENT. The straight
  // 3-4 ↔ 5-6 swap would have put meetPep + nameCompanion between the fear and
  // its answer, which is the one thing in this block worth protecting — see
  // finding (1) below for why fearAnswered was dragged up here at all.
  'journeyStage',
  'biggestWorry',
  'fearAnswered',
  // "Where did you find us?" (design-lab/where-found-us.html, 2026-08-06).
  // HERE by explicit placement (Nick): right after the user RECEIVED their
  // worry-answered payoff — a local trust peak — and BEFORE the skip-gated
  // medication block, so exploring/starting-soon users still get asked.
  // Never skipped; "Somewhere else" is the out. Pure insertion — draft key
  // stays pepta.onboarding.v2.
  'discoverySource',
  // Pep now arrives AFTER the app has named the user's fear and answered it,
  // so the introduction lands as "the thing that just helped you" rather than
  // as a mascot handed to a stranger. Better entrance than the old slot,
  // independent of the bounce argument.
  //
  // WHY IT SITS HERE NOW (2026-08-24). It used to be load-bearing for run
  // length: this beat was the only thing keeping the dosing stretch at 7, and
  // the note here read "do not move meetPep past nameCompanion." That
  // constraint is GONE. doseForgiveness breaks that run now, so this screen is
  // free to move for the first time and stays put on merit instead.
  //
  // The merit: Pep lands immediately before medication, route and currentDose,
  // the heaviest ask block in the flow. A guide introduced right before the
  // demanding part reads as "here is who is with you". Introduced earlier,
  // with nothing yet to guide anyone through, it is just a mascot. Brief, then
  // the work starts, which is also what keeps it from becoming annoying.
  'meetPep',
  // Optional, never a gate — the default stays 'Pep'. Sits here so the
  // introduction is still on screen; asking later would feel bolted on.
  // Nothing before this reads companionName (first use is the leanMass beat),
  // so moving the pair down from steps 3–4 costs no downstream copy.
  'nameCompanion',
  'medication',
  'route',
  'currentDose',
  // The forgiveness give (2026-08-24). Placed HERE, not later, for two
  // reasons: the "what if I'm late" anxiety is live the moment they have just
  // named a dose, and this is the screen that breaks the first seven-ask run
  // (nameCompanion → frequency) into 4 + 3. Skips itself when the drug's
  // half-life is too short for the claim to hold.
  'doseForgiveness',
  'deviceType',
  'concentration',
  'frequency',
  // Conviction beat. Deliberately AFTER medication + dose + frequency: by here
  // the user has told us what they take and how often, so "the weight you lose
  // on this" is about THEIR regimen rather than an abstract statistic.
  'leanMass',
  'lastShot',
  'shotTime',
  'instrument',
  'goalType',
  // MERGED 2026-08-25: was `sexGender` + `birthday`, two screens that
  // justified themselves with the same sentence. Merging them is also what
  // restores the 4-ask ceiling on the exploring path (see AboutYouScreen).
  'aboutYou',
  'heightWeight',
  // The muscle-floor give (2026-08-24). Breaks the goal stretch — the run the
  // header below calls "the one nobody escapes" — into 4 + 3, and answers the
  // hardest number in the flow with something instead of another question.
  'muscleFloor',
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
  'notifications',
  'crafting',
  // The standalone `auth` turn was MERGED INTO `reveal` (2026-07-29): the
  // save-your-plan auth block lives where Start today used to be, so signing
  // in IS claiming the plan — one screen fewer, and the dead tap between
  // "here is your plan" and "make an account" is gone. A saved draft sitting
  // at 'auth' resumes at 'reveal' via migrateLegacyStep in onboardingDraft.
  'reveal',
  // Trial warm-up (2026-08-01, design-lab/trial-warmup.html): the offer
  // announcement and the value carousel, AFTER the merged reveal+auth turn —
  // "See my FREE offer" landing on an account wall would be a bait-and-switch
  // that breaks the micro-commitment ladder, and 1.0.4's funnel shows auth
  // isn't leaking (8 reached the wall, 8 registered), so the gift framing is
  // spent warming the paywall instead. Both steps are also TRIAL-GATED at
  // runtime inside TrialOfferScreen: the control arm of expa9f87848e1 has no
  // trial, and these screens silently skip themselves rather than promise
  // free days that arm's wall won't deliver.
  'trialOffer',
  // Was `trialCarousel` until 2026-08-24. That screen showed invented demo
  // numbers (1.42 mg, -12 lb) on the last screen before the wall; this one
  // answers the dominant objection to a free trial instead — when am I
  // charged — using rows that already existed in paywallTimeline.ts and were
  // imported by nothing. Same trial gate: no trial on the live offering and
  // it skips itself to the paywall.
  'trialTimeline',
  // The price anchor. The wall had NO price framing of any kind — $59.99
  // arrived cold — and this user is already paying for the medication, so the
  // honest comparison is against effort already committed. Skips itself if the
  // annual product will not resolve, rather than inventing a number.
  // NOTE: the 'referral' code-entry turn used to sit between auth and the
  // paywall. Removed 2026-07-27 — near-everyone who reached it tapped Skip.
  // `ReferralCodeScreen` is kept (the only code-claim surface in the app)
  // pending a lower-friction home for it.
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
  /**
   * The picked medication's elimination half-life. Only the NUMBER is here,
   * not the medication: the flow needs to know whether the forgiveness give
   * has an honest version, nothing else about the drug.
   */
  halfLifeDays?: number | null;
  /** Whether height+weight were actually answered — gates the muscle floor. */
  hasBody?: boolean;
}

// The dosing block only makes sense for someone actively on a GLP-1.
const MEDICATION_BLOCK: readonly OnboardingStep[] = [
  'currentDose',
  // `leanMass` LEFT THIS BLOCK 2026-08-25. It was gated to active dosers, but
  // nothing on it is about their dose: it is the "where the weight comes
  // from" education and the 39% lean-mass stat, and leanMassContext already
  // degrades to "Here is why this matters." with no medication on file. It
  // was cut from the two paths that need it MOST — someone deciding whether
  // to start is exactly who that stat is for. Removing it also restores the
  // 4-ask ceiling for those paths, which fixing the doseForgiveness bug had
  // broken: that screen was wrongly showing to starting_soon users, and as a
  // beat it was accidentally the only thing splitting their run of six.
  'deviceType',
  'concentration',
  'frequency',
  'lastShot',
  'shotTime',
  'instrument',
];

export function shouldSkipStep(step: OnboardingStep, ctx: FlowContext): boolean {
  // "A day late won't undo you" is only true of a drug that stays in you for
  // days. No half-life on record, or one too short to absorb a missed dose,
  // and there is no honest version of the screen — so it goes rather than
  // reassuring someone about a dose they should actually take.
  // No recorded body, no floor. resolveWeights would happily fall back to
  // DEFAULT_BODY and the screen would show a confident number derived from
  // someone else's weight — the same failure the price anchor skips to avoid.
  if (step === 'muscleFloor') return !ctx.hasBody;

  if (step === 'doseForgiveness') {
    // NOT BEFORE THE FIRST DOSE (2026-08-25). This was gated on half-life
    // alone, so a starting_soon user was told "a day late won't undo you"
    // about a dose they had never taken — under a regimen echo that rendered
    // EMPTY, because currentDose is in MEDICATION_BLOCK and had been skipped.
    // Note this cannot be fixed by adding the step to MEDICATION_BLOCK: the
    // half-life return below runs first and would preempt that check.
    if (ctx.journeyStage && ctx.journeyStage !== 'active') return true;
    // AND NOT FOR ORALS (2026-08-25). The header used to assume orals always
    // carry a short half-life and so skip on the check below — the catalog
    // says otherwise: Rybelsus, Wegovy Pill and oral semaglutide are all
    // 7 days. The NUMBER is right for them, but every noun on the screen is
    // an injection ("one shot covers a week", axis "shot day"), so the beat
    // goes rather than telling a daily-pill user about their weekly shot.
    if (ctx.route === 'oral') return true;
    return (
      typeof ctx.halfLifeDays !== 'number' || ctx.halfLifeDays < FORGIVING_HALF_LIFE_DAYS
    );
  }
  // "Where did you start?" only means something to someone who has started.
  // Everyone else started TODAY, and heightWeight collected that weight two
  // screens earlier — so the screen asked for a number already on file. The
  // navigator mirrors currentWeight into startWeight when this is skipped.
  // An UNKNOWN stage still asks: defaulting a start weight nobody gave us is
  // how a progress chart quietly invents a loss that never happened.
  if (step === 'startWeight' && ctx.journeyStage && ctx.journeyStage !== 'active') return true;
  // Approved creators / active subscribers never see the wall — and a trial
  // pitch for a wall they'll never see is worse than pointless.
  if (
    (step === 'paywall' || step === 'trialOffer' || step === 'trialTimeline') &&
    ctx.accessActive
  ) {
    return true;
  }
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
  // The `shotDay` step was CUT (2026-08-24). It asked "Tuesdays are shot day?"
  // with the answer already derived from lastShot and pre-selected — a screen
  // to confirm something we knew. The navigator now derives shotDays when
  // lastShot is answered, and reminder settings is where it changes.
  // WHAT TIME: weekly injections as before, PLUS every daily schedule
  // regardless of route (2026-08-07) — a daily cadence with no time of day
  // projects no next dose at all, which broke oral dailies and daily
  // injectables (Saxenda/Victoza) alike. Strictly additive: the daily case
  // is the only one whose answer changed. Oral users gain this ONE question
  // and no other injection step.
  if (step === 'shotTime') {
    const isDaily = ctx.frequency === 'daily';
    const isWeeklyInjection =
      ctx.route !== 'oral' && (ctx.frequency == null || ctx.frequency === 'weekly');
    if (!isDaily && !isWeeklyInjection) return true;
  }
  return false;
}
