// The crafting checklist's rows, and the weight resolution they share with the
// reveal. Pure — no React/RN imports — so it unit-tests in plain Node, like
// onboardingEcho / onboardingPayload / symptomWeek beside it.
//
// THE ROWS ARE DERIVED, NOT ASKED. They used to lead with the user's picks
// from the `needs` multi-select, cut 2026-08-21: a MANDATORY screen two turns
// before the paywall whose answer reached nothing else in the app. Its own
// header claimed the paywall led with those picks and that they were a
// product-priority signal in aggregate; neither was wired — PaywallScreen took
// one prop, and nothing ever POSTed or logged them. What it actually bought
// was three lines of a 3.7-second animation, and for an active weekly injector
// who picked `schedule`, one of those lines duplicated the shot-day row this
// list already appended.
//
// Every row below is earned by something the user already told us, so the list
// keeps its length and its promises stay true. Order matters: the specific
// rows come first, because CraftingScreen ticks them off in sequence and the
// ones the user recognises should land while they are still watching.

import type { FlowAnswers } from './OnboardingNavigator';
import { formatShortDate } from '../../utils/dateParts';
import { kgToLb, lbToKg, type BodyMeasure } from '../../utils/units';
import { projectGoal } from '../../utils/goalProjection';
import { previewTargets } from '../../utils/planPreview';
import type { WeightUnit } from './GoalWeightScreen';

export const DEFAULT_BODY: BodyMeasure = { units: 'imperial', height: 66, weight: 184 };

export const DAY_PLURAL = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];

/** Resolve current + goal weight into the body's unit (goal may be in a toggled unit). */
export function resolveWeights(answers: FlowAnswers) {
  const body = answers.body ?? DEFAULT_BODY;
  const bodyUnit: WeightUnit = body.units === 'metric' ? 'kg' : 'lb';
  const goalUnit = answers.goalWeightUnit ?? bodyUnit;
  const goalRaw =
    answers.goalWeight ??
    (goalUnit === 'kg' ? Math.max(32, body.weight - 7) : Math.max(70, body.weight - 15));
  const goalInBodyUnit =
    goalUnit === bodyUnit ? goalRaw : Math.round(bodyUnit === 'kg' ? lbToKg(goalRaw) : kgToLb(goalRaw));
  return { body, bodyUnit, goalInBodyUnit };
}

/** Crafting-list noun. Oral users are not promised shot-day anything. */
export function craftNoun(answers: FlowAnswers): 'Shot' | 'Dose' {
  return answers.route === 'oral' ? 'Dose' : 'Shot';
}

export function buildCraftingSteps(answers: FlowAnswers): string[] {
  const rows: string[] = [];

  // Drawing from a vial is the only path where the mixing maths is real work.
  if (answers.deviceType === 'syringe_vial') {
    rows.push('Dose & mixing math — calculator armed');
  }
  // They named a compound, so the tracker has something to track. The level
  // model is only armed for someone actively dosing — lastShot lives in the
  // skip-gated block, so promising a curve to a starting-soon user would be a
  // row about data they have not given.
  if (answers.medication) {
    rows.push(
      answers.journeyStage === 'active' && answers.medication.halfLifeDays != null
        ? `${answers.medication.name} — levels modelled from your last dose`
        : `${answers.medication.name} — tracking ready`,
    );
  }
  // True for everyone, and the one habit the whole app depends on.
  rows.push('One-tap logging — so it gets done');

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
  rows.push(
    projection.estimatedDate
      ? `Goal path — ${body.weight} → ${goalInBodyUnit} by ${formatShortDate(projection.estimatedDate)}`
      : `Goal path — holding at ${goalInBodyUnit} ${bodyUnit}`,
  );
  if (answers.journeyStage === 'active' && (answers.shotDays?.length ?? 0) > 0) {
    rows.push(`${craftNoun(answers)}-day reminders — ${DAY_PLURAL[answers.shotDays![0]!]}`);
  }
  return rows;
}
