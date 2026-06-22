// Pure onboarding step machine — the ordered step list plus next/prev/progress.
// No React/RN imports, so it unit-tests in plain Node. The navigator consumes
// these; gating (e.g. skipping medication steps for non-medicated users) will
// layer on top once those answers are captured.

export const ONBOARDING_STEPS = [
  'privacy',
  'journeyStage',
  'medication',
  'currentDose',
  'frequency',
  'shotDay',
  'appleHealth',
  'goalType',
  'sexGender',
  'birthday',
  'heightWeight',
  'startWeight',
  'goalWeight',
  'goalPace',
  'dailyRoutine',
  'training',
  'biggestWorry',
  'sideEffects',
  'momentum',
  'notifications',
  'rating',
  'crafting',
  'reveal',
  'paywall',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// The progress bar counts the full funnel (Welcome=1, Sign-in≈1b, then these),
// so the first onboarding step (privacy) reads as 2/25 to match the design lab.
const FUNNEL_LENGTH = 25;
const FUNNEL_OFFSET = 2; // privacy is screen #2

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  if (index < 0 || index >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[index + 1] ?? null;
}

export function prevStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  return index > 0 ? ONBOARDING_STEPS[index - 1] ?? null : null;
}

// 0..1 progress for the bar. privacy → 0.08, journeyStage → 0.12, paywall → 1.
export function progressForStep(step: OnboardingStep): number {
  const index = stepIndex(step);
  if (index < 0) return 0;
  return (index + FUNNEL_OFFSET) / FUNNEL_LENGTH;
}

// Answers that gate which steps apply. Kept as plain literals so this module
// stays free of screen imports.
export interface FlowContext {
  journeyStage?: 'active' | 'starting_soon' | 'none';
  route?: 'injection' | 'oral';
  frequency?: 'weekly' | 'biweekly' | 'daily' | 'custom';
}

// The dosing block only makes sense for someone actively on a GLP-1.
const MEDICATION_BLOCK: readonly OnboardingStep[] = ['currentDose', 'frequency', 'shotDay'];

export function shouldSkipStep(step: OnboardingStep, ctx: FlowContext): boolean {
  // Not actively dosing → skip the dose/frequency/shot-day block.
  if (ctx.journeyStage && ctx.journeyStage !== 'active' && MEDICATION_BLOCK.includes(step)) {
    return true;
  }
  // Not on a GLP-1 at all → also skip the medication picker.
  if (ctx.journeyStage === 'none' && step === 'medication') return true;
  // Shot day is for weekly injections only (oral / non-weekly have no shot day).
  if (step === 'shotDay' && (ctx.route === 'oral' || (ctx.frequency != null && ctx.frequency !== 'weekly'))) {
    return true;
  }
  return false;
}
