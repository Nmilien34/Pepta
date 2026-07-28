// Haptic ramp — the schedule behind a "rising" tactile sweep.
//
// iOS only exposes DISCRETE taps through expo-haptics (Soft → Light → Medium →
// Rigid → Heavy); there is no variable-intensity/continuous channel without
// Core Haptics and a native module. So a ramp is faked the way Apple fakes it
// when Core Haptics is unavailable: taps that both GROW HEAVIER and FALL CLOSER
// TOGETHER as progress approaches 1. Perceptually that reads as one swelling
// sensation rather than a row of separate knocks.
//
// Pure and RN-free on purpose so the timing/curve can be unit-tested in Node.

/** Impact styles in ascending perceived strength — the ramp's vocabulary. */
export const RAMP_STYLES = ['soft', 'light', 'medium', 'rigid', 'heavy'] as const;

export type RampStyle = (typeof RAMP_STYLES)[number];

export interface RampPulse {
  /** Milliseconds after the ramp starts. */
  atMs: number;
  style: RampStyle;
}

export interface RampOptions {
  /** Total span the ramp should cover. */
  durationMs: number;
  /** How many taps to place across it. */
  pulses: number;
  /**
   * How hard the taps bunch toward the end. 1 = evenly spaced; higher =
   * sparse at the start and rapid at the finish. Values below 1 are clamped
   * so a ramp never decelerates.
   */
  acceleration?: number;
}

/**
 * Places `pulses` taps across `durationMs`, accelerating toward the end and
 * escalating in strength. The final tap always lands exactly on `durationMs`
 * so the ramp resolves on the beat the animation finishes.
 */
export function buildHapticRamp({
  durationMs,
  pulses,
  acceleration = 1.7,
}: RampOptions): RampPulse[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  if (!Number.isFinite(pulses) || pulses <= 0) return [];

  const accel = Math.max(1, acceleration);
  const count = Math.floor(pulses);
  const out: RampPulse[] = [];

  for (let i = 1; i <= count; i += 1) {
    const ordinal = i / count;
    // WHEN it fires: ordinal**(1/accel) pushes points toward 1, shrinking gaps.
    // HOW HARD it hits: the raw ordinal, so the sweep always opens on the
    // softest tap and closes on the heaviest regardless of the time curve.
    out.push({
      atMs: Math.round(Math.pow(ordinal, 1 / accel) * durationMs),
      style: rampStyleAt(ordinal - Number.EPSILON),
    });
  }

  return out;
}

/** The impact style a ramp should use at progress `fraction` (0…1). */
export function rampStyleAt(fraction: number): RampStyle {
  const clamped = Math.min(1, Math.max(0, fraction));
  const index = Math.min(
    RAMP_STYLES.length - 1,
    Math.floor(clamped * RAMP_STYLES.length),
  );
  // index is clamped to the array's bounds above, so this is always defined.
  return RAMP_STYLES[index]!;
}
