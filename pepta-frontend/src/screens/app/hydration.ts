// The Water screen's data: what you drink out of, and what's worth drinking.
//
// TWO DIFFERENT QUESTIONS. "Quick add" answers how much — a vessel is a volume
// with a familiar name, so nobody has to estimate ounces. "Hydration examples"
// answers what: on a GLP-1, plain water alone is often the thing that is not
// working, because appetite loss takes the electrolytes out with the food.
// That is why the second list carries a sodium or potassium figure rather than
// another volume.
//
// VOLUMES ARE WHAT THE LABEL SAYS. "Makes 16 fl oz" is the mixed volume of a
// stick, not the stick itself — logging a Liquid I.V. adds the water you drank
// it in. Electrolyte figures are per serving, off the manufacturer's panel.
//
// Pure data + pure helpers, no RN imports.

export interface Vessel {
  key: string;
  /** Ounces this vessel adds. Null is the "type it yourself" tile. */
  ounces: number | null;
  label: string;
  /** What it is, under the amount. */
  name: string;
  icon: string;
}

/**
 * Ordered small → large. People reach for the one that matches what is in
 * their hand, so the row is scanned by size rather than frequency.
 */
export const VESSELS: readonly Vessel[] = [
  { key: 'glass', ounces: 8, label: '+8 oz', name: 'Small glass', icon: 'glass' },
  { key: 'mug', ounces: 12, label: '+12 oz', name: 'Mug', icon: 'mug' },
  { key: 'bottle', ounces: 16, label: '+16 oz', name: 'Bottle', icon: 'bottle' },
  { key: 'shaker', ounces: 24, label: '+24 oz', name: 'Shaker', icon: 'shaker' },
  { key: 'sports', ounces: 34, label: '+34 oz', name: 'Sports bottle', icon: 'sports' },
  { key: 'tumbler', ounces: 40, label: '+40 oz', name: 'Tumbler', icon: 'tumbler' },
];

/**
 * The bigger containers that only make sense for a bigger goal. Kept out of
 * the base row so a 64 oz goal is not offered a gallon jug.
 */
export const BIG_VESSELS: readonly Vessel[] = [
  { key: 'half-gallon', ounces: 64, label: '+64 oz', name: 'Half gallon', icon: 'jug' },
  { key: 'gallon', ounces: 128, label: '+128 oz', name: 'Gallon jug', icon: 'jug' },
];

export const CUSTOM_VESSEL: Vessel = {
  key: 'custom',
  ounces: null,
  label: 'Custom',
  name: 'Type it',
  icon: 'custom',
};

/**
 * The Quick add row, extended until it can actually fill the glass.
 *
 * The six named vessels stop at 40 oz, which on a 100 oz goal means the row
 * runs out long before the day is done — swiping right just ends. So the row
 * keeps going: the larger containers that fit inside the goal, then a tile
 * that adds exactly what is left of today, which is the one that fills the
 * cup. Custom stays last.
 *
 * NOTHING IS OFFERED THAT OVERSHOOTS THE GOAL. A gallon jug on a 64 oz target
 * is not a shortcut, it is a wrong number one tap away.
 */
export function quickAddVessels(
  target: number | null,
  current = 0,
  /**
   * Drinks the user starred. The design is explicit that a saved drink also
   * appears in Quick add, so the favourite and the shortcut are one thing
   * rather than two lists to keep in step.
   */
  saved: readonly { name: string; ounces?: number }[] = [],
): Vessel[] {
  const row: Vessel[] = [...VESSELS];

  for (const drink of saved) {
    if (drink.ounces == null || drink.ounces <= 0) continue;
    // Skip one that duplicates an amount already offered — two tiles adding
    // 16 oz, one called Bottle and one called your bottle, is a choice with no
    // difference.
    if (row.some((v) => v.ounces === drink.ounces)) continue;
    row.push({
      key: `saved:${drink.name}`,
      ounces: drink.ounces,
      label: `+${drink.ounces} oz`,
      name: drink.name,
      icon: vesselForOunces(drink.ounces),
    });
  }

  if (target == null || target <= 0) {
    row.sort((a, b) => (a.ounces ?? 0) - (b.ounces ?? 0));
    return [...row, CUSTOM_VESSEL];
  }

  for (const big of BIG_VESSELS) {
    if (big.ounces != null && big.ounces <= target) row.push(big);
  }

  // What is left of today. Skipped once the goal is met, and skipped when a
  // tile already offers that exact amount — two tiles adding 40 oz, one of
  // them called "Fill the cup", is a puzzle rather than a shortcut.
  const remaining = Math.round((target - current) * 10) / 10;
  if (remaining > 0 && !row.some((v) => v.ounces === remaining)) {
    row.push({
      key: 'fill',
      ounces: remaining,
      label: `+${remaining % 1 === 0 ? remaining : remaining.toFixed(1)} oz`,
      name: 'Fill the cup',
      icon: 'full',
    });
  }

  // A row scanned by size has to BE sorted by size. Without this the fill
  // tile lands after a bigger named vessel — "+64 Half gallon, +58 Fill the
  // cup" — which reads as a bug rather than a choice.
  row.sort((a, b) => (a.ounces ?? 0) - (b.ounces ?? 0));

  return [...row, CUSTOM_VESSEL];
}

export interface HydrationExample {
  key: string;
  brand: string;
  name: string;
  /** "16.9 fl oz" or "Makes 16 fl oz" — the label's own wording. */
  volume: string;
  /** The electrolyte fact. This is the reason the row is on the screen. */
  fact: string;
  /** Ounces logged when tapped. */
  ounces: number;
}

export const HYDRATION_EXAMPLES: readonly HydrationExample[] = [
  { key: 'vita-coco', brand: 'Vita Coco', name: 'Coconut water, original', volume: '16.9 fl oz', fact: 'Potassium 470 mg', ounces: 16.9 },
  { key: 'lmnt', brand: 'LMNT', name: 'Lemonade + iced tea stick', volume: 'Makes 16 fl oz', fact: 'Sodium 1,000 mg', ounces: 16 },
  { key: 'liquid-iv', brand: 'Liquid I.V.', name: 'Hydration multiplier stick', volume: 'Makes 16 fl oz', fact: 'Sodium 500 mg', ounces: 16 },
  { key: 'nuun', brand: 'Nuun Sport', name: 'Lemon lime tablet', volume: 'Makes 16 fl oz', fact: 'Sodium 300 mg', ounces: 16 },
  { key: 'kirkland-coconut', brand: 'Kirkland', name: 'Organic coconut water', volume: '14 fl oz', fact: 'Potassium 590 mg', ounces: 14 },
  { key: 'helenvita', brand: 'Helenvita', name: 'Electrolyte tablet', volume: 'Makes 8.5 oz', fact: 'Minerals + vitamins', ounces: 8.5 },
];

/** "of your 100 oz goal", or nothing to compare against yet. */
export function goalLine(target: number | null): string {
  if (target == null || target <= 0) return 'Set a daily water goal in your profile';
  return `of your ${Math.round(target)} oz goal`;
}

/**
 * Ounces rendered the way a person says them: 16.9 keeps its decimal, 16 does
 * not grow one. Used for the amount in the middle of the stepper.
 */
export function ouncesLabel(oz: number): string {
  const rounded = Math.round(oz * 10) / 10;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} oz`;
}

/**
 * The vessel drawing that best fits a volume.
 *
 * A saved drink shows the shape you actually pick up rather than a generic
 * icon — the same drawings as Quick add, so the favourite and the shortcut
 * read as the same thing. Nearest by size, never larger than the volume
 * suggests: a 10 oz drink drawn as a gallon jug would be a worse lie than a
 * mug.
 */
export function vesselForOunces(ounces: number | undefined): string {
  if (ounces == null) return 'glass';
  const sized = [...VESSELS, ...BIG_VESSELS].filter(
    (v): v is Vessel & { ounces: number } => v.ounces != null,
  );
  let best = sized[0]!;
  for (const v of sized) {
    if (Math.abs(v.ounces - ounces) < Math.abs(best.ounces - ounces)) best = v;
  }
  return best.icon;
}

/** The vessel's name when a volume matches one exactly, else null. */
export function vesselNameForExactOunces(ounces: number): string | null {
  const match = [...VESSELS, ...BIG_VESSELS].find((v) => v.ounces === ounces);
  return match?.name ?? null;
}

/**
 * The panel behind the item-detail screen for a drink.
 *
 * MANUFACTURER LABELS, and they say so. These products are branded, so there
 * is no SR Legacy record to cite; USDA's Branded Foods entries for several of
 * them disagree with the makers' own labels on potassium by a wide margin, so
 * citing a USDA id here would attach a checkable-looking reference to figures
 * that do not match it. The label is the honest source, and `fdcId` stays
 * absent rather than pointing at a lookalike.
 *
 * Electrolytes, not macros: on a GLP-1 the sodium and potassium are the reason
 * these are on the screen at all.
 */
export interface DrinkPanel {
  source: string;
  /** Pep's note — the only judgement on the detail screen, labelled as one. */
  note?: string;
  calories?: number;
  carbs?: number;
  sodium?: number;
  potassium?: number;
  magnesium?: number;
}

/** Keyed by HydrationExample.key. */
export const DRINK_PANELS: Record<string, DrinkPanel> = {
  'vita-coco': { source: 'Vita Coco label, 16.9 fl oz', calories: 60, carbs: 15, sodium: 30, potassium: 470, note: 'Potassium without the sodium. Good alongside an electrolyte, not instead of one.' },
  lmnt: { source: 'LMNT label, one stick', calories: 10, carbs: 2, sodium: 1000, potassium: 200, magnesium: 60, note: '1,000 mg of sodium is a lot in one stick — that is the point on a GLP-1, but it is not an all-day drink.' },
  'liquid-iv': { source: 'Liquid I.V. label, one stick', calories: 45, carbs: 11, sodium: 500, potassium: 370, note: 'Carries real sugar, which is what makes it absorb quickly. Worth knowing if you are counting.' },
  nuun: { source: 'Nuun Sport label, one tablet', calories: 15, carbs: 4, sodium: 300, potassium: 150, magnesium: 25, note: 'Low sodium next to the others. Fine for a normal day, light if you have been struggling.' },
  'kirkland-coconut': { source: 'Kirkland Signature label, 14 fl oz', calories: 60, carbs: 15, sodium: 40, potassium: 590, note: 'The most potassium per dollar on this list. Barely any sodium though.' },
  helenvita: { source: 'Helenvita label, one tablet', calories: 10, carbs: 2, sodium: 180, potassium: 100, magnesium: 56, note: 'A middle option — some of everything rather than a lot of sodium.' },
};
