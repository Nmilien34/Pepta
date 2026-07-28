import { describe, expect, it } from 'vitest';
import { RAMP_STYLES, buildHapticRamp, rampStyleAt } from './hapticRamp';

describe('buildHapticRamp', () => {
  it('accelerates — every gap is shorter than the one before it', () => {
    const ramp = buildHapticRamp({ durationMs: 1500, pulses: 10 });
    const gaps = ramp.map((pulse, i) =>
      i === 0 ? pulse.atMs : pulse.atMs - ramp[i - 1]!.atMs,
    );

    // This is the whole point of the ramp: taps crowd together toward the end,
    // which is what reads as "rising" when intensity alone cannot vary.
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]!).toBeLessThanOrEqual(gaps[i - 1]!);
    }
  });

  it('escalates strength monotonically and never exceeds the vocabulary', () => {
    const ramp = buildHapticRamp({ durationMs: 3200, pulses: 14 });
    const strength = ramp.map((pulse) => RAMP_STYLES.indexOf(pulse.style));

    for (let i = 1; i < strength.length; i += 1) {
      expect(strength[i]!).toBeGreaterThanOrEqual(strength[i - 1]!);
    }
    expect(strength[0]).toBe(0);
    expect(strength.at(-1)).toBe(RAMP_STYLES.length - 1);
  });

  it('lands its final tap exactly on the animation’s last frame', () => {
    const ramp = buildHapticRamp({ durationMs: 1500, pulses: 8 });
    expect(ramp.at(-1)?.atMs).toBe(1500);
    expect(ramp).toHaveLength(8);
  });

  it('keeps every tap inside the window and strictly ordered', () => {
    const ramp = buildHapticRamp({ durationMs: 900, pulses: 12 });
    ramp.forEach((pulse, i) => {
      expect(pulse.atMs).toBeGreaterThanOrEqual(0);
      expect(pulse.atMs).toBeLessThanOrEqual(900);
      if (i > 0) expect(pulse.atMs).toBeGreaterThanOrEqual(ramp[i - 1]!.atMs);
    });
  });

  it('refuses to schedule anything for degenerate inputs', () => {
    expect(buildHapticRamp({ durationMs: 0, pulses: 6 })).toEqual([]);
    expect(buildHapticRamp({ durationMs: -10, pulses: 6 })).toEqual([]);
    expect(buildHapticRamp({ durationMs: 1000, pulses: 0 })).toEqual([]);
    expect(buildHapticRamp({ durationMs: Number.NaN, pulses: 6 })).toEqual([]);
  });

  it('never decelerates even if asked to', () => {
    // acceleration below 1 would bunch taps at the START (a falling ramp); it
    // clamps to evenly spaced. Duration divides evenly by pulses so the
    // assertion tests the curve rather than millisecond rounding.
    const ramp = buildHapticRamp({ durationMs: 1200, pulses: 6, acceleration: 0.2 });
    const gaps = ramp.map((pulse, i) =>
      i === 0 ? pulse.atMs : pulse.atMs - ramp[i - 1]!.atMs,
    );
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i]!).toBeLessThanOrEqual(gaps[i - 1]!);
    }
  });
});

describe('rampStyleAt', () => {
  it('walks the vocabulary from softest to heaviest', () => {
    expect(rampStyleAt(0)).toBe('soft');
    expect(rampStyleAt(1)).toBe('heavy');
    expect(rampStyleAt(0.5)).toBe('medium');
  });

  it('clamps out-of-range progress instead of indexing off the end', () => {
    expect(rampStyleAt(-5)).toBe('soft');
    expect(rampStyleAt(42)).toBe('heavy');
  });
});
