// Onboarding conversation driver (v2.2). Holds the current turn + the flow
// answers, computes the dim "echo" recap for each screen from the previous
// answer (onboardingEcho — the alive/talking feel), and advances turn-by-turn.
//
// Advancement is gating-safe: an auto-advancing answer that changes gating
// (device type → concentration, frequency → shot day) is merged into a fresh
// context BEFORE choosing the next step, so the very next turn is never chosen
// from stale answers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_STEPS,
  nextStep,
  prevStep,
  progressForStep,
  shouldSkipStep,
  type FlowContext,
  type OnboardingStep,
} from './onboardingFlow';
import { OnboardingMotionContext, convo } from '../../components';
import { StepFade } from './StepFade';
import { ONBOARDING_DRAFT_KEY, migrateLegacyStep, parseDraft, rewindResumeStep, rewindToUnansweredGate, serializeDraft } from './onboardingDraft';
import { echoFor, instrumentContext, companyContext, leanMassContext, weekdayOf } from './onboardingEcho';
import { DAY_PLURAL, DEFAULT_BODY, buildCraftingSteps, resolveWeights } from './craftingSteps';
import { symptomForWeekBeat } from './symptomWeek';
import { MeetPepScreen } from './MeetPepScreen';
import { NameCompanionScreen } from './NameCompanionScreen';
import { WelcomeScreen } from '../auth/WelcomeScreen';
import { NotAloneScreen } from './NotAloneScreen';
import { SignInScreen } from '../auth/SignInScreen';
import { JourneyStageScreen, type JourneyStage } from './JourneyStageScreen';
import { MedicationPickerScreen } from './MedicationPickerScreen';
import { DeviceTypeScreen } from './DeviceTypeScreen';
import { DoseScreen, type DoseValue } from './DoseScreen';
import { ConcentrationScreen, type ConcentrationValue } from './ConcentrationScreen';
import { FrequencyScreen, type DoseFrequency } from './FrequencyScreen';
import { LastShotScreen } from './LastShotScreen';
import { ShotTimeScreen } from './ShotTimeScreen';
import { InstrumentBeatScreen } from './InstrumentBeatScreen';
import { LeanMassBeatScreen } from './LeanMassBeatScreen';
import { SymptomWeekBeatScreen } from './SymptomWeekBeatScreen';
import { GoalTypeScreen, type GoalType } from './GoalTypeScreen';
import { AboutYouScreen, type GenderIdentity } from './AboutYouScreen';
import { HeightWeightScreen } from './HeightWeightScreen';
import { StartWeightScreen } from './StartWeightScreen';
import { GoalWeightScreen, type WeightUnit } from './GoalWeightScreen';
import { GoalPaceScreen } from './GoalPaceScreen';
import { CompanyBeatScreen } from './CompanyBeatScreen';
import { DailyRoutineScreen } from './DailyRoutineScreen';
import { TrainingScreen } from './TrainingScreen';
import { SideEffectsScreen, type SideEffectType } from './SideEffectsScreen';
import { BiggestWorryScreen } from './BiggestWorryScreen';
import { FearAnsweredScreen } from './FearAnsweredScreen';
import { DiscoverySourceScreen } from './DiscoverySourceScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { CraftingScreen } from './CraftingScreen';
import { RevealScreen } from './RevealScreen';
import { TrialOfferScreen } from './TrialOfferScreen';
import { TrialTimelineScreen } from './TrialTimelineScreen';
import { DoseForgivenessScreen } from './DoseForgivenessScreen';
import { MuscleFloorScreen } from './MuscleFloorScreen';
import { CommitmentScreen } from './CommitmentScreen';
import { PriceAnchorScreen } from './PriceAnchorScreen';
import { PaywallScreen } from './PaywallScreen';
import { WelcomeInScreen } from './WelcomeInScreen';
import type { ActivityLevel, BiggestWorry, DiscoverySource, InjectionDeviceType, TrainingStatus } from '@pepta/shared';
import type { MedicationOption } from '../../data/medicationCatalog';
import type { MedicationRoute } from './RouteScreen';
import { RouteScreen } from './RouteScreen';
import { toDateParts, type DateParts } from '../../utils/dateParts';
import { kgToLb, lbToKg, type BodyMeasure } from '../../utils/units';
import { projectGoal } from '../../utils/goalProjection';
import { previewTargets, proteinFloorG } from '../../utils/planPreview';
import { buildRiskProfile } from '../../utils/riskProfile';
import { buildOnboardingPayload } from './onboardingPayload';
import { api } from '../../services/api';
import { writeCompanionName } from '../../services/companionNameStore';
import { useAuth } from '../../context/AuthContext';
import { useAccess } from '../../context/AccessContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { deriveReminderGroups, defaultReminderState } from '../app/reminderSettings';
import { requestReminderPermission, saveReminderState, syncReminderNotifications } from '../../services/reminderNotification.service';
import { logDiscoverySourceReported, logOnboardingCompleted, logOnboardingStarted, logOnboardingStep } from '../../services/funnelEvents';


function defaultBirthday(): DateParts {
  return { year: new Date().getFullYear() - 30, month: 0, day: 1 };
}

export interface FlowAnswers {
  journeyStage?: JourneyStage;
  discoverySource?: DiscoverySource;
  companionName?: string;
  medication?: MedicationOption;
  route?: MedicationRoute;
  deviceType?: InjectionDeviceType;
  concentration?: ConcentrationValue;
  dose?: DoseValue;
  frequency?: DoseFrequency;
  lastShot?: DateParts;
  shotDays?: number[];
  shotHour?: number;
  goalType?: GoalType;
  goalNote?: string;
  genderIdentity?: GenderIdentity;
  birthday?: DateParts;
  body?: BodyMeasure;
  startWeight?: number;
  startDate?: DateParts;
  goalWeight?: number;
  goalWeightUnit?: WeightUnit;
  pace?: number;
  activityLevel?: ActivityLevel;
  trainingStatus?: TrainingStatus;
  biggestWorry?: BiggestWorry;
  sideEffects?: SideEffectType[];
}

function toggleEffect(effects: SideEffectType[], effect: SideEffectType): SideEffectType[] {
  return effects.includes(effect) ? effects.filter((e) => e !== effect) : [...effects, effect];
}

// Toggle a day in/out of the multi-select set, kept sorted.
// The explicit route answer (ambiguous meds only) overrides the catalog
// default; "unsure" falls back to the catalog route (injection).
function ctxFromAnswers(a: FlowAnswers): FlowContext {
  const resolvedRoute =
    a.route === 'injection' || a.route === 'oral' ? a.route : a.medication?.route;
  return {
    journeyStage: a.journeyStage,
    route: resolvedRoute,
    routeLocked: a.medication ? !a.medication.routeAmbiguous : false,
    deviceType: a.deviceType,
    frequency: a.frequency,
    sideEffects: a.sideEffects,
    // Only the number reaches the step machine — it decides whether the
    // forgiveness give has an honest version, nothing more.
    halfLifeDays: a.medication?.halfLifeDays ?? null,
    hasBody: a.body != null,
  };
}

// A session-level cache of the flow position (module-level, like the progress
// bar's persistent Animated.Value). If the navigator ever remounts mid-flow — a
// parent swapping branches for a frame, a Fast Refresh — the new mount restores
// INSTANTLY from here instead of flashing the hydration blank and re-reading the
// AsyncStorage draft (which was the "flash to splash, then back to where I was").
// Reset on completion so a later run starts clean.
const flowCache: {
  step: OnboardingStep;
  answers: FlowAnswers;
  hydrated: boolean;
  // The auth-transition memory lives HERE, not in a ref: signing in flips
  // AccessGate through its authenticated-undecided branch, which unmounts and
  // remounts this navigator — a ref re-initializes to "already signed in" and
  // the reveal→warm-up auto-advance is lost, so the user lands back on a
  // rebuilt reveal with a redundant Start-today tap (Nick, 1.0.5 (28)).
  wasAuthenticated: boolean;
} = {
  step: 'welcome',
  answers: {},
  hydrated: false,
  wasAuthenticated: false,
};

export function OnboardingNavigator() {
  const auth = useAuth();
  const access = useAccess();
  const accessActive = access.decision?.state === 'active';
  const { updateDraft } = useOnboarding();
  const [step, setStepState] = useState<OnboardingStep>(flowCache.step);
  const [answers, setAnswersState] = useState<FlowAnswers>(flowCache.answers);
  const [hydrated, setHydratedState] = useState(flowCache.hydrated);
  // Forward arrivals type their entrance; stepping BACK — or restoring after a
  // remount (already hydrated this session) — renders instantly.
  const [animateEntrance, setAnimateEntrance] = useState(!flowCache.hydrated);
  // Returning-user sign-in sheet, opened from the welcome screen's "Sign in".
  const [signInOpen, setSignInOpen] = useState(false);

  // Keep the module cache in lockstep with state so a remount reads the latest.
  const setStep = useCallback((next: OnboardingStep) => {
    flowCache.step = next;
    setStepState(next);
  }, []);
  const setAnswers = useCallback((next: FlowAnswers | ((prev: FlowAnswers) => FlowAnswers)) => {
    setAnswersState((prev) => {
      const value = typeof next === 'function' ? (next as (p: FlowAnswers) => FlowAnswers)(prev) : next;
      flowCache.answers = value;
      return value;
    });
  }, []);
  const setHydrated = useCallback((value: boolean) => {
    flowCache.hydrated = value;
    setHydratedState(value);
  }, []);

  // Resume an in-progress onboarding draft on the FIRST mount of the session (a
  // malformed/unknown step falls back to the start). A remount skips this — the
  // position is already restored from the cache above, so there's no blank.
  useEffect(() => {
    if (flowCache.hydrated) return;
    // First mount of the session: seed the auth-transition memory with the
    // CURRENT state, so a user who resumes already signed in reads as
    // "no transition" and is never flung past their own payoff screen.
    flowCache.wasAuthenticated = auth.isAuthenticated;
    let active = true;
    AsyncStorage.getItem(ONBOARDING_DRAFT_KEY)
      .then(parseDraft)
      .then((draft) => {
        if (!active || !draft) return;
        // A draft can name a step that no longer exists ('auth' → 'reveal');
        // migrate before the membership check so those users resume instead
        // of restarting the whole quiz. Then rewind offer-tail drafts to the
        // reveal: a fresh session must reopen on the payoff, never straight
        // onto the paywall they just walked away from (2026-08-07).
        // …then rewind past any GATE the reorder left unanswered: a draft
        // parked on a step that moved BEHIND journeyStage would otherwise
        // resume with the medication-block gate undefined.
        const step = rewindToUnansweredGate(
          rewindResumeStep(migrateLegacyStep(draft.step)),
          draft.answers as Record<string, unknown>,
          ONBOARDING_STEPS,
        );
        if ((ONBOARDING_STEPS as readonly string[]).includes(step)) {
          setStep(step as OnboardingStep);
          setAnswers(draft.answers as FlowAnswers);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [setStep, setAnswers, setHydrated, auth.isAuthenticated]);

  // Persist the draft as the user moves through the flow (after hydration so we
  // don't clobber the saved draft with the initial empty state).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, serializeDraft(step, answers as Record<string, unknown>)).catch(
      () => undefined,
    );
  }, [hydrated, step, answers]);

  // Funnel: first onboarding screen after a fresh install (the service guards
  // once-per-install, so remounts and resumed drafts can't re-fire it).
  useEffect(() => {
    if (hydrated) logOnboardingStarted();
  }, [hydrated]);

  // Funnel: per-step dropoff curve. THE single instrumentation point — the
  // rendered step is exactly this state (the render is a `switch (step)`), so
  // hooking here counts screens actually seen and nothing else.
  //
  // Gated on `hydrated` for the same reason onboarding_started is: until the
  // saved draft resolves, `step` still holds the cache default ('welcome')
  // while a blank frame renders, so an ungated log would report a step a
  // resuming user never saw. Steps gated out by shouldSkipStep can never
  // appear here at all — advanceWith walks the whole skip chain in a pure
  // function and only the surviving step is ever passed to setStep.
  useEffect(() => {
    if (!hydrated) return;
    logOnboardingStep(step, ONBOARDING_STEPS.indexOf(step));
  }, [hydrated, step]);

  // Funnel: every step is answered the moment the paywall becomes the step —
  // fire onboarding_completed right before it presents (once per install).
  useEffect(() => {
    if (step === 'paywall') logOnboardingCompleted();
  }, [step]);

  const progress = progressForStep(step);
  const ctx = {
    ...ctxFromAnswers(answers),
    accessActive,
  };
  const context = useMemo(() => echoFor(step, answers), [step, answers]);

  // Step over any gated-out steps in the given direction, using the passed ctx.
  const advanceWith = useCallback(
    (from: OnboardingStep, dir: 1 | -1, withCtx: FlowContext): OnboardingStep | null => {
      let s = dir === 1 ? nextStep(from) : prevStep(from);
      while (s && shouldSkipStep(s, withCtx)) {
        s = dir === 1 ? nextStep(s) : prevStep(s);
      }
      return s;
    },
    [],
  );

  // Merge an answer patch, then advance forward from a context that already
  // includes it (so gating reads the fresh answer).
  const commit = (patch: Partial<FlowAnswers>) => {
    const merged = { ...answers, ...patch };
    setAnswers(merged);
    const next = advanceWith(step, 1, {
      ...ctxFromAnswers(merged),
        accessActive,
    });
    if (next) {
      setAnimateEntrance(true);
      setStep(next);
    }
  };

  const goNext = () => commit({});
  const goBack = () => {
    const prev = advanceWith(step, -1, ctx);
    if (prev) {
      setAnimateEntrance(false);
      setStep(prev);
    }
  };

  // Signing in — from the merged reveal's save block, or via the welcome's
  // returning-user "Sign in" — is the trigger to move on: close the sheet, and
  // if the sign-in HAPPENED on the reveal, advance to the next step (the trial
  // warm-up, or straight to the wall when it gates itself out). The ref
  // makes this transition-only: a user who resumes already signed in lands on
  // the reveal's Start-today variant and taps through themselves, instead of
  // being flung past their own payoff screen on mount.
  useEffect(() => {
    const was = flowCache.wasAuthenticated;
    flowCache.wasAuthenticated = auth.isAuthenticated;
    if (!auth.isAuthenticated) return;
    setSignInOpen(false);
    if (!was && step === 'reveal') {
      const next = advanceWith('reveal', 1, ctxFromAnswers(answers));
      if (next) {
        setAnimateEntrance(true);
        setStep(next);
      }
    }
  }, [auth.isAuthenticated, step, answers, advanceWith, setStep]);

  const handleComplete = async () => {
    const payload = buildOnboardingPayload(answers, new Date());
    updateDraft(payload);
    await api.completeOnboarding(payload);

    // The companion name is written SEPARATELY from the completion payload,
    // and stored locally first. The profile schema is .strict(), so a backend
    // predating the field would reject the whole payload and strand the user
    // at the last step of the funnel. Sending it alone means an older backend
    // 400s only this call — and because the name is saved locally, the user
    // still sees their pick and useCompanionName retries the write until it
    // lands. Nothing is lost whichever order client and backend ship in.
    if (answers.companionName) {
      await writeCompanionName(answers.companionName, false);
      await api
        .updateProfileSettings({ companionName: answers.companionName })
        .then(() => writeCompanionName(answers.companionName!, true))
        .catch(() => undefined);
    }
    // "Where did you find us?" — its own endpoint, best-effort: an old
    // backend 404s only this call, and the server upserts so a replayed
    // draft can never double-record. Never blocks completion.
    if (answers.discoverySource) {
      await api.recordDiscoverySource(answers.discoverySource).catch(() => undefined);
    }
    // Draft is done — clear it (and the in-memory cache) so a future run starts fresh.
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY).catch(() => undefined);
    flowCache.step = 'welcome';
    flowCache.answers = {};
    flowCache.hydrated = false;
    flowCache.wasAuthenticated = false;
    // Reminders are armed BEFORE entering the app, so a brand-new user's first
    // dose reminder is already queued rather than waiting on a later sync.
    await armRemindersAfterOnboarding();
    // Only enter the app after profile + medication setup have persisted.
    auth.markOnboardingComplete();
  };

  // PERMISSION ONLY. This step runs BEFORE the medication schedule exists, so
  // it used to derive reminder groups from {home: null, track: null} — which
  // yields dose_due defaultOn:false — and PERSIST that. Every onboarded user
  // ended up with dose reminders switched off by a bug rather than a choice.
  // The prompt belongs here, framed by this screen; the arming waits until
  // handleComplete, when there is a real schedule to arm against.
  const handleNotificationAllow = async () => {
    await requestReminderPermission().catch(() => undefined);
  };

  /**
   * Arm reminders once the schedule is REAL.
   *
   * Runs after completeOnboarding, so /home now carries the nextDose the
   * backend projects from the schedule we just created (which needs no logged
   * dose — see projectNextDoseAt's schedule anchor). Best-effort throughout:
   * reminders must never block someone from entering the app.
   *
   * Does not prompt: requestReminderPermission already asked at the
   * notifications step, and syncReminderNotifications no-ops when permission
   * was refused. A denied user computes everything and fires nothing.
   */
  const armRemindersAfterOnboarding = async () => {
    try {
      const [home, schedules] = await Promise.all([
        api.getHome(),
        api.listSchedules().catch(() => []),
      ]);
      const groups = deriveReminderGroups({ home, track: null, schedules });
      const state = defaultReminderState(groups);
      await saveReminderState(state);
      await syncReminderNotifications(groups, state);
    } catch {
      // ReminderRefreshGate re-derives on the first Home load and on every
      // foreground, so a failure here costs timing, never the reminder.
    }
  };

  // Hold the first frame until the saved draft (if any) has been restored. Use
  // the onboarding ground so this frame is indistinguishable from a turn — even
  // if it ever shows, there is no visible "splash" flash.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: convo.ground }} />;
  }

  // Every turn renders under the motion provider so it knows whether to play
  // its entrance (forward) or appear instantly (back).
  const screen = ((): React.ReactNode => {
  switch (step) {
    case 'welcome':
      return <WelcomeScreen onContinue={goNext} onSignIn={() => setSignInOpen(true)} />;
    case 'notAlone':
      return <NotAloneScreen progress={progress} onBack={goBack} onContinue={goNext} />;
    case 'meetPep':
      return <MeetPepScreen progress={progress} onBack={goBack} onContinue={goNext} />;
    case 'nameCompanion':
      return (
        <NameCompanionScreen
          progress={progress}
          onBack={goBack}
          onContinue={(companionName) => commit({ companionName })}
        />
      );
    case 'journeyStage':
      return <JourneyStageScreen progress={progress} onBack={goBack} onAnswer={(journeyStage) => commit({ journeyStage })} />;
    case 'medication':
      return (
        <MedicationPickerScreen
          progress={progress}
          onBack={goBack}
          context={context}
          value={answers.medication}
          onAnswer={(medication) => commit({ medication })}
        />
      );
    case 'route':
      return (
        <RouteScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(route) => commit({ route })}
        />
      );
    case 'currentDose':
      return (
        <DoseScreen
          progress={progress}
          onBack={goBack}
          context={context}
          medication={answers.medication}
          value={answers.dose}
          onSelect={(dose) => setAnswers((a) => ({ ...a, dose }))}
          onContinue={goNext}
        />
      );
    case 'doseForgiveness': {
      const med = answers.medication;
      // shouldSkipStep guarantees both, but the screen states its own
      // requirement rather than trusting the router.
      if (!med || typeof med.halfLifeDays !== 'number') return null;
      return (
        <DoseForgivenessScreen
          progress={progress}
          onBack={goBack}
          onContinue={goNext}
          // "Tirzepatide · 5 mg." — frequency is not answered yet at this
          // point and leanMassContext simply omits it, which is the echo the
          // frame specifies.
          context={leanMassContext(answers)}
          medicationName={med.name}
          halfLifeDays={med.halfLifeDays}
        />
      );
    }
    case 'deviceType':
      return (
        <DeviceTypeScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(deviceType) => commit({ deviceType })}
        />
      );
    case 'concentration':
      return (
        <ConcentrationScreen
          progress={progress}
          onBack={goBack}
          context={context}
          value={answers.concentration}
          onSelect={(concentration) => setAnswers((a) => ({ ...a, concentration }))}
          onContinue={goNext}
        />
      );
    case 'frequency':
      return (
        <FrequencyScreen
          progress={progress}
          onBack={goBack}
          context={context}
          oral={ctx.route === 'oral'}
          onAnswer={(frequency) => commit({ frequency })}
        />
      );
    case 'lastShot':
      return (
        <LastShotScreen
          progress={progress}
          onBack={goBack}
          context={context}
          oral={ctx.route === 'oral'}
          value={answers.lastShot ?? toDateParts(new Date())}
          onChange={(lastShot) =>
            setAnswers((a) => ({
              ...a,
              lastShot,
              // The shotDay screen used to ask "Tuesdays are shot day?" with
              // the answer already derived from this date and pre-selected.
              // It was a confirmation of something we knew, so it is derived
              // here instead — changeable in reminder settings. Only for
              // weekly injectors. Editing lastShot on a back-step re-derives,
              // which is right: the two answers describe the same schedule.
              shotDays:
                a.frequency !== 'weekly' || a.route === 'oral'
                  ? a.shotDays
                  : [weekdayOf(lastShot)],
            }))
          }
          onContinue={goNext}
        />
      );
    case 'shotTime':
      return (
        <ShotTimeScreen
          progress={progress}
          onBack={goBack}
          context={context}
          exactHour={answers.shotHour ?? 20}
          onExactHourChange={(shotHour) => setAnswers((a) => ({ ...a, shotHour }))}
          onAnswer={(shotHour) => commit({ shotHour })}
        />
      );
    case 'leanMass':
      return (
        <LeanMassBeatScreen
          progress={progress}
          onBack={goBack}
          context={leanMassContext(answers)}
          companionName={answers.companionName}
          onContinue={goNext}
        />
      );
    case 'symptomWeek': {
      const effect = symptomForWeekBeat(answers.sideEffects);
      // Belt and braces: shouldSkipStep already gates this, but rendering a
      // curve with no symptom to title it would be a crash, so fall through.
      if (!effect) return null;
      return (
        <SymptomWeekBeatScreen
          progress={progress}
          onBack={goBack}
          context={context}
          effect={effect}
          onContinue={goNext}
        />
      );
    }
    case 'instrument':
      return (
        <InstrumentBeatScreen
          progress={progress}
          onBack={goBack}
          context={instrumentContext(answers)}
          onContinue={goNext}
        />
      );
    case 'goalType':
      return (
        <GoalTypeScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(answer) => commit(answer)}
        />
      );
    case 'aboutYou':
      return (
        <AboutYouScreen
          progress={progress}
          onBack={goBack}
          context={context}
          genderIdentity={answers.genderIdentity}
          onGenderChange={(genderIdentity) => setAnswers((a) => ({ ...a, genderIdentity }))}
          birthday={answers.birthday ?? defaultBirthday()}
          onBirthdayChange={(birthday) => setAnswers((a) => ({ ...a, birthday }))}
          onContinue={goNext}
        />
      );
    case 'heightWeight':
      return (
        <HeightWeightScreen
          progress={progress}
          onBack={goBack}
          context={context}
          value={answers.body ?? DEFAULT_BODY}
          onChange={(body) => setAnswers((a) => ({ ...a, body }))}
          onContinue={goNext}
        />
      );
    case 'muscleFloor': {
      const { body, bodyUnit } = resolveWeights(answers);
      return (
        <MuscleFloorScreen
          progress={progress}
          onBack={goBack}
          onContinue={goNext}
          context={context}
          proteinG={proteinFloorG(body.weight, bodyUnit)}
        />
      );
    }
    case 'startWeight': {
      const body = answers.body ?? DEFAULT_BODY;
      return (
        <StartWeightScreen
          progress={progress}
          onBack={goBack}
          context={context}
          units={body.units}
          currentWeight={body.weight}
          startWeight={answers.startWeight ?? body.weight}
          onStartWeightChange={(startWeight) => setAnswers((a) => ({ ...a, startWeight }))}
          startDate={answers.startDate ?? toDateParts(new Date())}
          onStartDateChange={(startDate) => setAnswers((a) => ({ ...a, startDate }))}
          onContinue={goNext}
        />
      );
    }
    case 'goalWeight': {
      const body = answers.body ?? DEFAULT_BODY;
      const unit: WeightUnit = answers.goalWeightUnit ?? (body.units === 'metric' ? 'kg' : 'lb');
      const fallback = unit === 'kg' ? Math.max(32, body.weight - 7) : Math.max(70, body.weight - 15);
      return (
        <GoalWeightScreen
          progress={progress}
          onBack={goBack}
          context={context}
          value={answers.goalWeight ?? fallback}
          unit={unit}
          onValueChange={(goalWeight) => setAnswers((a) => ({ ...a, goalWeight }))}
          onUnitChange={(nextUnit) =>
            setAnswers((a) => {
              const current = a.goalWeight ?? fallback;
              const converted =
                nextUnit === unit ? current : Math.round(nextUnit === 'kg' ? lbToKg(current) : kgToLb(current));
              return { ...a, goalWeight: converted, goalWeightUnit: nextUnit };
            })
          }
          onContinue={goNext}
        />
      );
    }
    case 'goalPace': {
      const { body, bodyUnit, goalInBodyUnit } = resolveWeights(answers);
      return (
        <GoalPaceScreen
          progress={progress}
          onBack={goBack}
          context={context}
          pace={answers.pace ?? 0.55}
          onPaceChange={(pace) => setAnswers((a) => ({ ...a, pace }))}
          currentWeight={body.weight}
          goalWeight={goalInBodyUnit}
          unit={bodyUnit}
          onContinue={goNext}
        />
      );
    }
    case 'company':
      return (
        <CompanyBeatScreen
          progress={progress}
          onBack={goBack}
          context={companyContext(answers, new Date())}
          onContinue={goNext}
        />
      );
    case 'dailyRoutine':
      return (
        <DailyRoutineScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(activityLevel) => commit({ activityLevel })}
        />
      );
    case 'training':
      return (
        <TrainingScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(trainingStatus) => commit({ trainingStatus })}
        />
      );
    case 'sideEffects':
      return (
        <SideEffectsScreen
          oral={ctx.route === 'oral'}
          progress={progress}
          onBack={goBack}
          context={context}
          value={answers.sideEffects ?? []}
          onToggle={(effect) => setAnswers((a) => ({ ...a, sideEffects: toggleEffect(a.sideEffects ?? [], effect) }))}
          onClear={() => setAnswers((a) => ({ ...a, sideEffects: [] }))}
          onContinue={goNext}
        />
      );
    case 'biggestWorry':
      return (
        <BiggestWorryScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(biggestWorry) => commit({ biggestWorry })}
        />
      );
    case 'fearAnswered':
      return <FearAnsweredScreen progress={progress} onBack={goBack} worry={answers.biggestWorry} onContinue={goNext} />;
    case 'discoverySource':
      return (
        <DiscoverySourceScreen
          progress={progress}
          onBack={goBack}
          onAnswer={(discoverySource) => {
            // Device-level event fires NOW (pre-auth); the backend copy is
            // written best-effort in handleComplete, once a user exists.
            logDiscoverySourceReported(discoverySource);
            commit({ discoverySource });
          }}
        />
      );
    case 'notifications': {
      const sub =
        answers.journeyStage === 'active' && (answers.shotDays?.length ?? 0) > 0
          ? `${DAY_PLURAL[answers.shotDays![0]!]}${answers.shotHour != null ? ` around ${formatHour(answers.shotHour)}` : ''} — plus water and protein.`
          : undefined;
      return (
        <NotificationsScreen
          oral={ctx.route === 'oral'}
          progress={progress}
          onBack={goBack}
          context={context}
          sub={sub}
          onAllow={handleNotificationAllow}
          onContinue={goNext}
        />
      );
    }
    case 'crafting':
      return <CraftingScreen progress={progress} steps={buildCraftingSteps(answers)} onDone={goNext} />;
    case 'reveal': {
      const { body, bodyUnit, goalInBodyUnit } = resolveWeights(answers);
      const projection = projectGoal({
        currentWeight: body.weight,
        goalWeight: goalInBodyUnit,
        pace: answers.pace ?? 0.55,
        now: new Date(),
      });
      const targets = previewTargets({
        currentWeight: body.weight,
        unit: bodyUnit,
        activityLevel: answers.activityLevel,
        weeklyLoss: projection.weeklyLoss,
      });
      return (
        <RevealScreen
          risk={buildRiskProfile({
            weeklyLoss: projection.weeklyLoss,
            weight: body.weight,
            trainingStatus: answers.trainingStatus,
            activityLevel: answers.activityLevel,
            // Age from the birthday they gave; the risk model treats a
            // missing one as unknown, never as young.
            ageYears: answers.birthday
              ? new Date().getFullYear() - answers.birthday.year
              : undefined,
          })}
          authenticated={auth.isAuthenticated}
          progress={progress}
          startWeight={answers.startWeight ?? body.weight}
          goalWeight={goalInBodyUnit}
          unit={bodyUnit}
          targets={targets}
          projection={projection}
          onContinue={goNext}
        />
      );
    }
    case 'commitment':
      return <CommitmentScreen progress={progress} onBack={goBack} onSigned={goNext} />;
    case 'trialOffer':
      return (
        <TrialOfferScreen
          progress={progress}
          onBack={goBack}
          // The gift comes from the companion they named in step 4, not from
          // "we" — useCompanionName reads the profile, which does not exist
          // yet mid-onboarding, so the answer is passed straight through.
          companionName={answers.companionName?.trim() || 'Pep'}
          goalWeight={Math.round(resolveWeights(answers).goalInBodyUnit)}
          goalWeightUnit={resolveWeights(answers).bodyUnit}
          onContinue={goNext}
          // Control arm / no eligible trial / error: skip the whole warm-up.
          // Advancing from trialTimeline walks shouldSkipStep, so this lands
          // on the paywall (or past it, for active-access users).
          onSkipToWall={() => {
            const next = advanceWith('trialTimeline', 1, ctx);
            if (next) {
              setAnimateEntrance(true);
              setStep(next);
            }
          }}
        />
      );
    case 'trialTimeline':
      return (
        <TrialTimelineScreen
          progress={progress}
          onBack={goBack}
          onContinue={goNext}
          // Same escape as the offer screen's: the control arm has no trial,
          // so rather than show a timeline of dates that will not happen, go
          // straight to the wall.
          onSkipToWall={() => {
            const next = advanceWith('trialTimeline', 1, ctx);
            if (next) setStep(next);
          }}
        />
      );
    case 'priceAnchor':
      return (
        <PriceAnchorScreen
          progress={progress}
          onBack={goBack}
          onContinue={goNext}
          onSkip={() => {
            const next = advanceWith('priceAnchor', 1, ctx);
            if (next) setStep(next);
          }}
        />
      );
    case 'paywall':
      return <PaywallScreen onComplete={goNext} />;
    case 'welcomeIn':
      return <WelcomeInScreen onEnterApp={handleComplete} />;
    default:
      return <View style={{ flex: 1, backgroundColor: convo.ground }} />;
  }
  })();

  return (
    <OnboardingMotionContext.Provider value={{ animate: animateEntrance }}>
      {/* Ground-colored canvas behind the fade so the brief dip between turns
          reads as a soft blink on the onboarding ground, never a flash. */}
      <View style={{ flex: 1, backgroundColor: convo.ground }}>
        <StepFade stepKey={step}>{screen}</StepFade>
      </View>
      <Modal
        visible={signInOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSignInOpen(false)}
      >
        <SignInScreen
          onBack={() => setSignInOpen(false)}
          title="Welcome back"
          subtitle="Sign in to pick up right where you left off."
        />
      </Modal>
    </OnboardingMotionContext.Provider>
  );
}

function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}
