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
export function quickAddVessels(target: number | null, current = 0): Vessel[] {
  const row: Vessel[] = [...VESSELS];
  if (target == null || target <= 0) return [...row, CUSTOM_VESSEL];

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
