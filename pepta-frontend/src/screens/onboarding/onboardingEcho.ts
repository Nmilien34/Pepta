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
  /** Drives the echo's noun — an oral user is never told "every shot".
   *  'unsure' reads as injection, matching doseNoun's never-guess-oral rule. */
  route?: 'injection' | 'oral' | 'unsure';
  deviceType?: InjectionDeviceType;
  concentration?: ConcentrationValue;
  frequency?: DoseFrequency;
  lastShot?: DateParts;
  shotDays?: number[];
  goalType?: GoalType;
  body?: BodyMeasure;
  /** Where they began, when they have already been dosing. */
  startWeight?: number;
  goalWeight?: number;
  goalWeightUnit?: 'lb' | 'kg';
  pace?: number;
  activityLevel?: ActivityLevel;
  trainingStatus?: TrainingStatus;
  sideEffects?: SideEffectType[];
  goalNote?: string;
}

const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Every chosen shot day, spoken back. The old echo said only shotDays[0] —
 * someone who picked Tue/Wed/Sat heard "Tuesdays it is." and reasonably
 * concluded their other days were dropped. They never were (the payload
 * always carried the full list); the echo just lied about it. An echo's one
 * job is to prove the answer was heard, so it names all of them.
 */
export function shotDaysEcho(days?: number[]): string {
  if (!days || days.length === 0) return 'Shot day set.';
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_PLURAL[d] ?? 'Shot days');
  if (names.length === 1) return `${names[0]} it is.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} it is.`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. All three locked in.`;
}

/** Compact day list for context lines: "Tue, Wed & Sat". */
export function shotDaysCompact(days: number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d] ?? '?');
  if (names.length === 1) return DAY_PLURAL[days[0]!] ?? 'weekly';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function weekdayOf(parts: DateParts): number {
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

function doseEcho(dose?: DoseValue, unit = 'mg', route?: string | null): string {
  const noun = route === 'oral' ? 'dose' : 'shot';
  if (typeof dose === 'number') return `${dose} ${unit}. We’ll track every ${noun}.`;
  return `Custom dose. We’ll track every ${noun}.`;
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

/** Said back after the "how do you take it" turn. */
function routeEcho(route?: 'injection' | 'oral' | 'unsure'): string | undefined {
  // 'unsure' gets nothing rather than a confident line about a route the user
  // has just told us they do not know.
  if (route === 'oral') return 'Oral it is.';
  if (route === 'injection') return 'Injection it is.';
  return undefined;
}


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
      // The route turn runs ONLY for a medication that does not pin its own
      // route. When it ran it already showed medEcho, so repeating it here
      // put the identical sentence on two consecutive screens. When it was
      // skipped (every branded pick) this screen follows medication directly
      // and the medication line is exactly right.
      return a.medication?.routeAmbiguous ? routeEcho(a.route) : medEcho(a.medication);
    case 'deviceType':
      return doseEcho(a.dose, unit, a.route);
    case 'concentration':
      return deviceEcho(a.deviceType);
    case 'frequency':
      return a.deviceType ? deviceEcho(a.deviceType) : doseEcho(a.dose, unit, a.route);
    case 'leanMass':
      return leanMassContext(a);
    case 'lastShot':
      // Was frequencyEcho — the frequency answer is two screens back now that
      // the lean-mass beat sits between them, and repeating it here would echo
      // the same line the beat already opened with.
      return 'Back to your schedule.';
    case 'shotTime':
      // Daily users reach this turn without ever picking a weekday, so the
      // shot-day echo has nothing to say — their cadence IS the echo.
      return a.frequency === 'daily' ? 'Every day, then.' : shotDaysEcho(a.shotDays);
    case 'instrument':
      return instrumentContext(a);
    case 'goalType':
      // goalType follows journeyStage directly since 2026-08-28. It must NOT
      // use journeyEcho: biggestWorry, the very next screen, already opens
      // with it — moving goalType here put the identical sentence on two
      // consecutive screens. This acknowledges the stage without restating it.
      return 'Good to know.';
    case 'aboutYou':
      // The goal moved to step 5, so quoting it here would echo something six
      // screens back. This opens the body stretch instead — and deliberately
      // avoids "Two things", which is how the screen's own question starts.
      // Not "Now the numbers" — heightWeight, the next screen, opens with
      // "Almost there on the numbers." The consecutive-duplicate guard only
      // catches identical or prefixed lines, so a shared keyword one screen
      // apart still has to be caught by reading the chain.
      return 'Now a bit about you.';
    case 'heightWeight':
      return 'Almost there on the numbers.';
    // THE BODY LINE FOLLOWS HEIGHT+WEIGHT, wherever that lands. It lived on
    // muscleFloor until that screen was cut (2026-08-28); startWeight is now
    // the screen immediately after height+weight on the active path, so it
    // inherits the echo. Same rule that moved it in the first place.
    // The body line follows height+weight, and this is now the screen after
    // it on every path. goalWeight used to open by quoting startWeight back;
    // the merged screen states both numbers itself, in one live line, so the
    // echo is free to do what every other echo does — acknowledge the answer
    // before it.
    case 'weightJourney':
      return a.body ? `${formatHeight(a.body)}, ${a.body.weight} today.` : undefined;
    case 'company':
      return companyContext(a, now);
    case 'lifestyle':
      // Not "Now, your days" — the screen's own question is "Now, your week",
      // so the echo would repeat both the opening word and a near-synonym.
      return 'Two more and the plan is yours.';
    case 'sideEffects':
      // The lifestyle screen carries TWO answers; this echoes the training
      // one because it is the warmer acknowledgment ("Consistent. Respect.")
      // and the heavier input to the risk score. Acknowledging one of the two
      // is the convention — every echo quotes a single answer back.
      return trainingEcho(a.trainingStatus);
    case 'biggestWorry':
      return `${journeyEcho(a.journeyStage)} Everyone has one.`;
    case 'symptomWeek':
      return sideEffectNamesEcho(a.sideEffects);
    case 'notifications':
      // INHERITED FROM THE CUT `needs` TURN (2026-08-21). "I'll watch for
      // those" belongs to whichever screen directly follows the side-effects
      // turn, and that is now this one. When the symptom-week beat runs it has
      // already acknowledged the picks by name, so this must not say it twice
      // — the same rule the old turn carried, applied one screen later.
      if (symptomForWeekBeat(a.sideEffects)) return 'You’ve given me everything I need.';
      return (a.sideEffects?.length ?? 0) > 0 ? 'Noted — I’ll watch for those.' : 'Clean slate so far.';
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
  if (a.shotDays && a.shotDays.length > 0) parts.push(shotDaysCompact(a.shotDays));
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
