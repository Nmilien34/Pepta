// The moving water surface, as pure geometry so it tests without react-native-svg.
//
// WHAT MAKES WATER READ AS WATER. A flat edge is the tell — the static cup used
// a single ellipse for the meniscus, which is right for a still glass and wrong
// the moment you expect the liquid to be alive. Real water has a travelling
// surface, and one wave alone looks like a flag: it repeats too obviously. Two
// waves of different wavelength and speed, sliding over each other, never quite
// repeat inside the few seconds anyone watches, which is what sells it.
//
// SEAMLESS LOOPING. Each path is drawn TWICE as wide as the glass and animated
// from x=0 to x=-width. At the moment it snaps back, the second copy is exactly
// where the first began, so the loop has no visible seam. This is why `wavePath`
// takes the glass width and returns something 2× that — halving it would put a
// hard edge in the middle of the animation.

/** One full sine-like cycle, expressed in quadratic segments. */
interface WaveOptions {
  /** Width of the glass. The path returned spans 2× this. */
  width: number;
  /** Peak-to-trough is 2× this. */
  amplitude: number;
  /** Horizontal distance of one full cycle. */
  wavelength: number;
  /** How far below the surface to close the shape — the body of the water. */
  depth: number;
}

/**
 * A closed path: a travelling surface across the top, filled down to `depth`.
 *
 * Quadratic segments rather than sampled points — two `q` commands per cycle
 * draw a curve indistinguishable from a sine at this size, in a fraction of the
 * path data. A sampled polyline needs ~4px steps before the facets stop showing
 * on the meniscus, which is the one edge the eye actually studies.
 */
export function wavePath({ width, amplitude, wavelength, depth }: WaveOptions): string {
  const total = width * 2;
  const half = wavelength / 2;
  const quarter = wavelength / 4;

  // Baseline sits at `amplitude`, so the crest reaches y≈0 and the trough
  // y≈2·amplitude. The caller positions the whole path, so the surface's own
  // coordinate space starts at zero.
  const parts: string[] = [`M0 ${round(amplitude)}`];

  // Always finish on a whole cycle — a partial one leaves the end at a
  // different height from the start, and the seam reappears.
  const cycles = Math.ceil(total / wavelength);
  for (let i = 0; i < cycles; i += 1) {
    parts.push(`q${round(quarter)} ${round(-amplitude)} ${round(half)} 0`);
    parts.push(`q${round(quarter)} ${round(amplitude)} ${round(half)} 0`);
  }

  const end = cycles * wavelength;
  parts.push(`L${round(end)} ${round(depth)}`);
  parts.push(`L0 ${round(depth)}`);
  parts.push('Z');
  return parts.join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * How far to slide the water body down for a 0..1 level, in viewBox units.
 *
 * The water is drawn once at full height and TRANSLATED rather than resized:
 * animating a transform keeps the wave's own geometry constant, so the surface
 * never stretches as the level changes. Resizing a rect would squash the
 * meniscus flat at low levels, which is the exact artefact this replaces.
 */
export function levelOffset(pct: number, interior: number): number {
  const clamped = Math.max(0, Math.min(1, pct));
  return (1 - clamped) * interior;
}

/**
 * Seconds for one wave to travel its own width.
 *
 * Slow. Water in a held glass moves at a pace that reads as weight; anything
 * under a couple of seconds looks like a loading spinner wearing a wave.
 */
export const WAVE_PERIOD_MS = 4200;
/** The second wave runs slower and shallower so the two never phase-lock. */
export const WAVE_PERIOD_SLOW_MS = 6800;
