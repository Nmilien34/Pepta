// "Ways to hit it" — the food lists behind the Fiber and Protein tiles.
//
// WHY PHOTOS. Grams are the one number nobody can picture. "18 g of fiber to
// go" is a fact with no action in it; a photo of a cup of edamame with 8 g on
// it is the same fact and a decision. This is the screen the Home shortcut
// tiles open, and the reason those tiles carry photos rather than icons.
//
// Figures are per the listed serving, rounded the way a label rounds. They are
// reference values for picturing a portion, not a nutrition database — logging
// still goes through the meal sheet, which is where the user's real numbers
// come from.
//
// Pure data + pure helpers, no RN imports, so the copy logic unit-tests.

/**
 * The full panel, for the item-detail screen.
 *
 * VERIFIED AGAINST USDA FoodData Central, not estimated — the API returns
 * per-100 g values and a real FDC id, and the figures here are that record
 * scaled to the serving stated in `serving`. `fdcId` is the record actually
 * used, so the citation on screen can be checked.
 *
 * NOTE ON THE DESIGN'S CITATION: the frame prints "SR Legacy 05062" beside
 * "Cooked, skinless". 05062 is the RAW record; the roasted one is 05064, whose
 * modern FDC id is 171477. The frame's NUMBERS are right for 4 oz cooked — it
 * is only the id that points at the wrong row.
 */
export interface FoodPanel {
  fdcId: number;
  /** Per the food's own stated serving, not per 100 g. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number;
  fiber: number;
  sodium: number;
}

/** Keyed by NutrientFood.key. Absent until a food has been looked up. */
export const FOOD_PANELS: Record<string, FoodPanel> = {
  // FDC 171477 "Chicken, broilers or fryers, breast, meat only, cooked,
  // roasted" — per 100 g: 165 kcal, 31 g protein, 3.57 g fat, 1.01 g sat,
  // 0 carbs, 0 fiber, 74 mg sodium. Scaled to 4 oz (112 g).
  chicken: {
    fdcId: 171477,
    calories: 185,
    protein: 34.7,
    carbs: 0,
    fat: 4,
    satFat: 1.1,
    fiber: 0,
    sodium: 83,
  },
};

export interface NutrientFood {
  key: string;
  /** Brand, where the item IS a branded product. Shown above the name. */
  brand?: string;
  name: string;
  serving: string;
  /** Grams of THIS screen's nutrient in the listed serving. */
  amount: number;
  calories: number;
}

export type NutrientKind = 'fiber' | 'protein';

export const FIBER_FOODS: readonly NutrientFood[] = [
  { key: 'cookie-bar', brand: 'TRUBAR', name: 'Oh Oh Cookie Dough', serving: '1 bar (50 g)', amount: 13, calories: 190 },
  { key: 'edamame', name: 'Edamame', serving: '1 cup, shelled', amount: 8, calories: 188 },
  { key: 'avocado', name: 'Avocado', serving: '1/2 medium', amount: 7, calories: 160 },
  { key: 'almonds', name: 'Almonds', serving: '1 oz, about 23', amount: 3.5, calories: 164 },
  { key: 'psyllium', brand: 'GoodSense', name: 'Psyllium fiber powder', serving: '1 tbsp in water', amount: 3, calories: 45 },
];

export const PROTEIN_FOODS: readonly NutrientFood[] = [
  { key: 'chicken', name: 'Chicken breast', serving: '4 oz, cooked', amount: 35, calories: 185 },
  { key: 'core-power', brand: 'fairlife', name: 'Core Power Elite', serving: '14 fl oz bottle', amount: 42, calories: 230 },
  { key: 'salmon', name: 'Salmon', serving: '6 oz fillet', amount: 40, calories: 350 },
  { key: 'cottage-cheese', name: 'Cottage cheese', serving: '1/2 cup, low-fat', amount: 14, calories: 106 },
  { key: 'eggs', name: 'Eggs', serving: '2 large, boiled', amount: 12, calories: 156 },
  { key: 'peanuts', name: 'Peanuts', serving: '1 oz, roasted', amount: 7, calories: 166 },
];

export function foodsFor(kind: NutrientKind): readonly NutrientFood[] {
  return kind === 'fiber' ? FIBER_FOODS : PROTEIN_FOODS;
}

/**
 * Biggest first. Used only by waysHeadline's greedy pick — the STRIP renders
 * in list order, because that is what the design does: the protein frame's
 * photo row runs 35, 42, 40, 14, 12, 7, which is the list, not a ranking.
 */
export function bySize(kind: NutrientKind): NutrientFood[] {
  return [...foodsFor(kind)].sort((a, b) => b.amount - a.amount);
}

/** "13 g" / "3.5 g" — trailing .0 is noise on a 52px circle. */
export function gramsLabel(amount: number): string {
  return `${amount % 1 === 0 ? amount : amount.toFixed(1)} g`;
}

export interface WaysHeadline {
  /** "12 of 30 g" — the pill. */
  pill: string;
  /** 0..1 for the bar. */
  pct: number;
  /** The line under it. Names real foods, or congratulates. */
  line: string;
}

/**
 * The line under the progress bar. It names foods from THIS list that would
 * close the gap, so the sentence stays true when the list changes — the design
 * hard-codes "a cup of edamame and a bar covers it", which stops being true
 * the moment anyone edits the data.
 */
export function waysHeadline(
  kind: NutrientKind,
  current: number,
  target: number,
): WaysHeadline {
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  const pill = `${Math.round(current)} of ${Math.round(target)} g`;
  const gap = target - current;

  if (gap <= 0) {
    return { pill, pct, line: `Target met. Anything past this is a bonus, not a debt.` };
  }

  // Greedy, biggest first, until the picks COVER the gap. Taking only items
  // that fit under the remaining gap would leave the total short of it while
  // the sentence still says "covers it" — 13 g + 3.5 g is not 18 g.
  const picks: NutrientFood[] = [];
  let covered = 0;
  for (const food of bySize(kind)) {
    if (covered >= gap) break;
    picks.push(food);
    covered += food.amount;
  }

  const names = picks.slice(0, 2).map((f) => f.name.toLowerCase());
  const suggestion =
    names.length === 0
      ? ''
      : names.length === 1
        ? ` · ${names[0]} covers it.`
        : ` · ${names[0]} and ${names[1]} covers it.`;

  // The frames read "46 g to go · …" and "18 g to go · …" — no nutrient noun,
  // and a middot rather than a dash. The section heading above already said
  // which nutrient this is.
  return { pill, pct, line: `${gramsLabel(Math.round(gap * 10) / 10)} to go${suggestion}` };
}
