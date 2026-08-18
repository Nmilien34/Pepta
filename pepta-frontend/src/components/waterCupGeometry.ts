// The glass's measurements, split out from the component so they test without
// mocking react-native-svg.
//
// The path is 'M24 13 L33 108 a8 8 0 0 0 8 8 h14 a8 8 0 0 0 8-8 L72 13 Z':
// a rim at y=13 spanning x 24..72, tapering to x 33..63 by y=108, then a
// rounded foot down to y=116.

/** Rim at y=13, base at y=116. */
export const RIM_Y = 13;
export const BASE_Y = 116;
export const INTERIOR = BASE_Y - RIM_Y;
/** Where the taper ends and the foot's curve begins. */
const TAPER_END_Y = 108;

/**
 * Half-width of the glass at a given height — it tapers 24 → 15.
 *
 * The water surface ellipse uses this. A constant radius would detach from the
 * wall as the glass empties, which is exactly the tell that makes a drawn
 * glass look drawn.
 */
export function surfaceRadius(y: number): number {
  const t = Math.max(0, Math.min(1, (y - RIM_Y) / (TAPER_END_Y - RIM_Y)));
  return 24 - t * 9;
}

/** Fill line for a 0..1 level. 0 sits on the base, 1 at the rim. */
export function fillLine(pct: number): number {
  return BASE_Y - Math.max(0, Math.min(1, pct)) * INTERIOR;
}
