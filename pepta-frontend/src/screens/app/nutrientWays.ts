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
 * The full panel behind the item-detail screen.
 *
 * LOOKED UP, NOT ESTIMATED. Every USDA row here came from FoodData Central's
 * API — per-100 g values scaled to the serving this app states — and `fdcId`
 * names the record used, so the citation on screen can be checked. Branded
 * items are not in SR Legacy, so they carry their manufacturer's panel and say
 * so; `fdcId` is absent there rather than pointing at a lookalike.
 *
 * NOTE ON THE DESIGN'S CITATION: the frame prints "SR Legacy 05062" beside
 * "Cooked, skinless". 05062 is the RAW record; roasted is 05064, whose modern
 * FDC id is 171477. The frame's NUMBERS are right for 4 oz cooked — only the
 * id points at the wrong row.
 */
export interface FoodPanel {
  /** Absent for branded items, which have no USDA record. */
  fdcId?: number;
  /** Shown under the nutrition card. */
  source: string;
  /** Per the food's own stated serving, never per 100 g. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number;
  fiber: number;
  sodium: number;
}

const USDA = (id: number, desc: string) =>
  `USDA FoodData Central · ${desc} (${id})`;

/** Keyed by NutrientFood.key. */
export const FOOD_PANELS: Record<string, FoodPanel> = {
  // 171477 per 100 g: 165 kcal / 31 P / 3.57 F / 1.01 SF / 0 C / 0 Fi / 74 Na
  chicken: { fdcId: 171477, source: USDA(171477, 'Chicken breast, meat only, roasted'), calories: 185, protein: 34.7, carbs: 0, fat: 4, satFat: 1.1, fiber: 0, sodium: 83 },
  // 175168 per 100 g × 1.70 (6 oz)
  salmon: { fdcId: 175168, source: USDA(175168, 'Salmon, Atlantic, farmed, cooked'), calories: 350, protein: 37.6, carbs: 0, fat: 21.1, satFat: 4.1, fiber: 0, sodium: 104 },
  // 172182 per 100 g × 1.13 (1/2 cup)
  'cottage-cheese': { fdcId: 172182, source: USDA(172182, 'Cottage cheese, lowfat, 2% milkfat'), calories: 92, protein: 11.8, carbs: 5.4, fat: 2.6, satFat: 1.4, fiber: 0, sodium: 348 },
  // 173424 per 100 g × 1.00 (2 large ≈ 100 g)
  eggs: { fdcId: 173424, source: USDA(173424, 'Egg, whole, cooked, hard-boiled'), calories: 155, protein: 12.6, carbs: 1.1, fat: 10.6, satFat: 3.3, fiber: 0, sodium: 124 },
  // 173806 per 100 g × 0.28 (1 oz)
  peanuts: { fdcId: 173806, source: USDA(173806, 'Peanuts, dry-roasted, without salt'), calories: 164, protein: 6.8, carbs: 6, fat: 13.9, satFat: 2.2, fiber: 2.4, sodium: 1.7 },
  // 168411 per 100 g × 1.55 (1 cup shelled)
  edamame: { fdcId: 168411, source: USDA(168411, 'Edamame, frozen, prepared'), calories: 188, protein: 18.4, carbs: 13.8, fat: 8.1, satFat: 1, fiber: 8.1, sodium: 9.3 },
  // 171706 per 100 g × 1.00 (1/2 medium)
  avocado: { fdcId: 171706, source: USDA(171706, 'Avocados, raw, California'), calories: 167, protein: 2, carbs: 8.6, fat: 15.4, satFat: 2.1, fiber: 6.8, sodium: 8 },
  // 170158 per 100 g × 0.28 (1 oz, about 23)
  almonds: { fdcId: 170158, source: USDA(170158, 'Almonds, dry roasted, without salt'), calories: 167, protein: 5.9, carbs: 5.9, fat: 14.7, satFat: 1.1, fiber: 3.1, sodium: 0.8 },

  // Branded — no USDA record, so the manufacturer's panel and no fake id.
  'core-power': { source: 'fairlife Core Power Elite label', calories: 230, protein: 42, carbs: 9, fat: 3.5, satFat: 2, fiber: 0, sodium: 250 },
  'cookie-bar': { source: 'TRUBAR label', calories: 190, protein: 8, carbs: 22, fat: 10, satFat: 3.5, fiber: 13, sodium: 65 },
  psyllium: { source: 'GoodSense psyllium fiber powder label', calories: 45, protein: 0, carbs: 11, fat: 0, satFat: 0, fiber: 3, sodium: 5 },
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
  { key: 'edamame', name: 'Edamame', serving: '1 cup, shelled', amount: 8.1, calories: 188 },
  { key: 'avocado', name: 'Avocado', serving: '1/2 medium', amount: 6.8, calories: 167 },
  { key: 'almonds', name: 'Almonds', serving: '1 oz, about 23', amount: 3.1, calories: 167 },
  { key: 'psyllium', brand: 'GoodSense', name: 'Psyllium fiber powder', serving: '1 tbsp in water', amount: 3, calories: 45 },
];

export const PROTEIN_FOODS: readonly NutrientFood[] = [
  { key: 'chicken', name: 'Chicken breast', serving: '4 oz, cooked', amount: 34.7, calories: 185 },
  { key: 'core-power', brand: 'fairlife', name: 'Core Power Elite', serving: '14 fl oz bottle', amount: 42, calories: 230 },
  { key: 'salmon', name: 'Salmon', serving: '6 oz fillet', amount: 37.6, calories: 350 },
  { key: 'cottage-cheese', name: 'Cottage cheese', serving: '1/2 cup, low-fat', amount: 11.8, calories: 92 },
  { key: 'eggs', name: 'Eggs', serving: '2 large, boiled', amount: 12.6, calories: 155 },
  { key: 'peanuts', name: 'Peanuts', serving: '1 oz, roasted', amount: 6.8, calories: 164 },
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
