import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEPS,
  nextStep,
  prevStep,
  progressForStep,
  shouldSkipStep,
  stepIndex,
  type OnboardingStep,
} from './onboardingFlow';

describe('onboarding flow', () => {
  it('starts at welcome, sits sign-in right before the paywall, ends at welcomeIn', () => {
    expect(ONBOARDING_STEPS[0]).toBe('welcome');
    expect(ONBOARDING_STEPS[1]).toBe('notAlone');
    expect(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]).toBe('welcomeIn');
    expect(nextStep('welcome')).toBe('notAlone');
    // The pact answers notAlone — you are not the only one, so here is what
    // I am in for — 35 screens from any price.
    expect(nextStep('notAlone')).toBe('commitment');
    expect(nextStep('commitment')).toBe('journeyStage');
    // The rating ask is post-purchase (WelcomeInScreen), never a quiz turn.
    // The commitment pact sits between the payoff and the warm-up (2026-08-24):
    // they see their plan, promise something to themselves, and only then meet
    // an offer. It asks for nothing, so nothing skips it.
    expect(nextStep('reveal')).toBe('trialOffer'); // the warm-up sits between auth and the wall
    // The price anchor sits between the timeline and the wall (2026-08-24):
    // the wall had no price framing of any kind before it.
    // priceAnchor folded into trialTimeline's charge row (2026-08-25).
    expect(nextStep('trialTimeline')).toBe('paywall');
    // The referral code turn was removed — auth hands straight to the wall.
    
    expect(nextStep('paywall')).toBe('welcomeIn');
  });

  it('no longer routes anyone through a referral code turn', () => {
    expect(ONBOARDING_STEPS).not.toContain('referral');
  });

  it('never lands on a gated-out step, so per-step analytics cannot log phantom traffic', () => {
    // Mirrors OnboardingNavigator.advanceWith: the skip chain is resolved in a
    // pure walk BEFORE the step state is set, so a skipped step is never the
    // current step and never renders. The instrumentation effect keyed on that
    // state therefore cannot report a screen nobody saw.
    const advanceWith = (
      from: OnboardingStep,
      ctx: Parameters<typeof shouldSkipStep>[1],
    ): OnboardingStep | null => {
      let s = nextStep(from);
      while (s && shouldSkipStep(s, ctx)) s = nextStep(s);
      return s;
    };

    // "Just exploring" gates the widest span (medication picker + dose block).
    const ctx = { journeyStage: 'none' as const };
    const visited: OnboardingStep[] = ['welcome'];
    let current: OnboardingStep | null = 'welcome';

    while (current) {
      current = advanceWith(current, ctx);
      if (current) visited.push(current);
    }

    expect(visited.at(-1)).toBe('welcomeIn');
    visited.forEach((step) => {
      expect(shouldSkipStep(step, ctx)).toBe(false);
    });
    // The gated steps really were excluded (otherwise this proves nothing).
    expect(visited).not.toContain('medication');
    expect(visited).not.toContain('currentDose');
    expect(visited.length).toBeLessThan(ONBOARDING_STEPS.length);
  });

  it('never asks for an App Store rating inside the quiz', () => {
    // Apple caps review prompts per user per year — the ask belongs
    // post-purchase (WelcomeInScreen), not in front of a user who has neither
    // used the tracker nor paid.
    expect(ONBOARDING_STEPS).not.toContain('rateApp');
  });

  it('has no standalone sign-in step — auth lives on the merged reveal', () => {
    // Merged 2026-07-29: the reveal carries the save-your-plan auth block for
    // signed-out users and the plain Start-today CTA for signed-in ones. A
    // separate auth turn reappearing here means the merge regressed.
    expect(ONBOARDING_STEPS).not.toContain('auth');
    // The commitment pact sits between the payoff and the warm-up (2026-08-24):
    // they see their plan, promise something to themselves, and only then meet
    // an offer. It asks for nothing, so nothing skips it.
    expect(nextStep('reveal')).toBe('trialOffer'); // the warm-up sits between auth and the wall
    // The price anchor sits between the timeline and the wall (2026-08-24):
    // the wall had no price framing of any kind before it.
    // priceAnchor folded into trialTimeline's charge row (2026-08-25).
    expect(nextStep('trialTimeline')).toBe('paywall');
  });

  it('skips the paywall for resolved-active access (creators/subscribers)', () => {
    expect(shouldSkipStep('paywall', { accessActive: true })).toBe(true);
    expect(shouldSkipStep('paywall', {})).toBe(false);
    // welcomeIn still plays for creators.
    expect(shouldSkipStep('welcomeIn', { accessActive: true })).toBe(false);
  });

  it('has no standalone privacy-consent turn (consent rides the welcome CTA)', () => {
    expect(ONBOARDING_STEPS).not.toContain('privacy');
  });

  it('advances forward in order through the new turns', () => {
    expect(nextStep('meetPep')).toBe('nameCompanion');
    expect(nextStep('nameCompanion')).toBe('medication');
    expect(nextStep('deviceType')).toBe('concentration');
    expect(nextStep('frequency')).toBe('leanMass');
    expect(nextStep('leanMass')).toBe('lastShot');
    // shotDay was CUT (2026-08-24) — it confirmed a weekday already derived
    // from lastShot. The navigator sets shotDays on that answer instead.
    expect(nextStep('lastShot')).toBe('shotTime');
    expect(nextStep('shotTime')).toBe('instrument');
    expect(nextStep('goalPace')).toBe('company');
    expect(nextStep('company')).toBe('dailyRoutine');
    expect(nextStep('sideEffects')).toBe('symptomWeek');
    expect(nextStep('symptomWeek')).toBe('notifications');
    expect(nextStep('notifications')).toBe('crafting');
  });

  // The gives that can precede the problem statement. Kept local so the guard
  // below does not depend on the run-length block further down.
  const BEATS_EARLY = new Set<string>(['welcome', 'notAlone', 'commitment', 'meetPep']);

  it('names the problem early: the worry, then the answer, before any dosing', () => {
    // The point of the 2026-07-27 restructure. fearAnswered is the only turn
    // that states a PROBLEM; it sat at step 29 of 36, so anyone who left before
    // it never heard one reason to want this.
    expect(nextStep('journeyStage')).toBe('biggestWorry');
    expect(nextStep('biggestWorry')).toBe('fearAnswered');
    // The discovery ask (2026-08-06, Nick's placement) rides the trust peak
    // after the answered worry and the Pep introduction, before the
    // medication block.
    expect(nextStep('fearAnswered')).toBe('discoverySource');
    expect(nextStep('discoverySource')).toBe('meetPep');
    expect(nextStep('nameCompanion')).toBe('medication');
    expect(stepIndex('fearAnswered')).toBeLessThan(stepIndex('currentDose'));
    // COUNTS ASKS, NOT POSITION (2026-08-24). This was `stepIndex <= 4`, which
    // broke when the commitment pact was inserted at step 3 — a screen that
    // asks for nothing and so cannot add to the friction this guard exists to
    // bound. Its own comment already said the subject was how much the user is
    // ASKED before hearing a reason to care; it just was not measuring that.
    // Two: journeyStage and biggestWorry.
    const asksBefore = ONBOARDING_STEPS.slice(0, stepIndex('fearAnswered')).filter(
      (s) => !BEATS_EARLY.has(s),
    ).length;
    expect(asksBefore).toBeLessThanOrEqual(2);
  });

  it('never separates the worry from its answer', () => {
    // These two are a unit: ask what scares them, answer it in their own
    // words. The 2026-08-21 reorder was proposed as a straight 3-4 ↔ 5-6 swap,
    // which would have parked meetPep + nameCompanion between them. Anything
    // inserted here breaks the only reason fearAnswered was dragged forward.
    expect(stepIndex('fearAnswered') - stepIndex('biggestWorry')).toBe(1);
  });

  it('asks about the user before introducing the mascot', () => {
    // A cartoon shown before the app has said one useful thing is a bounce,
    // not an introduction. Pep arrives after the fear is named AND answered,
    // so it reads as the thing that just helped.
    expect(stepIndex('journeyStage')).toBeLessThan(stepIndex('meetPep'));
    expect(stepIndex('biggestWorry')).toBeLessThan(stepIndex('meetPep'));
    expect(stepIndex('fearAnswered')).toBeLessThan(stepIndex('meetPep'));
  });

  it('never runs more than 9 input turns without a payoff', () => {
    // Hand-maintained: a new beat that is NOT listed here scores as an input
    // turn and will fail this test. That is the intended failure — it forces
    // the question "is this really a payoff?" rather than passing silently.
    const BEATS = new Set<string>([
      'welcome', 'notAlone', 'meetPep', 'fearAnswered', 'leanMass', 'company', 'instrument', 'symptomWeek',
      'doseForgiveness', 'muscleFloor', 'commitment',
      // The warm-up gives were missing here, so the run counter was scoring
      // three payoff screens as input turns.
      'trialOffer', 'trialTimeline',
      'crafting', 'reveal', 'paywall', 'welcomeIn',
    ]);
    const runLength = (steps: readonly string[]) => {
      let run = 0;
      let worst = 0;
      for (const step of steps) {
        run = BEATS.has(step) ? 0 : run + 1;
        worst = Math.max(worst, run);
      }
      return worst;
    };

    // 12 before the 2026-07-27 restructure, 9 after it, 7 once the lean-mass
    // beat split the dosing block. The discovery ask (2026-08-06) kept this
    // at 7 for the dosing path — the beats still break every stretch. The
    // 2026-08-21 mascot reorder briefly made it 8 (nameCompanion landed next
    // to discoverySource) until meetPep was moved between them; this number
    // is the reason that pair sits where it does.
    // 12 → 9 → 7 → 4. The last step was 2026-08-24: doseForgiveness split the
    // dosing block and muscleFloor split the goal stretch, each into 4 + 3.
    // The goal stretch was the one the header calls "the one nobody escapes",
    // and it is the reason this number could not get below 7 before.
    expect(runLength(ONBOARDING_STEPS)).toBeLessThanOrEqual(4);

    // Both blocks pinned individually, so neither can regrow behind the
    // aggregate. These are the two runs the gives exist to break.
    const runOf = (from: OnboardingStep, to: OnboardingStep) =>
      runLength(
        ONBOARDING_STEPS.slice(ONBOARDING_STEPS.indexOf(from), ONBOARDING_STEPS.indexOf(to) + 1),
      );
    expect(runOf('nameCompanion', 'leanMass')).toBe(4);
    // 4 → 3 when sexGender + birthday merged into aboutYou (2026-08-25).
    expect(runOf('goalType', 'company')).toBe(3);

    // EVERY PATH, NOT JUST THE DOSING ONE (2026-08-25). This used to assert
    // `toBeLessThanOrEqual(8)` on the exploring path — a bound so loose it
    // hid a real regression: skipping the medication block puts nameCompanion
    // next to the goal stretch, and with sexGender and birthday still
    // separate that was a run of FIVE. Nobody saw it, because the aggregate
    // above only ever walks the unskipped list. Exact, and per stage, so the
    // next reorder cannot hide in the slack.
    for (const journeyStage of ['none', 'starting_soon'] as const) {
      // hasBody, because anyone being asked a goal weight has answered
      // height+weight — without it muscleFloor drops out and the walk models
      // a user who cannot exist.
      const seen = ONBOARDING_STEPS.filter((s) =>
        !shouldSkipStep(s, { journeyStage, hasBody: true }),
      );
      expect(runLength(seen)).toBe(4);
    }
  });

  it('offers the naming turn to everyone and never gates on it', () => {
    // Optional flourish: it has no skip rule, so it shows for every path, and
    // the screen itself returns undefined when the user keeps the default.
    expect(ONBOARDING_STEPS).toContain('nameCompanion');
    expect(shouldSkipStep('nameCompanion', {})).toBe(false);
    expect(shouldSkipStep('nameCompanion', { journeyStage: 'none' })).toBe(false);
    expect(shouldSkipStep('nameCompanion', { accessActive: true })).toBe(false);
    // It sits beside the introduction, not bolted on later.
    expect(stepIndex('nameCompanion') - stepIndex('meetPep')).toBe(1);
  });

  it('carries no ask whose answer the app never uses', () => {
    // experience / alsoTracking / momentum each produced a single echo line.
    // `needs` outlived them on the argument that the crafting checklist led
    // with its picks — but the paywall never received them and nothing ever
    // reported them, so a MANDATORY screen two turns from the wall bought
    // three lines of a 3.7-second animation. Cut 2026-08-21; the checklist
    // rows are derived from answers we already hold.
    for (const gone of ['experience', 'alsoTracking', 'momentum', 'needs']) {
      expect(ONBOARDING_STEPS).not.toContain(gone);
    }
  });

  it('returns null past the last step', () => {
    expect(nextStep('welcomeIn')).toBeNull();
  });

  it('walks back, with no step before the first', () => {
    expect(prevStep('nameCompanion')).toBe('meetPep');
    expect(prevStep('meetPep')).toBe('discoverySource');
    expect(prevStep('discoverySource')).toBe('fearAnswered');
    expect(prevStep('journeyStage')).toBe('commitment');
    expect(prevStep('commitment')).toBe('notAlone');
    expect(prevStep('notAlone')).toBe('welcome');
    expect(prevStep('welcome')).toBeNull();
  });

  it('keeps the rating step out of the flow (review ask moved post-purchase)', () => {
    expect(ONBOARDING_STEPS).not.toContain('rating');
  });

  it('matches the funnel progress values', () => {
    // welcome=#1, notAlone=#2, welcomeIn=last (denominator = full step count).
    const n = ONBOARDING_STEPS.length;
    expect(progressForStep('welcome')).toBeCloseTo(1 / n, 5);
    expect(progressForStep('notAlone')).toBeCloseTo(2 / n, 5);
    expect(progressForStep('commitment')).toBeCloseTo(3 / n, 5);
    expect(progressForStep('journeyStage')).toBeCloseTo(4 / n, 5);
    expect(progressForStep('biggestWorry')).toBeCloseTo(5 / n, 5);
    expect(progressForStep('fearAnswered')).toBeCloseTo(6 / n, 5);
    expect(progressForStep('welcomeIn')).toBe(1);
  });
});

describe('shouldSkipStep', () => {
  // REGRESSION (2026-08-25). doseForgiveness was gated ONLY on half-life, and
  // it is not in MEDICATION_BLOCK — so a starting_soon user, who skips
  // currentDose, still got "A day late won't undo you". Consoling someone
  // about missing a dose they have never taken, under a regimen echo that
  // renders empty because currentDose never ran.
  it('never consoles about missed doses before there are any doses', () => {
    const med = { halfLifeDays: 5 } as const;
    expect(shouldSkipStep('doseForgiveness', { ...med, journeyStage: 'active' })).toBe(false);
    expect(shouldSkipStep('doseForgiveness', { ...med, journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('doseForgiveness', { ...med, journeyStage: 'none' })).toBe(true);
  });

  // startWeight asks where they began. Someone who has not begun started
  // TODAY, and heightWeight collected that two screens earlier — so the
  // screen asks for a number we already hold. The navigator defaults it.
  it('asks where they started only of someone who has started', () => {
    expect(shouldSkipStep('startWeight', { journeyStage: 'active' })).toBe(false);
    expect(shouldSkipStep('startWeight', { journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('startWeight', { journeyStage: 'none' })).toBe(true);
    // Unknown stage must still ASK: defaulting a start weight we were never
    // told is how a progress chart quietly invents a loss.
    expect(shouldSkipStep('startWeight', {})).toBe(false);
  });

  it('keeps every dosing step for an active injectable, weekly vial user', () => {
    const ctx = {
      journeyStage: 'active',
      route: 'injection',
      deviceType: 'syringe_vial',
      frequency: 'weekly',
    } as const;
    for (const step of [
      'medication',
      'currentDose',
      'deviceType',
      'concentration',
      'frequency',
      'lastShot',
      'shotTime',
      'instrument',
    ] as const) {
      expect(shouldSkipStep(step, ctx)).toBe(false);
    }
  });

  it('asks concentration only for syringe & vial users', () => {
    expect(shouldSkipStep('concentration', { journeyStage: 'active', deviceType: 'syringe_vial' })).toBe(false);
    expect(shouldSkipStep('concentration', { journeyStage: 'active', deviceType: 'single_dose_pen' })).toBe(true);
    expect(shouldSkipStep('concentration', { journeyStage: 'active', deviceType: 'auto_injector' })).toBe(true);
    expect(shouldSkipStep('concentration', { journeyStage: 'active' })).toBe(true);
  });

  it('skips shot TIME for oral or non-weekly schedules', () => {
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'oral' })).toBe(true);
    // Daily is the ONE case that changed (2026-08-07): the time question now
    // reaches daily schedules, because without it nothing projects a next
    // dose. The weekday question still doesn't.
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'injection', frequency: 'daily' })).toBe(false);
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'oral', frequency: 'weekly' })).toBe(true);
    expect(shouldSkipStep('shotTime', { journeyStage: 'active', route: 'injection', frequency: 'weekly' })).toBe(false);
  });

  it('skips the dosing block + instrument beat for users not actively on a GLP-1', () => {
    expect(shouldSkipStep('currentDose', { journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('frequency', { journeyStage: 'none' })).toBe(true);
    expect(shouldSkipStep('medication', { journeyStage: 'none' })).toBe(true);
    expect(shouldSkipStep('medication', { journeyStage: 'starting_soon' })).toBe(false);
    expect(shouldSkipStep('instrument', { journeyStage: 'starting_soon' })).toBe(true);
    expect(shouldSkipStep('instrument', { journeyStage: 'active' })).toBe(false);
  });

  it('keeps the remaining profile turns for everyone', () => {
    for (const stage of ['active', 'starting_soon', 'none'] as const) {
      expect(shouldSkipStep('notifications', { journeyStage: stage })).toBe(false);
      expect(shouldSkipStep('company', { journeyStage: stage })).toBe(false);
      expect(shouldSkipStep('fearAnswered', { journeyStage: stage })).toBe(false);
    }
  });

  it('does not skip non-gated steps', () => {
    expect(shouldSkipStep('goalType', { journeyStage: 'none' })).toBe(false);
    expect(shouldSkipStep('aboutYou', { journeyStage: 'starting_soon' })).toBe(false);
  });
});

describe('route + deviceType gating', () => {
  it('asks the route only for ambiguous medications', () => {
    expect(shouldSkipStep('route', { journeyStage: 'active', routeLocked: true })).toBe(true);
    expect(shouldSkipStep('route', { journeyStage: 'active', routeLocked: false })).toBe(false);
  });

  it('skips the route question for users not on a medication', () => {
    expect(shouldSkipStep('route', { journeyStage: 'none' })).toBe(true);
  });

  it('asks the device only for active injection users', () => {
    expect(shouldSkipStep('deviceType', { journeyStage: 'active', route: 'injection' })).toBe(false);
    expect(shouldSkipStep('deviceType', { journeyStage: 'active', route: 'oral' })).toBe(true);
    expect(shouldSkipStep('deviceType', { journeyStage: 'starting_soon', route: 'injection' })).toBe(true);
    expect(shouldSkipStep('deviceType', { journeyStage: 'none' })).toBe(true);
  });

  it('shows the symptom-week beat only when a drawable symptom was reported', () => {
    // Gated on the actual picks, unlike every other skip rule here. "None yet"
    // and picks with no post-dose arc get no curve — a nausea graph shown to
    // someone reporting nothing reads as being told what is coming.
    expect(shouldSkipStep('symptomWeek', {})).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: [] })).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['injection_site_reaction'] })).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['hair_loss', 'other'] })).toBe(true);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['nausea'] })).toBe(false);
    expect(shouldSkipStep('symptomWeek', { sideEffects: ['other', 'fatigue'] })).toBe(false);
  });
});

// Daily cadence needs a dose time or nothing can project a next dose
// (2026-08-07). The TIME question now reaches every daily user, any route;
// the WEEKDAY question stays weekly-injection-only.
describe('shotTime for daily schedules', () => {
  it('asks the time for an oral daily user, without re-opening the injection steps', () => {
    const ctx = { journeyStage: 'active', route: 'oral', frequency: 'daily' } as const;
    expect(shouldSkipStep('shotTime', ctx)).toBe(false);
    // The steps oral users are meant to skip stay skipped.
    expect(shouldSkipStep('deviceType', ctx)).toBe(true);
    expect(shouldSkipStep('concentration', ctx)).toBe(true);
  });

  it('asks the time for a daily INJECTABLE too (Saxenda/Victoza had the same broken projection)', () => {
    const ctx = { journeyStage: 'active', route: 'injection', frequency: 'daily' } as const;
    expect(shouldSkipStep('shotTime', ctx)).toBe(false);
  });

  it('weekly is unchanged: both weekday and time', () => {
    const ctx = { journeyStage: 'active', route: 'injection', frequency: 'weekly' } as const;
    expect(shouldSkipStep('shotTime', ctx)).toBe(false);
  });

  it('biweekly still skips both — unchanged', () => {
    const ctx = { journeyStage: 'active', route: 'injection', frequency: 'biweekly' } as const;
    expect(shouldSkipStep('shotTime', ctx)).toBe(true);
  });
});
