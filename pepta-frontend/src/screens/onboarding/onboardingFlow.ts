// Pure onboarding step machine — the ordered step list plus next/prev/progress.
// No React/RN imports, so it unit-tests in plain Node. The navigator consumes
// these; gating (skipping medication steps for non-medicated users, vial-only
// concentration, weekly-only shot day/time) layers on top via shouldSkipStep.
//
// v2.2 conversational flow. Interstitial beats (instrument/company/fearAnswered)
// are real steps so the progress bar moves through them; `rating` is gone — the
// review ask moved post-purchase (welcomeIn), which also removes the invented
// social-proof screen (2.3.1 risk). Side effects now come BEFORE the worry so
// Beat C can answer the fear directly.

export const ONBOARDING_STEPS = [
  'privacy',
  'journeyStage',
  'experience',
  'needs',
  'medication',
  'route',
  'currentDose',
  'deviceType',
  'concentration',
  'frequency',
  'lastShot',
  'shotDay',
  'shotTime',
  'instrument',
  'goalType',
  'alsoTracking',
  'sexGender',
  'birthday',
  'heightWeight',
  'startWeight',
  'goalWeight',
  'goalPace',
  'company',
  'dailyRoutine',
  'training',
  'sideEffects',
  'biggestWorry',
  'fearAnswered',
  'momentum',
  'notifications',
  'crafting',
  'reveal',
  'paywall',
  'welcomeIn',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// The progress bar counts the full funnel (Welcome=1, then these), so the
// first onboarding step (privacy) reads as 2/35.
const FUNNEL_LENGTH = 35;
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

// 0..1 progress for the hairline bar. privacy → 2/35, welcomeIn → 1.
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
  // True when the picked medication pins its route (branded meds) — the
  // explicit "how do you take it" step only shows for ambiguous picks.
  routeLocked?: boolean;
  deviceType?: 'single_dose_pen' | 'auto_injector' | 'syringe_vial' | 'other';
  frequency?: 'weekly' | 'biweekly' | 'daily' | 'custom';
}

// The dosing block only makes sense for someone actively on a GLP-1.
const MEDICATION_BLOCK: readonly OnboardingStep[] = [
  'currentDose',
  'deviceType',
  'concentration',
  'frequency',
  'lastShot',
  'shotDay',
  'shotTime',
  'instrument',
];

export function shouldSkipStep(step: OnboardingStep, ctx: FlowContext): boolean {
  // Not actively dosing → skip the dose/frequency/shot-day block (and the
  // instrument beat — there's no level model to arm yet).
  if (ctx.journeyStage && ctx.journeyStage !== 'active' && MEDICATION_BLOCK.includes(step)) {
    return true;
  }
  // Not on a GLP-1 at all → also skip the medication picker (and its route question).
  if (ctx.journeyStage === 'none' && (step === 'medication' || step === 'route')) return true;
  // The route question only shows when the picked medication doesn't pin it.
  if (step === 'route' && ctx.routeLocked) return true;
  // Device type is an injection question.
  if (step === 'deviceType' && ctx.route === 'oral') return true;
  // Concentration only matters when the user draws doses from a vial.
  if (step === 'concentration' && ctx.deviceType !== 'syringe_vial') return true;
  // Shot day + time are for weekly injections only.
  if (
    (step === 'shotDay' || step === 'shotTime') &&
    (ctx.route === 'oral' || (ctx.frequency != null && ctx.frequency !== 'weekly'))
  ) {
    return true;
  }
  return false;
}
