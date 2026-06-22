// Pure derivations for the crafting + reveal screens. The daily targets here are
// a LOCAL PREVIEW so the reveal feels real in-flight; the backend's
// OnboardingResultResponse is the source of truth once integrations land.
// TODO: replace previewTargets with the server result when the backend is wired.

import type { ActivityLevel } from '@pepta/shared';
import { kgToLb } from './units';

export interface PlanTargets {
  proteinG: number;
  calories: number;
  waterOz: number;
  fiberG: number;
  steps: number;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 12,
  light: 13,
  moderate: 14,
  active: 15,
};

const ACTIVITY_STEPS: Record<ActivityLevel, number> = {
  sedentary: 6000,
  light: 8000,
  moderate: 9000,
  active: 10000,
};

export function previewTargets(args: {
  currentWeight: number;
  unit: 'lb' | 'kg';
  activityLevel?: ActivityLevel;
  weeklyLoss: number; // same unit as currentWeight
}): PlanTargets {
  const lb = args.unit === 'kg' ? kgToLb(args.currentWeight) : args.currentWeight;
  const activity = args.activityLevel ?? 'light';
  const maintenance = lb * ACTIVITY_MULTIPLIER[activity];
  const weeklyLossLb = args.unit === 'kg' ? kgToLb(args.weeklyLoss) : args.weeklyLoss;
  const dailyDeficit = (weeklyLossLb * 3500) / 7;
  const calories = Math.max(1200, Math.round((maintenance - dailyDeficit) / 10) * 10);
  return {
    proteinG: Math.round(lb * 0.7), // muscle-protective
    calories,
    waterOz: Math.round(lb * 0.5),
    fiberG: Math.max(25, Math.round((calories / 1000) * 14)),
    steps: ACTIVITY_STEPS[activity],
  };
}

// Personalized "crafting your plan" checklist, derived from the user's answers.
export function craftingSteps(args: { sideEffects?: string[]; biggestWorry?: string }): string[] {
  const se = args.sideEffects ?? [];
  const steps = ['Optimizing protein to protect your muscle'];
  if (se.includes('nausea')) steps.push('Adjusting hydration to ease nausea');
  else if (se.includes('constipation')) steps.push('Tailoring fiber to ease constipation');
  else steps.push('Tailoring fiber for easy digestion');
  steps.push(args.biggestWorry === 'energy' ? 'Setting your step goal for energy' : 'Setting your daily step goal');
  steps.push('Timing insights around your shot day');
  return steps;
}

// "Personalized to ease nausea & lift your energy" — derived from side effects.
export function supportLine(sideEffects?: string[]): string {
  const se = sideEffects ?? [];
  const parts: string[] = [];
  if (se.includes('nausea')) parts.push('ease nausea');
  if (se.includes('fatigue')) parts.push('lift your energy');
  if (se.includes('constipation')) parts.push('ease digestion');
  if (parts.length === 0) return 'Personalized to protect your muscle.';
  return `Personalized to ${parts.slice(0, 2).join(' & ')}.`;
}
