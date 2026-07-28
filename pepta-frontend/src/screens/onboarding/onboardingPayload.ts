// Pure mapper: navigator flow answers → the typed OnboardingCompleteInput the
// backend expects. No RN imports → unit-testable. One collected field has no
// schema home — `needs` — and stays navigator-local on purpose: it drives the
// crafting checklist rather than any stored profile. (experience / alsoTracking
// / momentum were dropped from the flow on 2026-07-27 — echo-only, and they
// never reached this mapper.) The v2.2 turns now feed real
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
import { kgToLb, lbToKg, type BodyMeasure } from '../../utils/units';
import { goalTypeFromWeights } from './goalIntent';
import type { JourneyStage } from './JourneyStageScreen';
import type { DoseValue } from './DoseScreen';
import type { DoseFrequency } from './FrequencyScreen';
import type { GoalType } from './GoalTypeScreen';
import type { GenderIdentity } from './SexGenderScreen';
import type { WeightUnit } from './GoalWeightScreen';
import type { SideEffectType } from './SideEffectsScreen';
import type { MedicationRoute } from './RouteScreen';
import type { ConcentrationValue } from './ConcentrationScreen';

export interface OnboardingAnswers {
  journeyStage?: JourneyStage;
  companionName?: string;
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
  /** Their own words, when they picked "Something else". Never computed on. */
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
    // When they wrote their own goal there is no goalType to store, so it is
    // derived from the direction of their own numbers. Comparing in one unit
    // matters: goalWeight can be entered in the other unit from body.weight.
    goalType:
      answers.goalType ??
      goalTypeFromWeights({
        startWeight: body.weight,
        goalWeight:
          goalWeightUnit === weightUnit
            ? goalWeight
            : weightUnit === 'kg'
              ? lbToKg(goalWeight)
              : kgToLb(goalWeight),
        unit: weightUnit,
      }),
    ...(answers.goalNote ? { goalNote: answers.goalNote } : {}),
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
