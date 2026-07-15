// Onboarding conversation driver (v2.2). Holds the current turn + the flow
// answers, computes the dim "echo" recap for each screen from the previous
// answer (onboardingEcho — the alive/talking feel), and advances turn-by-turn.
//
// Advancement is gating-safe: an auto-advancing answer that changes gating
// (device type → concentration, frequency → shot day) is merged into a fresh
// context BEFORE choosing the next step, so the very next turn is never chosen
// from stale answers.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
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
import { ONBOARDING_DRAFT_KEY, parseDraft, serializeDraft } from './onboardingDraft';
import { echoFor, instrumentContext, companyContext } from './onboardingEcho';
import { PrivacyScreen } from './PrivacyScreen';
import { JourneyStageScreen, type JourneyStage } from './JourneyStageScreen';
import { ExperienceScreen, type ExperienceLevel } from './ExperienceScreen';
import { NeedsScreen, type NeedType } from './NeedsScreen';
import { MedicationPickerScreen } from './MedicationPickerScreen';
import { DeviceTypeScreen } from './DeviceTypeScreen';
import { DoseScreen, type DoseValue } from './DoseScreen';
import { ConcentrationScreen, type ConcentrationValue } from './ConcentrationScreen';
import { FrequencyScreen, type DoseFrequency } from './FrequencyScreen';
import { LastShotScreen } from './LastShotScreen';
import { ShotDayScreen } from './ShotDayScreen';
import { ShotTimeScreen } from './ShotTimeScreen';
import { InstrumentBeatScreen } from './InstrumentBeatScreen';
import { GoalTypeScreen, type GoalType } from './GoalTypeScreen';
import { AlsoTrackingScreen, type AlsoTracking } from './AlsoTrackingScreen';
import { SexGenderScreen, type GenderIdentity } from './SexGenderScreen';
import { BirthdayScreen } from './BirthdayScreen';
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
import { MomentumScreen, type MomentumAnswer } from './MomentumScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { CraftingScreen } from './CraftingScreen';
import { RevealScreen } from './RevealScreen';
import { PaywallScreen } from './PaywallScreen';
import { WelcomeInScreen } from './WelcomeInScreen';
import type { ActivityLevel, BiggestWorry, InjectionDeviceType, TrainingStatus } from '@pepta/shared';
import type { MedicationOption } from '../../data/medicationCatalog';
import type { MedicationRoute } from './RouteScreen';
import { RouteScreen } from './RouteScreen';
import { toDateParts, formatShortDate, type DateParts } from '../../utils/dateParts';
import { kgToLb, lbToKg, type BodyMeasure } from '../../utils/units';
import { projectGoal } from '../../utils/goalProjection';
import { previewTargets } from '../../utils/planPreview';
import { buildOnboardingPayload } from './onboardingPayload';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { deriveReminderGroups, defaultReminderState } from '../app/reminderSettings';
import { saveReminderState, syncReminderNotifications } from '../../services/reminderNotification.service';

const DEFAULT_BODY: BodyMeasure = { units: 'imperial', height: 66, weight: 184 };
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function defaultBirthday(): DateParts {
  return { year: new Date().getFullYear() - 30, month: 0, day: 1 };
}

interface FlowAnswers {
  journeyStage?: JourneyStage;
  experience?: ExperienceLevel;
  needs?: NeedType[];
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
  alsoTracking?: AlsoTracking;
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
  momentum?: MomentumAnswer;
}

function toggleEffect(effects: SideEffectType[], effect: SideEffectType): SideEffectType[] {
  return effects.includes(effect) ? effects.filter((e) => e !== effect) : [...effects, effect];
}

function toggleNeed(needs: NeedType[], need: NeedType): NeedType[] {
  return needs.includes(need) ? needs.filter((n) => n !== need) : [...needs, need];
}

// Toggle a day in/out of the multi-select set, kept sorted.
function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

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
  };
}

// Resolve current + goal weight into the body's unit (goal may be in a toggled unit).
function resolveWeights(answers: FlowAnswers) {
  const body = answers.body ?? DEFAULT_BODY;
  const bodyUnit: WeightUnit = body.units === 'metric' ? 'kg' : 'lb';
  const goalUnit = answers.goalWeightUnit ?? bodyUnit;
  const goalRaw =
    answers.goalWeight ?? (goalUnit === 'kg' ? Math.max(32, body.weight - 7) : Math.max(70, body.weight - 15));
  const goalInBodyUnit =
    goalUnit === bodyUnit ? goalRaw : Math.round(bodyUnit === 'kg' ? lbToKg(goalRaw) : kgToLb(goalRaw));
  return { body, bodyUnit, goalInBodyUnit };
}

// Crafting rows lead with the user's own T3c needs picks (verbatim, checked off
// one by one), then the standard proof rows built from their numbers.
function buildCraftingSteps(answers: FlowAnswers): string[] {
  const NEED_ROW: Record<NeedType, string> = {
    whats_working: 'Progress signals — what’s actually working',
    logging: 'One-tap logging — so it gets done',
    schedule: 'Shot-day reminders — timed to you',
    multiple_compounds: 'Multi-compound tracking — side by side',
    dose_math: 'Dose & mixing math — calculator armed',
    doctor_reports: 'Doctor-ready reports — export anytime',
  };
  const rows = (answers.needs ?? []).slice(0, 3).map((need) => NEED_ROW[need]);

  const { body, bodyUnit, goalInBodyUnit } = resolveWeights(answers);
  const projection = projectGoal({
    currentWeight: body.weight,
    goalWeight: goalInBodyUnit,
    pace: answers.pace ?? 0.5,
    now: new Date(),
  });
  const targets = previewTargets({
    currentWeight: body.weight,
    unit: bodyUnit,
    activityLevel: answers.activityLevel,
    weeklyLoss: projection.weeklyLoss,
  });
  rows.push(`Muscle guard — ${targets.proteinG} g protein a day`);
  const goalPath = projection.estimatedDate
    ? `Goal path — ${body.weight} → ${goalInBodyUnit} by ${formatShortDate(projection.estimatedDate)}`
    : `Goal path — holding at ${goalInBodyUnit} ${bodyUnit}`;
  rows.push(goalPath);
  if (answers.journeyStage === 'active' && (answers.shotDays?.length ?? 0) > 0) {
    rows.push(`Shot-day reminders — ${DAY_PLURAL[answers.shotDays![0]!]}`);
  }
  return rows;
}

// A session-level cache of the flow position (module-level, like the progress
// bar's persistent Animated.Value). If the navigator ever remounts mid-flow — a
// parent swapping branches for a frame, a Fast Refresh — the new mount restores
// INSTANTLY from here instead of flashing the hydration blank and re-reading the
// AsyncStorage draft (which was the "flash to splash, then back to where I was").
// Reset on completion so a later run starts clean.
const flowCache: { step: OnboardingStep; answers: FlowAnswers; hydrated: boolean } = {
  step: 'privacy',
  answers: {},
  hydrated: false,
};

export function OnboardingNavigator() {
  const auth = useAuth();
  const { updateDraft } = useOnboarding();
  const [step, setStepState] = useState<OnboardingStep>(flowCache.step);
  const [answers, setAnswersState] = useState<FlowAnswers>(flowCache.answers);
  const [hydrated, setHydratedState] = useState(flowCache.hydrated);
  // Forward arrivals type their entrance; stepping BACK — or restoring after a
  // remount (already hydrated this session) — renders instantly.
  const [animateEntrance, setAnimateEntrance] = useState(!flowCache.hydrated);

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
    let active = true;
    AsyncStorage.getItem(ONBOARDING_DRAFT_KEY)
      .then(parseDraft)
      .then((draft) => {
        if (active && draft && (ONBOARDING_STEPS as readonly string[]).includes(draft.step)) {
          setStep(draft.step as OnboardingStep);
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
  }, [setStep, setAnswers, setHydrated]);

  // Persist the draft as the user moves through the flow (after hydration so we
  // don't clobber the saved draft with the initial empty state).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, serializeDraft(step, answers as Record<string, unknown>)).catch(
      () => undefined,
    );
  }, [hydrated, step, answers]);

  const progress = progressForStep(step);
  const ctx = ctxFromAnswers(answers);
  const context = useMemo(() => echoFor(step, answers), [step, answers]);

  // Step over any gated-out steps in the given direction, using the passed ctx.
  const advanceWith = (from: OnboardingStep, dir: 1 | -1, withCtx: FlowContext): OnboardingStep | null => {
    let s = dir === 1 ? nextStep(from) : prevStep(from);
    while (s && shouldSkipStep(s, withCtx)) {
      s = dir === 1 ? nextStep(s) : prevStep(s);
    }
    return s;
  };

  const showBack = advanceWith(step, -1, ctx) !== null;

  // Merge an answer patch, then advance forward from a context that already
  // includes it (so gating reads the fresh answer).
  const commit = (patch: Partial<FlowAnswers>) => {
    const merged = { ...answers, ...patch };
    setAnswers(merged);
    const next = advanceWith(step, 1, ctxFromAnswers(merged));
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

  const handleComplete = async () => {
    const payload = buildOnboardingPayload(answers, new Date());
    updateDraft(payload);
    await api.completeOnboarding(payload);
    // Draft is done — clear it (and the in-memory cache) so a future run starts fresh.
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY).catch(() => undefined);
    flowCache.step = 'privacy';
    flowCache.answers = {};
    flowCache.hydrated = false;
    // Only enter the app after profile + medication setup have persisted.
    auth.markOnboardingComplete();
  };

  const handleNotificationAllow = async () => {
    const groups = deriveReminderGroups({ home: null, track: null });
    const state = defaultReminderState(groups);
    await saveReminderState(state);
    await syncReminderNotifications(groups, state);
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
    case 'privacy':
      return <PrivacyScreen progress={progress} showBack={showBack} onBack={goBack} onAccept={goNext} />;
    case 'journeyStage':
      return <JourneyStageScreen progress={progress} onBack={goBack} onAnswer={(journeyStage) => commit({ journeyStage })} />;
    case 'experience':
      return (
        <ExperienceScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(experience) => commit({ experience })}
        />
      );
    case 'needs':
      return (
        <NeedsScreen
          progress={progress}
          onBack={goBack}
          context={context}
          values={answers.needs ?? []}
          onToggle={(need) => setAnswers((a) => ({ ...a, needs: toggleNeed(a.needs ?? [], need) }))}
          onContinue={goNext}
        />
      );
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
          onChange={(lastShot) => setAnswers((a) => ({ ...a, lastShot }))}
          onContinue={goNext}
        />
      );
    case 'shotDay': {
      const derivedDay = answers.lastShot
        ? new Date(answers.lastShot.year, answers.lastShot.month, answers.lastShot.day).getDay()
        : 0;
      return (
        <ShotDayScreen
          progress={progress}
          onBack={goBack}
          context={context}
          derivedDay={derivedDay}
          value={answers.shotDays ?? [derivedDay]}
          onToggle={(day) => setAnswers((a) => ({ ...a, shotDays: toggleDay(a.shotDays ?? [derivedDay], day) }))}
          onAnswer={(shotDays) => commit({ shotDays })}
        />
      );
    }
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
        <GoalTypeScreen progress={progress} onBack={goBack} context={context} onAnswer={(goalType) => commit({ goalType })} />
      );
    case 'alsoTracking':
      return (
        <AlsoTrackingScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(alsoTracking) => commit({ alsoTracking })}
        />
      );
    case 'sexGender':
      return (
        <SexGenderScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(genderIdentity) => commit({ genderIdentity })}
        />
      );
    case 'birthday':
      return (
        <BirthdayScreen
          progress={progress}
          onBack={goBack}
          context={context}
          value={answers.birthday ?? defaultBirthday()}
          onChange={(birthday) => setAnswers((a) => ({ ...a, birthday }))}
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
    case 'momentum':
      return (
        <MomentumScreen
          progress={progress}
          onBack={goBack}
          context={context}
          onAnswer={(momentum) => commit({ momentum })}
        />
      );
    case 'notifications': {
      const sub =
        answers.journeyStage === 'active' && (answers.shotDays?.length ?? 0) > 0
          ? `${DAY_PLURAL[answers.shotDays![0]!]}${answers.shotHour != null ? ` around ${formatHour(answers.shotHour)}` : ''} — plus water and protein.`
          : undefined;
      return (
        <NotificationsScreen
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
      {screen}
    </OnboardingMotionContext.Provider>
  );
}

function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`;
}
