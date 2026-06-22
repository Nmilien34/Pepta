// Onboarding step machine (Leanient's switch-on-step pattern). Holds the current
// step + the loosely-typed flow answers that don't yet have a home in the shared
// schema. Built screens render real UI; the rest fall through to a placeholder so
// the flow is fully walkable end-to-end while we implement each one.

import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText, Button, Mascot, OnboardingScaffold } from '../../components';
import {
  nextStep,
  prevStep,
  progressForStep,
  shouldSkipStep,
  type FlowContext,
  type OnboardingStep,
} from './onboardingFlow';
import { PrivacyScreen } from './PrivacyScreen';
import { JourneyStageScreen, type JourneyStage } from './JourneyStageScreen';
import { MedicationPickerScreen } from './MedicationPickerScreen';
import { DoseScreen, type DoseValue } from './DoseScreen';
import { FrequencyScreen, type DoseFrequency } from './FrequencyScreen';
import { ShotDayScreen } from './ShotDayScreen';
import { AppleHealthScreen } from './AppleHealthScreen';
import { GoalTypeScreen, type GoalType } from './GoalTypeScreen';
import { SexGenderScreen, type GenderIdentity } from './SexGenderScreen';
import { BirthdayScreen } from './BirthdayScreen';
import { HeightWeightScreen } from './HeightWeightScreen';
import { StartWeightScreen } from './StartWeightScreen';
import { GoalWeightScreen, type WeightUnit } from './GoalWeightScreen';
import { GoalPaceScreen } from './GoalPaceScreen';
import { DailyRoutineScreen } from './DailyRoutineScreen';
import { TrainingScreen } from './TrainingScreen';
import { BiggestWorryScreen } from './BiggestWorryScreen';
import { SideEffectsScreen, type SideEffectType } from './SideEffectsScreen';
import type { ActivityLevel, BiggestWorry, TrainingStatus } from '@pepta/shared';
import type { MedicationOption } from '../../data/medicationCatalog';
import { toDateParts, type DateParts } from '../../utils/dateParts';
import { kgToLb, lbToKg, type BodyMeasure } from '../../utils/units';

function defaultBirthday(): DateParts {
  return { year: new Date().getFullYear() - 30, month: 0, day: 1 };
}

interface FlowAnswers {
  journeyStage?: JourneyStage;
  medication?: MedicationOption;
  dose?: DoseValue;
  frequency?: DoseFrequency;
  lastShot?: DateParts;
  shotDays?: number[];
  goalType?: GoalType;
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

const DEFAULT_BODY: BodyMeasure = { units: 'imperial', height: 66, weight: 184 };

// Toggle a day in/out of the multi-select set, kept sorted.
function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

export function OnboardingNavigator() {
  const [step, setStep] = useState<OnboardingStep>('privacy');
  const [answers, setAnswers] = useState<FlowAnswers>({});

  const progress = progressForStep(step);
  const ctx: FlowContext = {
    journeyStage: answers.journeyStage,
    route: answers.medication?.route,
    frequency: answers.frequency,
  };

  // Step over any gated-out steps in the given direction.
  const advance = (from: OnboardingStep, dir: 1 | -1): OnboardingStep | null => {
    let s = dir === 1 ? nextStep(from) : prevStep(from);
    while (s && shouldSkipStep(s, ctx)) {
      s = dir === 1 ? nextStep(s) : prevStep(s);
    }
    return s;
  };

  const showBack = advance(step, -1) !== null;

  const goNext = () => {
    const next = advance(step, 1);
    if (next) setStep(next);
    // TODO: when next is null (after paywall), submit the draft + complete onboarding.
  };
  const goBack = () => {
    const prev = advance(step, -1);
    if (prev) setStep(prev);
  };

  switch (step) {
    case 'privacy':
      return <PrivacyScreen progress={progress} showBack={showBack} onBack={goBack} onAccept={goNext} />;
    case 'journeyStage':
      return (
        <JourneyStageScreen
          progress={progress}
          onBack={goBack}
          value={answers.journeyStage}
          onChange={(journeyStage) => setAnswers((a) => ({ ...a, journeyStage }))}
          onContinue={goNext}
        />
      );
    case 'medication':
      return (
        <MedicationPickerScreen
          progress={progress}
          onBack={goBack}
          value={answers.medication}
          onChange={(medication) => setAnswers((a) => ({ ...a, medication }))}
          onContinue={goNext}
        />
      );
    case 'currentDose':
      return (
        <DoseScreen
          progress={progress}
          onBack={goBack}
          medication={answers.medication}
          value={answers.dose}
          onChange={(dose) => setAnswers((a) => ({ ...a, dose }))}
          onContinue={goNext}
        />
      );
    case 'frequency':
      return (
        <FrequencyScreen
          progress={progress}
          onBack={goBack}
          oral={answers.medication?.route === 'oral'}
          frequency={answers.frequency}
          onFrequencyChange={(frequency) => setAnswers((a) => ({ ...a, frequency }))}
          lastShot={answers.lastShot ?? toDateParts(new Date())}
          onLastShotChange={(lastShot) => setAnswers((a) => ({ ...a, lastShot }))}
          onContinue={goNext}
        />
      );
    case 'shotDay':
      return (
        <ShotDayScreen
          progress={progress}
          onBack={goBack}
          value={answers.shotDays ?? []}
          onToggle={(day) => setAnswers((a) => ({ ...a, shotDays: toggleDay(a.shotDays ?? [], day) }))}
          onContinue={goNext}
        />
      );
    case 'appleHealth':
      return <AppleHealthScreen progress={progress} onBack={goBack} onContinue={goNext} />;
    case 'goalType':
      return (
        <GoalTypeScreen
          progress={progress}
          onBack={goBack}
          value={answers.goalType}
          onChange={(goalType) => setAnswers((a) => ({ ...a, goalType }))}
          onContinue={goNext}
        />
      );
    case 'sexGender':
      return (
        <SexGenderScreen
          progress={progress}
          onBack={goBack}
          value={answers.genderIdentity}
          onChange={(genderIdentity) => setAnswers((a) => ({ ...a, genderIdentity }))}
          onContinue={goNext}
        />
      );
    case 'birthday':
      return (
        <BirthdayScreen
          progress={progress}
          onBack={goBack}
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
          value={answers.goalWeight ?? fallback}
          unit={unit}
          onValueChange={(goalWeight) => setAnswers((a) => ({ ...a, goalWeight }))}
          onUnitChange={(nextUnit) =>
            setAnswers((a) => {
              const current = a.goalWeight ?? fallback;
              const converted =
                nextUnit === unit
                  ? current
                  : Math.round(nextUnit === 'kg' ? lbToKg(current) : kgToLb(current));
              return { ...a, goalWeight: converted, goalWeightUnit: nextUnit };
            })
          }
          onContinue={goNext}
        />
      );
    }
    case 'goalPace': {
      const body = answers.body ?? DEFAULT_BODY;
      const bodyUnit: WeightUnit = body.units === 'metric' ? 'kg' : 'lb';
      const goalUnit = answers.goalWeightUnit ?? bodyUnit;
      const goalRaw =
        answers.goalWeight ?? (goalUnit === 'kg' ? Math.max(32, body.weight - 7) : Math.max(70, body.weight - 15));
      const goalInBodyUnit =
        goalUnit === bodyUnit ? goalRaw : Math.round(bodyUnit === 'kg' ? lbToKg(goalRaw) : kgToLb(goalRaw));
      return (
        <GoalPaceScreen
          progress={progress}
          onBack={goBack}
          pace={answers.pace ?? 0.5}
          onPaceChange={(pace) => setAnswers((a) => ({ ...a, pace }))}
          currentWeight={body.weight}
          goalWeight={goalInBodyUnit}
          unit={bodyUnit}
          onContinue={goNext}
        />
      );
    }
    case 'dailyRoutine':
      return (
        <DailyRoutineScreen
          progress={progress}
          onBack={goBack}
          value={answers.activityLevel}
          onChange={(activityLevel) => setAnswers((a) => ({ ...a, activityLevel }))}
          onContinue={goNext}
        />
      );
    case 'training':
      return (
        <TrainingScreen
          progress={progress}
          onBack={goBack}
          value={answers.trainingStatus}
          onChange={(trainingStatus) => setAnswers((a) => ({ ...a, trainingStatus }))}
          onContinue={goNext}
        />
      );
    case 'biggestWorry':
      return (
        <BiggestWorryScreen
          progress={progress}
          onBack={goBack}
          value={answers.biggestWorry}
          onChange={(biggestWorry) => setAnswers((a) => ({ ...a, biggestWorry }))}
          onContinue={goNext}
        />
      );
    case 'sideEffects':
      return (
        <SideEffectsScreen
          progress={progress}
          onBack={goBack}
          value={answers.sideEffects ?? []}
          onToggle={(effect) => setAnswers((a) => ({ ...a, sideEffects: toggleEffect(a.sideEffects ?? [], effect) }))}
          onClear={() => setAnswers((a) => ({ ...a, sideEffects: [] }))}
          onContinue={goNext}
        />
      );
    default:
      return (
        <PlaceholderStep
          step={step}
          progress={progress}
          showBack={showBack}
          onBack={goBack}
          onContinue={goNext}
        />
      );
  }
}

interface PlaceholderStepProps {
  step: OnboardingStep;
  progress: number;
  showBack: boolean;
  onBack(): void;
  onContinue(): void;
}

function PlaceholderStep({ step, progress, showBack, onBack, onContinue }: PlaceholderStepProps) {
  const theme = useTheme();
  return (
    <OnboardingScaffold
      progress={progress}
      showBack={showBack}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
        <Mascot pose="idle" size={84} />
        <AppText variant="obTitle" align="center">
          {step}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          Screen coming soon
        </AppText>
      </View>
    </OnboardingScaffold>
  );
}
