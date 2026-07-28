import { describe, expect, it } from 'vitest';
import { RAMP_STYLES } from '../../utils/hapticRamp';
import { averageSpeed, buildRevealSegments, revealDurationMs } from './revealPacing';

describe('buildRevealSegments', () => {
  const segments = buildRevealSegments();

  it('moves forward only, and finishes exactly at the flag', () => {
    let previous = 0;
    for (const s of segments) {
      expect(s.to).toBeGreaterThan(previous);
      previous = s.to;
    }
    expect(segments[segments.length - 1]!.to).toBe(1);
  });

  it('accelerates across the three phases', () => {
    // The whole point: it should feel like it is gathering, then flowing,
    // then released. Speed must strictly increase between phases.
    const gathering = averageSpeed(segments, 0, 4); // 0 → 50%
    const flowing = averageSpeed(segments, 4, 6); // 50 → 75%
    const released = averageSpeed(segments, 6, 8); // 75 → 100%

    expect(flowing).toBeGreaterThan(gathering);
    expect(released).toBeGreaterThan(flowing);
  });

  it('pauses hardest early and not at all at the end', () => {
    // The catches are what sell "assembling". They must disappear as it
    // resolves, or the finish feels hesitant instead of decisive.
    const pauses = segments.map((s) => s.pauseMs);
    for (let i = 1; i < pauses.length; i += 1) {
      expect(pauses[i]!).toBeLessThanOrEqual(pauses[i - 1]!);
    }
    expect(pauses[pauses.length - 1]).toBe(0);
    expect(pauses[0]).toBeGreaterThan(0);
  });

  it('escalates the haptics and never goes backwards', () => {
    const strength = segments.map((s) => RAMP_STYLES.indexOf(s.haptic));
    for (let i = 1; i < strength.length; i += 1) {
      expect(strength[i]!).toBeGreaterThanOrEqual(strength[i - 1]!);
    }
    expect(strength[0]).toBe(RAMP_STYLES.indexOf('soft'));
    expect(strength[strength.length - 1]).toBe(RAMP_STYLES.indexOf('heavy'));
  });

  it('takes long enough to feel built, but does not outstay its welcome', () => {
    // The old sweep was 1.5s and read as an animation playing. Too long and
    // the user is just waiting to tap Continue.
    const total = revealDurationMs(segments);
    expect(total).toBeGreaterThan(2800);
    expect(total).toBeLessThan(5000);
  });

  it('spends most of its time in the first half — that is where the work reads', () => {
    const firstHalf = segments
      .slice(0, 4)
      .reduce((sum, s) => sum + s.durationMs + s.pauseMs, 0);
    expect(firstHalf / revealDurationMs(segments)).toBeGreaterThan(0.5);
  });
});
