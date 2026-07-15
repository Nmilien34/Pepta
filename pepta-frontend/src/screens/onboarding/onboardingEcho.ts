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
import type { JourneyStage } from './JourneyStageScreen';
import type { ExperienceLevel } from './ExperienceScreen';
import type { MedicationOption } from '../../data/medicationCatalog';
import type { DoseValue } from './DoseScreen';
import type { InjectionDeviceType } from '@pepta/shared';
import type { ConcentrationValue } from './ConcentrationScreen';
import type { DoseFrequency } from './FrequencyScreen';
import type { GoalType } from './GoalTypeScreen';
import type { AlsoTracking } from './AlsoTrackingScreen';
import type { MomentumAnswer } from './MomentumScreen';
import type { ActivityLevel, TrainingStatus } from '@pepta/shared';
import type { DateParts } from '../../utils/dateParts';
import type { SideEffectType } from './SideEffectsScreen';

export interface EchoAnswers {
  journeyStage?: JourneyStage;
  experience?: ExperienceLevel;
  medication?: MedicationOption;
  dose?: DoseValue;
  deviceType?: InjectionDeviceType;
  concentration?: ConcentrationValue;
  frequency?: DoseFrequency;
  lastShot?: DateParts;
  shotDays?: number[];
  goalType?: GoalType;
  alsoTracking?: AlsoTracking;
  body?: BodyMeasure;
  goalWeight?: number;
  goalWeightUnit?: 'lb' | 'kg';
  pace?: number;
  activityLevel?: ActivityLevel;
  trainingStatus?: TrainingStatus;
  sideEffects?: SideEffectType[];
  momentum?: MomentumAnswer;
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

function experienceEcho(level?: ExperienceLevel): string {
  switch (level) {
    case 'new':
      return 'Brand new. We’ll go gentle.';
    case 'starting':
      return 'Getting started. Good place to be.';
    case 'experienced':
      return 'Experienced. We’ll keep it sharp.';
    case 'advanced':
      return 'Advanced. No hand-holding.';
    default:
      return 'Got it.';
  }
}

function medEcho(med?: MedicationOption): string {
  return med ? `${med.name}. Got it.` : 'Got it.';
}

function doseEcho(dose?: DoseValue, unit = 'mg'): string {
  if (typeof dose === 'number') return `${dose} ${unit}. Noted.`;
  return 'Custom dose. Noted.';
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

function frequencyEcho(freq?: DoseFrequency): string {
  switch (freq) {
    case 'weekly':
      return 'Weekly. Classic.';
    case 'biweekly':
      return 'Every two weeks. Got it.';
    case 'daily':
      return 'Daily. Consistent.';
    case 'custom':
      return 'Custom rhythm. Noted.';
    default:
      return 'Got it.';
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

function alsoTrackingEcho(value?: AlsoTracking): string {
  return value === 'peptides' ? 'Peptides too. Side by side.' : 'Just the GLP-1. Clean focus.';
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

function momentumEcho(answer?: MomentumAnswer): string {
  switch (answer) {
    case 'locked_in':
      return 'Locked in. Let’s make it airtight.';
    case 'wobbly':
      return 'Wobbly but going. That’s why I’m here.';
    case 'not_started':
      return 'Haven’t started. Perfect timing.';
    default:
      return 'Thank you for that.';
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
    // T1/T2/T3 own their static openers.
    case 'experience':
      return journeyEcho(a.journeyStage);
    case 'needs':
      return experienceEcho(a.experience);
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
    case 'lastShot':
      return frequencyEcho(a.frequency);
    case 'shotDay':
      return a.lastShot ? `Last shot was a ${DAY_SINGULAR[weekdayOf(a.lastShot)]}.` : undefined;
    case 'shotTime':
      return a.shotDays && a.shotDays.length > 0 ? `${DAY_PLURAL[a.shotDays[0]!]} it is.` : 'Shot day set.';
    case 'instrument':
      return instrumentContext(a);
    case 'goalType':
      return a.journeyStage === 'active' ? 'Level model armed. Now you.' : 'Now, the goal.';
    case 'alsoTracking':
      return goalTypeEcho(a.goalType);
    case 'sexGender':
      return a.alsoTracking ? alsoTrackingEcho(a.alsoTracking) : goalTypeEcho(a.goalType);
    case 'birthday':
      return 'Got it.';
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
      return (a.sideEffects?.length ?? 0) > 0 ? 'Noted. Now, honestly —' : 'Clean slate. Now, honestly —';
    // fearAnswered replays the worry internally.
    case 'momentum':
      return 'You’ve given me everything I need.';
    case 'notifications':
      return momentumEcho(a.momentum);
    default:
      return undefined;
  }
}

// "Tirzepatide · 5 mg · Sundays." — the instrument beat's proof line.
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
