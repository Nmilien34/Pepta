import { describe, expect, it } from 'vitest';
import { surfaceRadius } from './waterCupGeometry';

// The meniscus is the thing that makes the glass read as liquid rather than a
// bar chart, and it only works if its width matches the glass at that height.
describe('surfaceRadius', () => {
  it('matches the glass wall at the rim and at the foot', () => {
    // Path is M24 13 … L72 13, so the rim spans 24..72 — half-width 24.
    expect(surfaceRadius(13)).toBeCloseTo(24, 5);
    // …and narrows to 33..63 by y=108 — half-width 15.
    expect(surfaceRadius(108)).toBeCloseTo(15, 5);
  });

  it('reproduces the design\'s hand-placed value at the halfway mark', () => {
    expect(surfaceRadius(62)).toBeCloseTo(19.36, 2);
  });

  it('narrows monotonically going down the glass', () => {
    let prev = Infinity;
    for (let y = 13; y <= 108; y += 5) {
      const r = surfaceRadius(y);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });

  it('clamps past the foot instead of inverting the glass', () => {
    // Below y=108 the path curves into the base; the radius must not keep
    // shrinking through zero and flip the ellipse inside out.
    expect(surfaceRadius(130)).toBe(15);
    expect(surfaceRadius(-20)).toBe(24);
  });
});
