// What a free-text goal computes against.
//
// THE PROBLEM. `goalType` is not a label, it is an input to the maths: the
// backend reads it for the protein multiplier (PROTEIN_G_PER_KG[goalType]) and
// to decide whether there is a calorie deficit at all (maintain => 0). A
// sentence like "train for a half marathon without losing my strength" cannot
// produce either number, and guessing one from keywords would be inventing a
// plan from a string match.
//
// THE ANSWER. The user gives us their start weight and their goal weight two
// screens later, whatever they typed here. That delta is a real, stated
// intention, so the computable goalType is derived from it and their words are
// kept alongside as `goalNote` — descriptive only. Nothing is invented, and
// nothing they said is thrown away.
//
// Pure and RN-free.

import type { GoalType } from './GoalTypeScreen';

/**
 * Weights within this band of each other read as "hold roughly here" rather
 * than as a direction. Expressed per-unit so it means the same thing in both.
 */
export const MAINTAIN_BAND = { lb: 3, kg: 1.5 } as const;

export interface GoalWeights {
  startWeight: number;
  goalWeight: number;
  unit: 'lb' | 'kg';
}

/**
 * The goalType to compute the plan with when the user wrote their own goal.
 *
 * Falls back to 'lose_fat' only when the numbers are missing or unusable —
 * it is the most common intent on a GLP-1 and the one the rest of the plan
 * already defaults to, so an incomplete profile behaves as it always did.
 */
export function goalTypeFromWeights(weights: GoalWeights | null | undefined): GoalType {
  if (!weights) return 'lose_fat';
  const { startWeight, goalWeight, unit } = weights;
  if (![startWeight, goalWeight].every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) {
    return 'lose_fat';
  }

  const delta = startWeight - goalWeight; // positive => they want to lose
  if (Math.abs(delta) <= MAINTAIN_BAND[unit]) return 'maintain';
  // Wanting to end up heavier, on a GLP-1, is a recomposition goal.
  return delta > 0 ? 'lose_fat' : 'recomp';
}

/**
 * Tidy a typed goal for storage: trimmed, collapsed whitespace, capped to the
 * schema's 80. Returns undefined for anything that is not real content, so an
 * empty "Other" never writes a blank note.
 */
export function normalizeGoalNote(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, 80);
}
