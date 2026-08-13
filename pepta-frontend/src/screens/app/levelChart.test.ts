import { describe, expect, it } from 'vitest';
import { buildLevelChartModel, shortTick, type LevelPoint } from './levelChart';

const W = 300;
const H = 100;
const NOW = new Date('2026-08-13T12:00:00.000Z');

/** A ±7 day curve sampled every 6h, exactly like computeMedicationLevel's. */
function curve(levelAt: (hoursFromStart: number) => number): LevelPoint[] {
  const start = new Date('2026-08-06T12:00:00.000Z').getTime();
  return Array.from({ length: 57 }, (_, i) => ({
    datetime: new Date(start + i * 6 * 3600_000).toISOString(),
    level: levelAt(i * 6),
  }));
}

describe('the y scale always starts at zero', () => {
  // Bug 3: without a zero baseline the library scaled min→max, so a tail
  // decaying 0.0079 → 0.0011 filled the frame and read as a collapse. The same
  // picture appeared whether the user held 8 mg or 0.008 mg.
  it('draws a near-empty system near the floor, not filling the frame', () => {
    const model = buildLevelChartModel({
      curve: curve((h) => 0.008 * 0.5 ** (h / 120)),
      now: NOW,
      width: W,
      height: H,
    })!;
    // Peak is 0.008; the scale tops out at a nice ceiling ≥ that, never at the
    // data's own max, so the line cannot span the full height by construction.
    expect(model.yMax).toBeGreaterThanOrEqual(0.008);
    expect(model.now!.y).toBeGreaterThan(H * 0.4);
  });

  it('scales proportionally — 10x the dose is 10x the height', () => {
    const small = buildLevelChartModel({ curve: curve(() => 0.1), now: NOW, width: W, height: H })!;
    const big = buildLevelChartModel({ curve: curve(() => 1.0), now: NOW, width: W, height: H })!;
    // Same shape, but the ceilings differ by 10, so a flat 0.1 and a flat 1.0
    // do NOT render identically the way a min→max scale would make them.
    expect(big.yMax / small.yMax).toBeCloseTo(10, 5);
  });

  it('never puts the baseline anywhere but the bottom', () => {
    const model = buildLevelChartModel({ curve: curve(() => 0.5), now: NOW, width: W, height: H })!;
    expect(model.baselineY).toBe(H);
  });
});

describe('the marker sits at NOW, not at the end of the curve', () => {
  // Bug 2: showLastDot marked the final point — six days into the future on a
  // real account — while the caption beside it read "Current".
  it('places the marker mid-curve for a curve that spans now', () => {
    const model = buildLevelChartModel({ curve: curve(() => 1), now: NOW, width: W, height: H })!;
    expect(model.now!.x).toBeGreaterThan(W * 0.3);
    expect(model.now!.x).toBeLessThan(W * 0.7);
  });

  it('reports the level AT now, not the final projected level', () => {
    // Monotonic decay: the last point is far below the value at now.
    const decaying = curve((h) => 1 * 0.5 ** (h / 120));
    const model = buildLevelChartModel({ curve: decaying, now: NOW, width: W, height: H })!;
    const last = decaying[decaying.length - 1]!.level;
    expect(model.now!.level).toBeGreaterThan(last);
    expect(model.now!.level).toBeCloseTo(decaying[28]!.level, 3);
  });

  it('splits the path at now, so past and future can be drawn differently', () => {
    const model = buildLevelChartModel({ curve: curve(() => 1), now: NOW, width: W, height: H })!;
    expect(model.pastPath.startsWith('M0,')).toBe(true);
    // Both paths meet exactly at the now marker — no gap, no overlap.
    const joint = `${model.now!.x},${model.now!.y}`;
    expect(model.pastPath.endsWith(joint)).toBe(true);
    expect(model.futurePath.startsWith(`M${joint}`)).toBe(true);
  });

  it('clamps rather than inventing when now falls outside the curve', () => {
    const model = buildLevelChartModel({
      curve: curve(() => 1),
      now: new Date('2027-01-01T00:00:00.000Z'),
      width: W,
      height: H,
    })!;
    expect(model.now!.x).toBeLessThanOrEqual(W);
  });
});

describe('the path is the samples, not a smoothed guess', () => {
  // Bug 4: bezier rounded the engine's instantaneous dose into a gentle rise,
  // implying an absorption phase the model never computes.
  it('uses straight segments between real samples', () => {
    const model = buildLevelChartModel({ curve: curve(() => 1), now: NOW, width: W, height: H })!;
    expect(model.pastPath).not.toMatch(/[CQSTA]/); // no bezier/arc commands
    expect(model.futurePath).not.toMatch(/[CQSTA]/);
  });

  it('keeps a dose step vertical', () => {
    // Two adjacent samples either side of a jump must map to two x-distinct
    // points at very different y — a curve command would round that off.
    const stepped = curve((h) => (h < 72 ? 0.1 : 1.0));
    const model = buildLevelChartModel({ curve: stepped, now: NOW, width: W, height: H })!;
    expect(model.pastPath).toMatch(/^M[\d.,\s L]+$/);
    expect(model.yMax).toBeGreaterThanOrEqual(1.0);
  });
});

describe('time is on the x axis', () => {
  // Bug 1: every point's datetime was discarded before it reached the chart.
  it('spaces points by real elapsed time', () => {
    const model = buildLevelChartModel({ curve: curve(() => 1), now: NOW, width: W, height: H })!;
    const xs = model.pastPath.slice(1).split(' L').map((p) => Number(p.split(',')[0]));
    const gaps = xs.slice(1).map((v, i) => v - xs[i]!);
    // Even sampling in → even spacing out, and strictly increasing.
    expect(Math.min(...gaps.slice(0, -1))).toBeGreaterThan(0);
    expect(Math.max(...gaps.slice(0, -1)) - Math.min(...gaps.slice(0, -1))).toBeLessThan(0.01);
  });

  it('always marks now among the time ticks', () => {
    const model = buildLevelChartModel({ curve: curve(() => 1), now: NOW, width: W, height: H })!;
    expect(model.timeTicks.filter((t) => t.isNow)).toHaveLength(1);
    // Ticks read left to right.
    const xs = model.timeTicks.map((t) => t.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('formats a tick compactly', () => {
    expect(shortTick(new Date('2026-08-13T12:00:00.000Z'))).toMatch(/^\d{1,2}\/\d{1,2}$/);
  });
});

describe('dose markers explain the rises', () => {
  it('places a marker for each dose inside the window, flagging future ones', () => {
    const model = buildLevelChartModel({
      curve: curve(() => 1),
      now: NOW,
      width: W,
      height: H,
      doses: [
        { datetime: '2026-08-10T12:00:00.000Z' },
        { datetime: '2026-08-17T12:00:00.000Z' },
        { datetime: '2026-01-01T00:00:00.000Z' }, // outside the window
      ],
    })!;
    expect(model.doseMarkers).toHaveLength(2);
    expect(model.doseMarkers.map((m) => m.isFuture)).toEqual([false, true]);
  });
});

describe('degenerate input returns null instead of a fake chart', () => {
  it.each([
    ['empty curve', [] as LevelPoint[], W, H],
    ['single point', curve(() => 1).slice(0, 1), W, H],
    ['zero width', curve(() => 1), 0, H],
    ['zero height', curve(() => 1), W, 0],
  ])('%s', (_label, c, w, h) => {
    expect(buildLevelChartModel({ curve: c, now: NOW, width: w, height: h })).toBeNull();
  });

  it('survives an all-zero curve without dividing by zero', () => {
    const model = buildLevelChartModel({ curve: curve(() => 0), now: NOW, width: W, height: H })!;
    expect(model.yMax).toBeGreaterThan(0);
    expect(Number.isFinite(model.now!.y)).toBe(true);
  });
});
