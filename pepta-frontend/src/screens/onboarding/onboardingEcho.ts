// The conversation's memory. Given the current step and everything answered so
// far, this returns the dim "echo" line that types at the top of the screen —
// the app acknowledging what the user just told it before asking the next
// thing. This is what makes the onboarding feel alive and spoken. Pure + typed,
// so it unit-tests in plain Node.
//
// Static openers (T1/T2/T3) are owned by their screens; everything from the
// experience turn onward derives its echo here from the relevant prior answer.

import { formatHeight, kgToLb, lbToKg, type BodyMeasure } from '../../utils/units';
import { formatShortDate } from '../../utils/dateParts';
import { projectGoal } from '../../utils/goalProjection';
import type { OnboardingStep } from './onboardingFlow';
import { sideEffectNamesEcho, symptomForWeekBeat } from './symptomWeek';
import type { JourneyStage } from './JourneyStageScreen';
import type { MedicationOption } from '../../data/medicationCatalog';
import type { DoseValue } from './DoseScreen';
import type { InjectionDeviceType } from '@pepta/shared';
import type { ConcentrationValue } from './ConcentrationScreen';
import type { DoseFrequency } from './FrequencyScreen';
import type { GoalType } from './GoalTypeScreen';
import type { ActivityLevel, TrainingStatus } from '@pepta/shared';
import type { DateParts } from '../../utils/dateParts';
import type { SideEffectType } from './SideEffectsScreen';

export interface EchoAnswers {
  journeyStage?: JourneyStage;
  medication?: MedicationOption;
  dose?: DoseValue;
  deviceType?: InjectionDeviceType;
  concentration?: ConcentrationValue;
  frequency?: DoseFrequency;
  lastShot?: DateParts;
  shotDays?: number[];
  goalType?: GoalType;
  body?: BodyMeasure;
  goalWeight?: number;
  goalWeightUnit?: 'lb' | 'kg';
  pace?: number;
  activityLevel?: ActivityLevel;
  trainingStatus?: TrainingStatus;
  sideEffects?: SideEffectType[];
  goalNote?: string;
}

const DAY_SINGULAR = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function weekdayOf(parts: DateParts): number {
  return new Date(parts.year, parts.month, parts.day).getDay();
}

function journeyEcho(stage?: JourneyStage): string {
  switch (stage) {
    case 'active':
      return 'Already dosing. Let’s dial it in.';
    case 'starting_soon':
      return 'Starting soon. Smart to prep.';
    case 'none':
      return 'Just exploring. No pressure.';
    default:
      return 'Good to know.';
  }
}


function medEcho(med?: MedicationOption): string {
  return med ? `${med.name} — strong pick, and you’re far from alone on it.` : 'Got it.';
}

function doseEcho(dose?: DoseValue, unit = 'mg'): string {
  if (typeof dose === 'number') return `${dose} ${unit}. We’ll track every shot.`;
  return 'Custom dose. We’ll track every shot.';
}

function deviceEcho(device?: InjectionDeviceType): string {
  switch (device) {
    case 'single_dose_pen':
      return 'Single-dose pen. Clean.';
    case 'auto_injector':
      return 'Auto-injector. Smooth.';
    case 'syringe_vial':
      return 'Syringe and vial. The precise way.';
    default:
      return 'Noted.';
  }
}

function goalTypeEcho(goal?: GoalType): string {
  switch (goal) {
    case 'lose_fat':
      return 'Lose fat, keep muscle. Clear.';
    case 'recomp':
      return 'Build and recomp. Ambitious.';
    case 'maintain':
      return 'Maintain. Steady.';
    default:
      return 'Got it.';
  }
}


function activityEcho(level?: ActivityLevel): string {
  switch (level) {
    case 'sedentary':
      return 'Mostly sitting. Honest.';
    case 'light':
      return 'Lightly active. Good.';
    case 'moderate':
      return 'Active. Nice.';
    case 'active':
      return 'Very active. Impressive.';
    default:
      return 'Got it.';
  }
}

function trainingEcho(status?: TrainingStatus): string {
  switch (status) {
    case 'consistent':
      return 'Consistent. Respect.';
    case 'returning':
      return 'Getting back into it. Respect.';
    case 'beginner':
      return 'Just starting. Everyone does.';
    case 'not_training':
      return 'Not yet. That’s honest.';
    default:
      return 'Got it.';
  }
}


// Resolve the goal weight into the body's unit (the goal may be in a toggled unit).
function goalInBodyUnit(a: EchoAnswers): { value: number; unit: 'lb' | 'kg' } {
  const body = a.body;
  const bodyUnit: 'lb' | 'kg' = body?.units === 'metric' ? 'kg' : 'lb';
  const goalUnit = a.goalWeightUnit ?? bodyUnit;
  const fallback = body
    ? goalUnit === 'kg'
      ? Math.max(32, body.weight - 7)
      : Math.max(70, body.weight - 15)
    : 0;
  const raw = a.goalWeight ?? fallback;
  const value = goalUnit === bodyUnit ? raw : Math.round(bodyUnit === 'kg' ? lbToKg(raw) : kgToLb(raw));
  return { value, unit: bodyUnit };
}

/**
 * The echo (dim recap) that types at the top of the given step. Undefined means
 * the screen owns its opener (or there is nothing to acknowledge yet).
 */
export function echoFor(step: OnboardingStep, a: EchoAnswers, now: Date = new Date()): string | undefined {
  const unit = a.medication?.doseUnit ?? 'mg';
  switch (step) {
    // Each case echoes the PREVIOUS answer, so this chain is ORDER-DEPENDENT.
    // Rewired 2026-07-27 when the flow was restructured.
    case 'medication':
      return 'Let’s get the specifics.';
    case 'route':
      return medEcho(a.medication);
    case 'currentDose':
      return medEcho(a.medication);
    case 'deviceType':
      return doseEcho(a.dose, unit);
    case 'concentration':
      return deviceEcho(a.deviceType);
    case 'frequency':
      return a.deviceType ? deviceEcho(a.deviceType) : doseEcho(a.dose, unit);
    case 'leanMass':
      return leanMassContext(a);
    case 'lastShot':
      // Was frequencyEcho — the frequency answer is two screens back now that
      // the lean-mass beat sits between them, and repeating it here would echo
      // the same line the beat already opened with.
      return 'Back to your schedule.';
    case 'shotDay':
      return a.lastShot ? `Last shot was a ${DAY_SINGULAR[weekdayOf(a.lastShot)]}.` : undefined;
    case 'shotTime':
      return a.shotDays && a.shotDays.length > 0 ? `${DAY_PLURAL[a.shotDays[0]!]} it is.` : 'Shot day set.';
    case 'instrument':
      return instrumentContext(a);
    case 'goalType':
      return a.journeyStage === 'active' ? 'Level model armed. Now you.' : 'Now, the goal.';
    case 'sexGender':
      // If they wrote their own goal, say it back. The preset echoes exist to
      // prove we heard the answer; quoting their sentence does that far better
      // than the generic fallback goalTypeEcho would land on here.
      return a.goalNote ? `“${a.goalNote}” — noted.` : goalTypeEcho(a.goalType);
    case 'birthday':
      return 'Perfect — that sharpens your targets.';
    case 'heightWeight':
      return 'Almost there on the numbers.';
    case 'startWeight':
      return a.body ? `${formatHeight(a.body)}, ${a.body.weight} today.` : undefined;
    case 'goalWeight':
      return a.body ? `${a.body.weight} today. Thanks for trusting me with that.` : undefined;
    case 'goalPace': {
      const goal = goalInBodyUnit(a);
      return goal.value ? `${goal.value}. I like it.` : undefined;
    }
    case 'company':
      return companyContext(a, now);
    case 'dailyRoutine':
      return 'Now, your days.';
    case 'training':
      return activityEcho(a.activityLevel);
    case 'sideEffects':
      return trainingEcho(a.trainingStatus);
    case 'biggestWorry':
      return `${journeyEcho(a.journeyStage)} Now, honestly —`;
    case 'symptomWeek':
      return sideEffectNamesEcho(a.sideEffects);
    case 'needs':
      // "I'll watch for those" belongs to whichever screen directly follows
      // the side-effects turn. When the symptom-week beat runs it has already
      // acknowledged the picks by name, so this must not say it twice.
      if (symptomForWeekBeat(a.sideEffects)) return 'Last thing.';
      return (a.sideEffects?.length ?? 0) > 0 ? 'Noted — I’ll watch for those.' : 'Clean slate so far.';
    case 'notifications':
      return 'You’ve given me everything I need.';
    default:
      return undefined;
  }
}

// "Tirzepatide · 5 mg · Sundays." — the instrument beat's proof line.
/**
 * What the user has just told us, replayed above the lean-mass beat: their
 * medication, dose and rhythm. The point of the beat is that the statistic is
 * about THEIR regimen, so it opens by naming it.
 */
export function leanMassContext(a: EchoAnswers): string {
  const parts: string[] = [];
  if (a.medication) parts.push(a.medication.name);
  if (typeof a.dose === 'number') parts.push(`${a.dose} ${a.medication?.doseUnit ?? 'mg'}`);
  if (a.frequency) parts.push(FREQUENCY_WORD[a.frequency]);
  return parts.length > 0 ? `${parts.join(' · ')}.` : 'Here is why this matters.';
}

const FREQUENCY_WORD: Record<DoseFrequency, string> = {
  weekly: 'weekly',
  biweekly: 'every two weeks',
  daily: 'daily',
  custom: 'on your own rhythm',
};

export function instrumentContext(a: EchoAnswers): string {
  const parts: string[] = [];
  if (a.medication) parts.push(a.medication.name);
  if (typeof a.dose === 'number') parts.push(`${a.dose} ${a.medication?.doseUnit ?? 'mg'}`);
  if (a.shotDays && a.shotDays.length > 0) parts.push(DAY_PLURAL[a.shotDays[0]!]!);
  return parts.length > 0 ? `${parts.join(' · ')}.` : 'Your doses are logged.';
}

// "Steady pace. 185 by Jan 17." — the company beat's lead line.
export function companyContext(a: EchoAnswers, now: Date): string {
  const goal = goalInBodyUnit(a);
  const paceWord = (a.pace ?? 0.5) < 0.4 ? 'Gentle' : (a.pace ?? 0.5) < 0.72 ? 'Steady' : 'Ambitious';
  if (!a.body || !goal.value) return `${paceWord} pace.`;
  const projection = projectGoal({
    currentWeight: a.body.weight,
    goalWeight: goal.value,
    pace: a.pace ?? 0.5,
    now,
  });
  if (!projection.estimatedDate) return `${paceWord} pace.`;
  return `${paceWord} pace. ${goal.value} by ${formatShortDate(projection.estimatedDate)}.`;
}
