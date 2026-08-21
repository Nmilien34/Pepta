import { describe, expect, it } from 'vitest';
import { levelOffset, wavePath, WAVE_PERIOD_MS, WAVE_PERIOD_SLOW_MS } from './waterWave';

describe('wavePath', () => {
  it('spans at least twice the glass, so the loop has no seam', () => {
    // The path is animated from x=0 to x=-width. If it were only `width` wide,
    // the right-hand half of the glass would be empty at the moment it snaps.
    const d = wavePath({ width: 96, amplitude: 3, wavelength: 48, depth: 120 });
    const endX = Number(/L([\d.]+) 120/.exec(d)?.[1]);

    expect(endX).toBeGreaterThanOrEqual(192);
  });

  it('ends on a whole cycle, so the start and end heights match', () => {
    // A partial cycle leaves the far end at a different height from x=0, and
    // the seam comes back even though the path is wide enough.
    for (const wavelength of [20, 33, 48, 50, 64]) {
      const d = wavePath({ width: 96, amplitude: 3, wavelength, depth: 120 });
      const endX = Number(/L([\d.]+) 120/.exec(d)?.[1]);

      expect(endX % wavelength).toBeCloseTo(0, 5);
    }
  });

  it('is a closed shape with a body, not just a line', () => {
    const d = wavePath({ width: 96, amplitude: 3, wavelength: 48, depth: 120 });

    expect(d.startsWith('M0 3')).toBe(true);
    expect(d).toContain('L0 120');
    expect(d.endsWith('Z')).toBe(true);
  });

  it('draws the surface with curves, never facets', () => {
    // Sampled polylines show facets on the meniscus — the one edge the eye
    // actually studies. Quadratics are the whole point of this function.
    const d = wavePath({ width: 96, amplitude: 3, wavelength: 48, depth: 120 });

    expect(d).toContain('q');
    expect(d).not.toMatch(/L[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L/);
  });

  it('puts peak and trough either side of the baseline', () => {
    const d = wavePath({ width: 96, amplitude: 4, wavelength: 48, depth: 120 });

    // First quarter rises by the amplitude, the next falls back by it.
    expect(d).toContain('q12 -4 24 0');
    expect(d).toContain('q12 4 24 0');
  });
});

describe('levelOffset', () => {
  it('sits on the base when empty and at the rim when full', () => {
    const interior = 103;

    expect(levelOffset(0, interior)).toBe(103);
    expect(levelOffset(1, interior)).toBe(0);
  });

  it('is linear in between', () => {
    expect(levelOffset(0.5, 100)).toBe(50);
    expect(levelOffset(0.25, 100)).toBe(75);
  });

  it('clamps, so an over-target day cannot push water through the rim', () => {
    // 140oz against a 100oz target is a real Tuesday, and the glass has to
    // survive it without the wave floating above the glass.
    expect(levelOffset(1.4, 100)).toBe(0);
    expect(levelOffset(-0.2, 100)).toBe(100);
  });
});

describe('wave timing', () => {
  it('keeps the two waves out of phase-lock', () => {
    // Equal or integer-multiple periods make the pair visibly repeat, which is
    // the thing two waves exist to avoid.
    expect(WAVE_PERIOD_SLOW_MS).not.toBe(WAVE_PERIOD_MS);
    expect(WAVE_PERIOD_SLOW_MS % WAVE_PERIOD_MS).not.toBe(0);
  });

  it('moves at the pace of water, not of a spinner', () => {
    expect(WAVE_PERIOD_MS).toBeGreaterThan(2500);
  });
});
