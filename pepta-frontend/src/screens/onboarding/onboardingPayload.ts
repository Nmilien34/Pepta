// Pure mapper: navigator flow answers → the typed OnboardingCompleteInput the
// backend expects. No RN imports → unit-testable. Where the flow collects fields
// the schema doesn't have (experience, needs, alsoTracking, momentum), they stay
// navigator-local (flagged TODO for the schema). The v2.2 turns now feed real
// schema surfaces the old flow left empty: compound.concentration (vial users),
// schedule{frequency, daysOfWeek, nextDoseAt} and lastDose (arms the level model
// server-side from the last-shot + shot-time answers).

import type {
  ActivityLevel,
  BiggestWorry,
  InjectionDeviceType,
  OnboardingCompleteInput,
  TrainingStatus,
} from '@pepta/shared';
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
import type { MedicationRoute } from './RouteScreen';
import type { ExperienceLevel } from './ExperienceScreen';
import type { NeedType } from './NeedsScreen';
import type { ConcentrationValue } from './ConcentrationScreen';
import type { AlsoTracking } from './AlsoTrackingScreen';
import type { MomentumAnswer } from './MomentumScreen';

export interface OnboardingAnswers {
  journeyStage?: JourneyStage;
  // TODO(schema): experience/needs/alsoTracking/momentum are conversation
  // signals with no backend field yet — persisted in the draft only.
  experience?: ExperienceLevel;
  needs?: NeedType[];
  alsoTracking?: AlsoTracking;
  momentum?: MomentumAnswer;
  medication?: MedicationOption;
  route?: MedicationRoute;
  deviceType?: InjectionDeviceType;
  concentration?: ConcentrationValue;
  dose?: DoseValue;
  frequency?: DoseFrequency;
  lastShot?: DateParts;
  shotDays?: number[];
  /** 0–23, from the shot-time turn; times reminders + nextDoseAt. */
  shotHour?: number;
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

// The pace value (0..1) maps to the schema's goalPace enum.
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

// The last shot at the user's usual hour, clamped to now (the log must not
// land in the future when the shot was earlier today).
function lastDoseDatetime(lastShot: DateParts, shotHour: number | undefined, now: Date): string {
  const at = new Date(lastShot.year, lastShot.month, lastShot.day, shotHour ?? 12, 0, 0, 0);
  return (at > now ? now : at).toISOString();
}

const FREQUENCY_INTERVAL_DAYS: Record<Exclude<DoseFrequency, 'custom'>, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

// Next dose = last shot + interval at the usual hour, rolled forward until it
// lands in the future (the user may be mid-cycle when onboarding).
function nextDoseAt(
  lastShot: DateParts,
  frequency: DoseFrequency,
  shotHour: number | undefined,
  now: Date,
): string | undefined {
  if (frequency === 'custom') return undefined;
  const interval = FREQUENCY_INTERVAL_DAYS[frequency];
  const next = new Date(lastShot.year, lastShot.month, lastShot.day, shotHour ?? 12, 0, 0, 0);
  do {
    next.setDate(next.getDate() + interval);
  } while (next <= now);
  return next.toISOString();
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
  const active = answers.journeyStage === 'active' && answers.medication != null;
  const compound = active
    ? ({
        name: answers.medication!.name,
        drugClass: answers.medication!.drugClass,
        // The explicit route answer (asked for ambiguous meds) overrides the
        // catalog default; "unsure" falls back to the catalog route.
        route:
          answers.route === 'injection' || answers.route === 'oral'
            ? answers.route
            : answers.medication!.route,
        ...(answers.deviceType && answers.route !== 'oral' ? { deviceType: answers.deviceType } : {}),
        halfLifeDays: answers.medication!.halfLifeDays,
        doseUnit: answers.medication!.doseUnit,
        ...(typeof answers.dose === 'number' ? { plannedDose: answers.dose } : {}),
        // Vial users told us their mg/mL — powers the draw-to-units math.
        ...(typeof answers.concentration === 'number'
          ? { concentration: answers.concentration, concentrationUnit: 'mg/mL' }
          : {}),
        startDate: journeyStartDate,
        status: 'active' as const,
      } satisfies NonNullable<OnboardingCompleteInput['compound']>)
    : undefined;

  // The dosing rhythm arms the level model server-side.
  const schedule =
    active && answers.frequency
      ? ({
          frequency: answers.frequency,
          daysOfWeek: answers.shotDays ?? [],
          active: true,
          ...(answers.lastShot
            ? (() => {
                const next = nextDoseAt(answers.lastShot!, answers.frequency!, answers.shotHour, now);
                return next ? { nextDoseAt: next } : {};
              })()
            : {}),
        } satisfies NonNullable<OnboardingCompleteInput['schedule']>)
      : undefined;

  const lastDose =
    active && answers.lastShot && typeof answers.dose === 'number'
      ? ({
          amount: answers.dose,
          unit: answers.medication!.doseUnit,
          datetime: lastDoseDatetime(answers.lastShot, answers.shotHour, now),
        } satisfies NonNullable<OnboardingCompleteInput['lastDose']>)
      : undefined;

  return {
    profile,
    ...(compound ? { compound } : {}),
    ...(schedule ? { schedule } : {}),
    ...(lastDose ? { lastDose } : {}),
    baselineWeight: {
      value: answers.startWeight ?? body.weight,
      unit: weightUnit,
      datetime: isoDatetime(answers.startDate, now),
    },
    sideEffectBaseline: answers.sideEffects ?? [],
  };
}
