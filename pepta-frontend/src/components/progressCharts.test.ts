// Progress chart geometry, against design-lab/hub-new-screens.html.
//
// These are the rules that make each plot READABLE rather than decorative, so
// they are pinned as numbers rather than eyeballed in a screenshot: the frame's
// three severity gridlines, the floor labelled "none", the target rule on the
// eating bars, and the sparkline's ringed FIRST point.

import { describe, expect, it } from 'vitest';
import {
  barPlot,
  monthDay,
  niceCeiling,
  scaleLabel,
  severityPlot,
  weightPlot,
  weightStep,
  windowSparkline,
} from './progressCharts';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const T0 = Date.UTC(2026, 3, 6); // a Monday

const weeks = [
  { startedAt: T0, average: 3.4 },
  { startedAt: T0 + WEEK, average: 2.8 },
  { startedAt: T0 + 2 * WEEK, average: 2.1 },
  { startedAt: T0 + 3 * WEEK, average: 1.5 },
];

describe('severityPlot', () => {
  it('needs two weeks and a real width — one point is not a trend', () => {
    expect(severityPlot(weeks.slice(0, 1), [], 240, 132)).toBeNull();
    expect(severityPlot(weeks, [], 0, 132)).toBeNull();
    // Every week bucketed to the same instant: no span, so no x scale.
    expect(severityPlot([weeks[0]!, { ...weeks[0]! }], [], 240, 132)).toBeNull();
  });

  it('is ALWAYS scaled 0 to 5, never to the data', () => {
    // Migrated from sideEffectTrend's severityChartModel, which this replaced.
    // It is the invariant most worth keeping and the least obvious: a min-max
    // scale would be the natural "improvement" and would make a mild fortnight
    // fill the frame exactly like a severe one. The whole question this chart
    // answers is "is this getting better", which only works if the ceiling
    // holds still.
    const mild = severityPlot(
      [
        { startedAt: T0, average: 1.2 },
        { startedAt: T0 + WEEK, average: 1.0 },
      ],
      [],
      240,
      132,
    )!;

    // Derive the plot's top from the module's own 5-gridline rather than
    // restating its inset here — the assertion is about the SCALE, and should
    // not break when the inset is tuned.
    const top = mild.gridlines.find((g) => g.label === '5')!.y;
    const range = mild.baselineY - top;

    // 1.2 of 5 sits near the FLOOR, not at the top of the plot.
    expect(mild.points[0]!.y).toBeCloseTo(mild.baselineY - (1.2 / 5) * range, 1);
    expect(mild.points[0]!.y).toBeGreaterThan(mild.baselineY * 0.7);
  });

  it('clamps out-of-range averages instead of drawing off the plot', () => {
    // Severity is 1-5 by construction, but a bad aggregate upstream must not
    // paint outside the card.
    const wild = severityPlot(
      [
        { startedAt: T0, average: 9 },
        { startedAt: T0 + WEEK, average: -3 },
      ],
      [],
      240,
      132,
    )!;

    const ceiling = wild.gridlines.find((g) => g.label === '5')!.y;
    expect(wild.points[0]!.y).toBeCloseTo(ceiling, 1);
    expect(wild.points[1]!.y).toBeCloseTo(wild.baselineY, 1);
  });

  it('rules 5, 3 and 1 — the frame draws three gridlines, not five', () => {
    // Five rules behind a five-point scale is a ladder you read the numbers
    // off; three is a scale you read the CURVE against.
    const plot = severityPlot(weeks, [], 240, 132)!;
    expect(plot.gridlines.map((line) => line.label)).toEqual(['5', '3', '1']);
  });

  it('labels the floor "none", not "0"', () => {
    // Zero severity is the absence of a symptom. A bare 0 in a column of
    // severities reads as a value we failed to record.
    expect(severityPlot(weeks, [], 240, 132)!.baselineLabel).toBe('none');
  });

  it('keeps the top gridline clear of the card edge', () => {
    // The frame puts severity 5 at y=8 of 104, so its label has somewhere to
    // sit. Flush to zero it clips against the card's own padding.
    const plot = severityPlot(weeks, [], 240, 132)!;
    const top = plot.gridlines.find((line) => line.label === '5')!;
    expect(top.y).toBeGreaterThan(0);
    expect(top.y).toBeCloseTo(132 * (8 / 104), 5);
  });

  it('spans the full width and closes the area to the floor', () => {
    const plot = severityPlot(weeks, [], 240, 132)!;
    expect(plot.points[0]!.x).toBe(0);
    expect(plot.points[plot.points.length - 1]!.x).toBe(240);
    expect(plot.baselineY).toBe(132);
    // The fill is the line plus a return along the baseline — never its own
    // shape, or it drifts away from the stroke it is supposed to sit under.
    expect(plot.areaPath.startsWith(plot.linePath)).toBe(true);
    expect(plot.areaPath.endsWith(`L${240},${132} L0,${132} Z`)).toBe(true);
  });

  it('rings the latest week — it is the number in the readout above', () => {
    const plot = severityPlot(weeks, [], 240, 132)!;
    expect(plot.head).toEqual(plot.points[plot.points.length - 1]);
    // Milder weeks sit lower on the page: severity is measured up from zero.
    expect(plot.points[0]!.y).toBeLessThan(plot.head.y);
  });

  it('drops dose increases that fall outside the plotted weeks', () => {
    // A marker at x<0 or x>width is drawn on top of the card, next to a rise
    // it does not explain.
    const plot = severityPlot(weeks, [T0 - WEEK, T0 + WEEK, T0 + 99 * WEEK], 240, 132)!;
    expect(plot.markers).toHaveLength(1);
    expect(plot.markers[0]).toBeCloseTo(80, 5); // 1 of 3 weeks across 240
  });

  it('gives three date ticks, the last one flagged as the current week', () => {
    const plot = severityPlot(weeks, [], 240, 132)!;
    expect(plot.ticks.map((tick) => tick.x)).toEqual([0, 120, 240]);
    expect(plot.ticks.map((tick) => tick.isNow)).toEqual([false, false, true]);
  });
});

describe('niceCeiling / scaleLabel', () => {
  it('rounds up to a number a person would print on an axis', () => {
    expect(niceCeiling(1840)).toBe(2000);
    expect(niceCeiling(96)).toBe(100);
    expect(niceCeiling(130)).toBe(150);
    expect(niceCeiling(0)).toBe(1); // never a zero-height scale
  });

  it('abbreviates thousands — four digits do not fit a 34pt gutter', () => {
    expect(scaleLabel(2000)).toBe('2k');
    expect(scaleLabel(1500)).toBe('1.5k');
    expect(scaleLabel(150)).toBe('150');
  });
});

describe('barPlot', () => {
  const bars = [
    { day: '2026-04-06', value: 96, hit: false },
    { day: '2026-04-07', value: 128, hit: true },
    { day: '2026-04-08', value: 64, hit: false },
    { day: '2026-04-09', value: 121, hit: true },
  ];

  it('rules the daily target across the plot', () => {
    // THE POINT OF THE CARD. Bars alone say how much they ate; only the rule
    // says whether it was enough. The shipped strip had no target line.
    const plot = barPlot(bars, 120, 240, 132)!;
    expect(plot.targetY).not.toBeNull();
    // 120 of a 150 ceiling sits above the 96g bar and below the 128g one.
    const under = plot.bars.find((bar) => bar.day === '2026-04-06')!;
    const over = plot.bars.find((bar) => bar.day === '2026-04-07')!;
    expect(under.y).toBeGreaterThan(plot.targetY!);
    expect(over.y).toBeLessThan(plot.targetY!);
  });

  it('omits the target rule when no target is set', () => {
    // A dashed line with nothing behind it is a number we invented.
    expect(barPlot(bars, null, 240, 132)!.targetY).toBeNull();
  });

  it('lifts the ceiling above the target, not just above the bars', () => {
    // Otherwise a week spent under target puts the rule off the top of the
    // chart, which is exactly the week it most needs to be visible.
    const plot = barPlot([{ day: '2026-04-06', value: 40, hit: false }], 200, 240, 132)!;
    expect(plot.targetY!).toBeGreaterThanOrEqual(0);
    expect(plot.gridlines[0]!.label).toBe('200');
  });

  it('scales from a true zero', () => {
    const plot = barPlot(bars, 120, 240, 132)!;
    expect(plot.baselineY).toBe(132);
    expect(plot.baselineLabel).toBe('0');
    // Height proportional to the value: 128 is twice 64.
    const big = plot.bars.find((bar) => bar.day === '2026-04-07')!;
    const small = plot.bars.find((bar) => bar.day === '2026-04-08')!;
    expect(big.height / small.height).toBeCloseTo(2, 1);
  });

  it('never draws a logged day as nothing at all', () => {
    // A zero-height bar is indistinguishable from a day with no logs, and the
    // card's whole premise is that it only plots days they logged.
    const plot = barPlot([...bars, { day: '2026-04-10', value: 0, hit: false }], 120, 240, 132)!;
    expect(plot.bars[plot.bars.length - 1]!.height).toBeGreaterThan(0);
  });

  it('leaves a gap between bars and stays inside the plot', () => {
    const plot = barPlot(bars, 120, 240, 132)!;
    const [first, second] = plot.bars;
    expect(first!.x + first!.width).toBeLessThan(second!.x);
    const last = plot.bars[plot.bars.length - 1]!;
    expect(last.x + last.width).toBeLessThanOrEqual(240);
  });

  it('dates the axis from the day keys', () => {
    const plot = barPlot(bars, 120, 240, 132)!;
    expect(plot.ticks).toHaveLength(3);
    expect(plot.ticks[2]!.isNow).toBe(true);
  });

  it('has no axis to draw for a single logged day', () => {
    // One day spans no time; three ticks across it would all read the same.
    expect(barPlot([bars[0]!], 120, 240, 132)!.ticks).toEqual([]);
  });
});

describe('windowSparkline', () => {
  const curve = [
    { datetime: '2026-08-06T09:00:00Z', level: 4.8 },
    { datetime: '2026-08-08T09:00:00Z', level: 4.1 },
    { datetime: '2026-08-11T09:00:00Z', level: 3.0 },
    { datetime: '2026-08-13T09:00:00Z', level: 2.4 },
  ];

  it('rings the FIRST point — the shot, not "now"', () => {
    // The window is closed. Marking today's position inside it is what the
    // full Track chart did here, and it reported a stale level as current.
    const plot = windowSparkline(curve, 296, 104)!;
    expect(plot.head.x).toBeCloseTo(4, 5);
    expect(plot.head.y).toBeLessThan(plot.gridlines[0]!);
  });

  it("sits on the frame's geometry: floor at 94, rules at 26 and 60", () => {
    const plot = windowSparkline(curve, 296, 104)!;
    expect(plot.baselineY).toBeCloseTo(94, 5);
    expect(plot.gridlines.map((y) => Math.round(y))).toEqual([26, 60]);
  });

  it("measures height from zero, not from the window's own range", () => {
    // Half the level must draw at half the height, or a window that never
    // dropped far looks like a cliff.
    const flat = windowSparkline(
      [
        { datetime: '2026-08-06T09:00:00Z', level: 4 },
        { datetime: '2026-08-13T09:00:00Z', level: 2 },
      ],
      296,
      104,
    )!;
    const top = flat.head.y;
    const end = 94 - (94 - top) / 2;
    expect(flat.linePath.endsWith(`,${end}`)).toBe(true);
  });

  it('sorts samples and ignores unparseable ones', () => {
    const plot = windowSparkline(
      [
        { datetime: '2026-08-13T09:00:00Z', level: 2.4 },
        { datetime: 'not a date', level: 99 },
        { datetime: '2026-08-06T09:00:00Z', level: 4.8 },
      ],
      296,
      104,
    )!;
    // Highest level first: the sort ran, and the junk row did not set the max.
    expect(plot.head.y).toBeLessThan(plot.baselineY / 2);
  });

  it('needs two real samples', () => {
    expect(windowSparkline(curve.slice(0, 1), 296, 104)).toBeNull();
    expect(windowSparkline(curve, 0, 104)).toBeNull();
  });
});

describe('monthDay', () => {
  it("is the frame's axis label", () => {
    expect(monthDay(new Date(2026, 3, 4, 12).getTime())).toBe('Apr 4');
  });

  it('returns empty rather than "Invalid Date" on the axis', () => {
    expect(monthDay(Number.NaN)).toBe('');
  });
});

describe('weightPlot — time is real', () => {
  // The defect this replaces: TrendLineChart got `points.map(p => p.value)`
  // and spaced them evenly by index. A month-long gap drew exactly like an
  // overnight one, which is the same failure levelChart's audit calls
  // "real data rendered as an unanchored shape".
  const DAY = 86_400_000;
  const t0 = Date.UTC(2026, 5, 1);
  const W = 320;
  const H = 124;

  it('places a point by its DATE, not its index', () => {
    // Three weigh-ins: day 0, day 1, day 30. Index spacing would put the
    // middle one at the halfway mark; real time puts it near the start.
    const plot = weightPlot(
      [
        { t: t0, value: 200 },
        { t: t0 + DAY, value: 199 },
        { t: t0 + 30 * DAY, value: 190 },
      ],
      null,
      null,
      W,
      H,
    )!;

    const [first, middle, last] = plot.dots;
    const fraction = (middle!.x - first!.x) / (last!.x - first!.x);
    expect(fraction).toBeCloseTo(1 / 30, 3);
    // The index-spaced version put it at 0.5. Guard the regression directly.
    expect(fraction).toBeLessThan(0.1);
  });

  it('leaves a visible gap where the user stopped weighing in', () => {
    const steady = weightPlot(
      [0, 1, 2, 3].map((d) => ({ t: t0 + d * DAY, value: 200 - d })),
      null,
      null,
      W,
      H,
    )!;
    const gapped = weightPlot(
      [
        { t: t0, value: 200 },
        { t: t0 + DAY, value: 199 },
        { t: t0 + 40 * DAY, value: 198 },
        { t: t0 + 41 * DAY, value: 197 },
      ],
      null,
      null,
      W,
      H,
    )!;

    const gaps = (plot: { dots: { x: number }[] }) =>
      plot.dots.slice(1).map((dot, i) => dot.x - plot.dots[i]!.x);

    // The property is WITHIN a series, not across two that both stretch to the
    // same width: index spacing makes every gap identical no matter what the
    // dates say. Genuinely even data does have a uniform pitch...
    const even = gaps(steady);
    expect(Math.max(...even) - Math.min(...even)).toBeCloseTo(0, 5);

    // ...while the 39-day hole must dominate the two single-day steps beside
    // it. Under the old index spacing this ratio was exactly 1.
    const uneven = gaps(gapped);
    expect(Math.max(...uneven) / Math.min(...uneven)).toBeGreaterThan(30);
  });

  it('puts the floor at the GOAL, so travel down the card is progress', () => {
    const plot = weightPlot(
      [
        { t: t0, value: 200 },
        { t: t0 + DAY, value: 165 },
      ],
      165,
      t0 + 60 * DAY,
      W,
      H,
    )!;

    // Reaching the goal means reaching the baseline.
    expect(plot.dots[1]!.y).toBeCloseTo(plot.baselineY, 5);
    expect(plot.goal!.y).toBeCloseTo(plot.baselineY, 5);
  });

  it('does not let a tiny wobble fill the frame', () => {
    // The autoscale failure in the other direction: min→max would draw
    // 200.0 → 199.6 as a cliff from top to bottom.
    const plot = weightPlot(
      [
        { t: t0, value: 200 },
        { t: t0 + DAY, value: 199.6 },
      ],
      null,
      null,
      W,
      H,
    )!;

    const travelled = Math.abs(plot.dots[1]!.y - plot.dots[0]!.y);
    expect(travelled).toBeLessThan((plot.baselineY - plot.topY) * 0.25);
  });

  it('survives a single weigh-in without dividing by zero', () => {
    // The state every new user is in, and the one that was on screen.
    const plot = weightPlot([{ t: t0, value: 198 }], null, null, W, H)!;

    expect(plot.dots).toHaveLength(1);
    expect(Number.isFinite(plot.dots[0]!.x)).toBe(true);
    expect(Number.isFinite(plot.dots[0]!.y)).toBe(true);
    expect(plot.ticks).toEqual([]);
    expect(plot.projectedPath).toBeNull();
  });

  it('projects to the goal date, and only when there is one ahead', () => {
    const withGoal = weightPlot(
      [{ t: t0, value: 200 }],
      170,
      t0 + 90 * DAY,
      W,
      H,
    )!;
    expect(withGoal.projectedPath).toContain(`L${withGoal.plotWidth},`);

    // A goal date in the past is not a projection.
    const past = weightPlot([{ t: t0, value: 200 }], 170, t0 - DAY, W, H)!;
    expect(past.projectedPath).toBeNull();
  });

  it('draws one dot per real weigh-in', () => {
    // So the chart shows where data EXISTS, not a continuous invention.
    const plot = weightPlot(
      [0, 5, 19].map((d) => ({ t: t0 + d * DAY, value: 200 - d })),
      null,
      null,
      W,
      H,
    )!;

    expect(plot.dots).toHaveLength(3);
    expect(plot.head).toEqual(plot.dots[2]);
  });

  it('sorts unsorted input rather than drawing a zigzag', () => {
    const plot = weightPlot(
      [
        { t: t0 + 2 * DAY, value: 198 },
        { t: t0, value: 200 },
        { t: t0 + DAY, value: 199 },
      ],
      null,
      null,
      W,
      H,
    )!;

    expect(plot.dots.map((d) => Math.round(d.x))).toEqual(
      [...plot.dots.map((d) => Math.round(d.x))].sort((a, b) => a - b),
    );
  });

  it('picks an axis step a person would print', () => {
    expect(weightStep(3)).toBe(1);
    expect(weightStep(35)).toBe(10);
    expect(weightStep(9)).toBe(5);
  });
});
