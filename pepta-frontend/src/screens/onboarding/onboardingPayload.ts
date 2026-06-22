// Pure mapper: navigator flow answers → the typed OnboardingCompleteInput the
// backend expects. No RN imports → unit-testable. Where the lab collected fields
// the schema doesn't have (genderIdentity → sex, goalWeight/goalPace), we resolve
// to the closest schema field or drop them (flagged TODO). The api call is real
// and correct so wiring the live backend is a no-op swap.

import type { ActivityLevel, BiggestWorry, OnboardingCompleteInput, TrainingStatus } from '@pepta/shared';
import type { MedicationOption } from '../../data/medicationCatalog';
import { toIsoDate, type DateParts } from '../../utils/dateParts';
import type { BodyMeasure } from '../../utils/units';
import type { JourneyStage } from './JourneyStageScreen';
import type { DoseValue } from './DoseScreen';
import type { DoseFrequency } from './FrequencyScreen';
import type { GoalType } from './GoalTypeScreen';
import type { GenderIdentity } from './SexGenderScreen';
import type { WeightUnit } from './GoalWeightScreen';
import type { SideEffectType } from './SideEffectsScreen';

export interface OnboardingAnswers {
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

const DEFAULT_BODY: BodyMeasure = { units: 'imperial', height: 66, weight: 184 };

function ageFromBirthday(b: DateParts, now: Date): number {
  let age = now.getFullYear() - b.year;
  const beforeBirthday = now.getMonth() < b.month || (now.getMonth() === b.month && now.getDate() < b.day);
  if (beforeBirthday) age -= 1;
  return Math.max(18, Math.min(100, age));
}

// Sex (optional in the schema) is used for the calorie math. Man→male, everyone
// else defaults to female; genderIdentity is preserved separately.
function sexFromGender(gender: GenderIdentity | undefined): 'male' | 'female' {
  return gender === 'man' ? 'male' : 'female';
}

// The pace slider (0..1) maps to the schema's goalPace enum.
function paceToEnum(pace: number | undefined): 'gentle' | 'steady' | 'ambitious' {
  const p = pace ?? 0.5;
  if (p < 0.4) return 'gentle';
  if (p < 0.72) return 'steady';
  return 'ambitious';
}

function isoDatetime(parts: DateParts | undefined, now: Date): string {
  if (!parts) return now.toISOString();
  return new Date(parts.year, parts.month, parts.day).toISOString();
}

export function buildOnboardingPayload(answers: OnboardingAnswers, now: Date): OnboardingCompleteInput {
  const body = answers.body ?? DEFAULT_BODY;
  const heightUnit = body.units === 'metric' ? 'cm' : 'in';
  const weightUnit: 'lb' | 'kg' = body.units === 'metric' ? 'kg' : 'lb';
  const birthday = answers.birthday ?? { year: now.getFullYear() - 30, month: 0, day: 1 };
  const journeyStartDate = answers.startDate
    ? toIsoDate(answers.startDate)
    : toIsoDate({ year: now.getFullYear(), month: now.getMonth(), day: now.getDate() });

  const goalWeightUnit: 'lb' | 'kg' = answers.goalWeightUnit ?? weightUnit;
  const goalWeight =
    answers.goalWeight ?? (goalWeightUnit === 'kg' ? Math.max(32, body.weight - 7) : Math.max(70, body.weight - 15));

  const profile = {
    sex: sexFromGender(answers.genderIdentity),
    ...(answers.genderIdentity ? { genderIdentity: answers.genderIdentity } : {}),
    dateOfBirth: toIsoDate(birthday),
    ageYears: ageFromBirthday(birthday, now),
    medicationStatus: answers.journeyStage ?? 'none',
    height: body.height,
    heightUnit,
    currentWeight: body.weight,
    weightUnit,
    goalWeight,
    goalWeightUnit,
    goalPace: paceToEnum(answers.pace),
    activityLevel: answers.activityLevel ?? 'light',
    trainingStatus: answers.trainingStatus ?? 'not_training',
    goalType: answers.goalType ?? 'lose_fat',
    biggestWorry: answers.biggestWorry ?? 'losing_muscle',
    doseUnitPreference: answers.medication?.doseUnit ?? 'mg',
    onboardingComplete: true,
    journeyStartDate,
    timezone: 'America/New_York',
    sideEffectBaseline: answers.sideEffects ?? [],
  } satisfies OnboardingCompleteInput['profile'];

  // Only attach a compound for users actively on a GLP-1 with a medication picked.
  // Our seed-catalog ids aren't real backend catalog ids, so we send the
  // medication's own fields rather than a medicationCatalogId.
  const compound =
    answers.journeyStage === 'active' && answers.medication
      ? ({
          name: answers.medication.name,
          drugClass: answers.medication.drugClass,
          route: answers.medication.route,
          halfLifeDays: answers.medication.halfLifeDays,
          doseUnit: answers.medication.doseUnit,
          ...(typeof answers.dose === 'number' ? { plannedDose: answers.dose } : {}),
          startDate: journeyStartDate,
          status: 'active' as const,
        } satisfies NonNullable<OnboardingCompleteInput['compound']>)
      : undefined;

  return {
    profile,
    ...(compound ? { compound } : {}),
    baselineWeight: {
      value: answers.startWeight ?? body.weight,
      unit: weightUnit,
      datetime: isoDatetime(answers.startDate, now),
    },
    sideEffectBaseline: answers.sideEffects ?? [],
  };
}
