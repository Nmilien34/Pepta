// Reconstitution math for the mix calculator. Pure unit conversion of the
// USER'S OWN numbers — nothing in here recommends a dose or a protocol.
//
// Ground truth: insulin syringes are always 100 units per mL, so
//   concentration (mg/mL) = vialMg / waterMl
//   unitsToDraw           = (doseMg / concentration) × 100

export type SyringeSize = 30 | 50 | 100; // units (0.3 / 0.5 / 1 mL)

export interface MixInput {
  /** Peptide in the vial, mg. */
  vialMg: number;
  /** Syringe capacity in units. */
  syringeUnits: SyringeSize;
  /** Desired dose, mcg. */
  doseMcg: number;
  /** BAC water to add, mL. Omit to use the suggestion. */
  waterMl?: number;
}

export interface MixResult {
  waterMl: number;
  waterSuggested: boolean;
  concentrationMgPerMl: number;
  unitsToDraw: number;
  /** Draw fits on the chosen syringe. */
  fits: boolean;
  /** Draw is readable (≥ 2 units — below that, marks are unreadably close). */
  readable: boolean;
}

export const WATER_STEP_ML = 0.5;
export const WATER_MIN_ML = 0.5;
export const WATER_MAX_ML = 5;

const WATER_CANDIDATES_ML = [1, 1.5, 2, 2.5, 3, 4, 5];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function unitsFor(vialMg: number, waterMl: number, doseMcg: number): number {
  const concentration = vialMg / waterMl; // mg/mL
  const doseMg = doseMcg / 1000;
  return round1((doseMg / concentration) * 100);
}

/**
 * Suggest the water amount that lands the draw on the friendliest syringe
 * position: whole-unit marks preferred, comfortably on the barrel (2 units up
 * to 80% of capacity so there is room to correct an over-pull).
 */
export function suggestWaterMl(
  vialMg: number,
  syringeUnits: SyringeSize,
  doseMcg: number,
): number {
  let best = WATER_CANDIDATES_ML[0]!;
  let bestScore = -Infinity;
  for (const water of WATER_CANDIDATES_ML) {
    const units = unitsFor(vialMg, water, doseMcg);
    if (units <= 0) continue;
    let score = 0;
    if (units >= 2 && units <= syringeUnits * 0.8) score += 100;
    else if (units <= syringeUnits) score += 40;
    if (Math.abs(units - Math.round(units)) < 0.05) score += 30; // whole marks
    else if (Math.abs(units * 2 - Math.round(units * 2)) < 0.1) score += 12; // halves
    score -= Math.abs(units - syringeUnits * 0.2) * 0.5; // prefer low-ish draws
    if (score > bestScore) {
      bestScore = score;
      best = water;
    }
  }
  return best;
}

export function computeMix(input: MixInput): MixResult | null {
  if (
    !Number.isFinite(input.vialMg) ||
    input.vialMg <= 0 ||
    !Number.isFinite(input.doseMcg) ||
    input.doseMcg <= 0
  ) {
    return null;
  }
  const waterSuggested = input.waterMl == null;
  const waterMl =
    input.waterMl ?? suggestWaterMl(input.vialMg, input.syringeUnits, input.doseMcg);
  if (!Number.isFinite(waterMl) || waterMl <= 0) return null;

  const unitsToDraw = unitsFor(input.vialMg, waterMl, input.doseMcg);
  return {
    waterMl,
    waterSuggested,
    concentrationMgPerMl: round1(input.vialMg / waterMl),
    unitsToDraw,
    fits: unitsToDraw <= input.syringeUnits,
    readable: unitsToDraw >= 2,
  };
}
