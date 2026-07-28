import { describe, expect, it } from 'vitest';
import { RAMP_STYLES } from '../../utils/hapticRamp';
import { BAR_FLOOR, buildLeanMassBars, leanMassSettleMs } from './leanMassBars';

describe('buildLeanMassBars', () => {
  const bars = buildLeanMassBars();

  it('quantifies the unmanaged bar only', () => {
    // The guard on the claim. We cite 25–39% for lean mass lost when nobody
    // watches; we have NO source for how much protein + pace recover. If this
    // test is failing because someone put a number on the managed bar, the
    // question to answer is "cited to what?", not "how do I fix the test".
    const unmanaged = bars.find((b) => b.key === 'unmanaged')!;
    const managed = bars.find((b) => b.key === 'managed')!;
    expect(unmanaged.label).toBe('39%');
    expect(managed.label).toBeUndefined();
  });

  it('keeps the managed bar visibly shorter', () => {
    const unmanaged = bars.find((b) => b.key === 'unmanaged')!;
    const managed = bars.find((b) => b.key === 'managed')!;
    // Not just shorter — shorter by enough to read at a glance on a phone.
    expect(unmanaged.height - managed.height).toBeGreaterThan(0.3);
  });

  it('starts every bar from a visible floor, never from zero', () => {
    // Growing from nothing reads as a chart being drawn. Starting part-built
    // and diverging is what makes it read as a number getting worse.
    for (const bar of bars) {
      expect(bar.from).toBe(BAR_FLOOR);
      expect(bar.from).toBeGreaterThan(0.1);
      expect(bar.from).toBeLessThan(bar.height);
    }
  });

  it('gives the unmanaged bar the longer climb, and moves it first', () => {
    const unmanaged = bars.find((b) => b.key === 'unmanaged')!;
    const managed = bars.find((b) => b.key === 'managed')!;
    expect(unmanaged.delayMs).toBeLessThan(managed.delayMs);
    expect(unmanaged.durationMs).toBeGreaterThan(managed.durationMs);
  });

  it('overlaps the two climbs so it reads as one gesture', () => {
    const unmanaged = bars.find((b) => b.key === 'unmanaged')!;
    const managed = bars.find((b) => b.key === 'managed')!;
    expect(managed.delayMs).toBeLessThan(unmanaged.delayMs + unmanaged.durationMs);
  });

  it('lands the bigger bar with the heavier haptic', () => {
    const unmanaged = bars.find((b) => b.key === 'unmanaged')!;
    const managed = bars.find((b) => b.key === 'managed')!;
    const weight = (s: string) => RAMP_STYLES.indexOf(s as never);
    expect(weight(unmanaged.haptic)).toBeGreaterThan(weight(managed.haptic));
  });

  it('is slow enough to watch, without stalling the funnel', () => {
    // Widened from <1600ms on Nick's call (2026-07-28): the point of this beat
    // is that the divergence is WATCHED, and at ~1s it registered as a snap
    // into position rather than as something building. The upper bound is what
    // still matters — past ~2.5s the user is just waiting to tap.
    const settle = leanMassSettleMs(bars);
    expect(settle).toBeGreaterThan(1500);
    expect(settle).toBeLessThan(2500);
  });
});
