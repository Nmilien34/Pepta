// Chart geometry for the Progress frame's plots, as pure functions.
//
// WHY THIS FILE EXISTS. Three charts in design-lab/hub-new-screens.html shipped
// as shapes without their scales: the side-effect line had no value axis, no
// baseline and no dates; the eating bars had no scale and no target line; the
// shot-detail curve was the full Track chart squeezed into a sheet. A curve
// with no axis is not a smaller version of the design — it is a different and
// much weaker chart, because the reader cannot tell 2-of-5 from 4-of-5, or a
// day over target from a day under it.
//
// The math lives here rather than in the components because a `.ts` test can
// import it in node — `src/components/waterWave.ts` set that precedent. Every
// number below is read off the frame's inline <svg>, which draws each plot in a
// 320×124 viewBox:
//
//   plot band     x 0 … 270      (the remaining 50 is the value-scale gutter)
//   value scale   printed at x 276, the top gridline at y 8
//   baseline      y 104, a SOLID rule (the gridlines above it are dashed)
//   date axis     y 119, three ticks, the last one emphasised as "Today"
//
// Ratios, not pixels, so the same geometry survives being drawn at the card's
// real width on any device.

/** Top of the value band, as a fraction of the plot height: y=8 of 104.
 *  Without it the top gridline is flush with the card and its label clips. */
const TOP_INSET = 8 / 104;

export interface ChartPoint {
  x: number;
  y: number;
}

/** One horizontal rule and the number printed against it in the gutter. */
export interface ScaleLine {
  y: number;
  label: string;
}

/** One date on the bottom axis. `isNow` is the frame's emphasised last tick. */
export interface AxisTick {
  x: number;
  at: number;
  isNow: boolean;
}

/** Ticks across a time span: first, middle, last — the frame's three. */
function timeTicks(from: number, to: number, width: number): AxisTick[] {
  const span = to - from;
  if (span <= 0) return [];
  return [0, 0.5, 1].map((fraction) => ({
    x: width * fraction,
    at: from + span * fraction,
    isNow: fraction === 1,
  }));
}

/**
 * "Apr 4" — the frame's axis label. Local time, because these are real
 * timestamps rather than the date-only strings progressView.formatShortDate
 * deliberately reads in UTC.
 */
export function monthDay(ms: number): string {
  const at = new Date(ms);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(at);
  } catch {
    return at.toISOString().slice(5, 10);
  }
}

// ---------------------------------------------------------------------------
// Side effects — weekly severity, 0…5
// ---------------------------------------------------------------------------

export interface SeverityWeekPoint {
  startedAt: number;
  average: number;
}

export interface SeverityPlot {
  linePath: string;
  /** The same line closed to the baseline — the frame fills it at 16%. */
  areaPath: string;
  points: ChartPoint[];
  /** The latest week, drawn larger with a surface-coloured ring. */
  head: ChartPoint;
  gridlines: ScaleLine[];
  baselineY: number;
  /** The frame labels the floor "none", not "0": zero severity is no symptom,
   *  and a bare 0 in a column of severities reads as a missing value. */
  baselineLabel: string;
  /** x of each dose increase inside the window — the dashed verticals. */
  markers: number[];
  ticks: AxisTick[];
}

/**
 * The frame prints THREE gridlines — 5, 3, 1 — not one per severity step. Five
 * rules behind a five-point scale is a ladder; three is a scale you can read
 * the curve against.
 */
const SEVERITY_LINES = [5, 3, 1];
const SEVERITY_MAX = 5;

export function severityPlot(
  weeks: readonly SeverityWeekPoint[],
  doseIncreases: readonly number[],
  width: number,
  height: number,
): SeverityPlot | null {
  if (weeks.length < 2 || width <= 0 || height <= 0) return null;
  const first = weeks[0]!.startedAt;
  const last = weeks[weeks.length - 1]!.startedAt;
  const span = last - first;
  if (span <= 0) return null;

  const top = height * TOP_INSET;
  const baselineY = height;
  const x = (at: number) => ((at - first) / span) * width;
  const y = (value: number) =>
    baselineY - (Math.min(SEVERITY_MAX, Math.max(0, value)) / SEVERITY_MAX) * (baselineY - top);

  const points = weeks.map((week) => ({ x: x(week.startedAt), y: y(week.average) }));
  const linePath = `M${points.map((point) => `${point.x},${point.y}`).join(' L')}`;

  return {
    linePath,
    areaPath: `${linePath} L${width},${baselineY} L0,${baselineY} Z`,
    points,
    head: points[points.length - 1]!,
    gridlines: SEVERITY_LINES.map((value) => ({ y: y(value), label: String(value) })),
    baselineY,
    baselineLabel: 'none',
    markers: doseIncreases.filter((at) => at >= first && at <= last).map(x),
    ticks: timeTicks(first, last, width),
  };
}

// ---------------------------------------------------------------------------
// What you're eating — one bar per logged day, against a daily target
// ---------------------------------------------------------------------------

export interface DayBarInput {
  day: string;
  value: number;
  hit: boolean;
}

export interface DayBar {
  day: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hit: boolean;
}

export interface BarPlot {
  bars: DayBar[];
  gridlines: ScaleLine[];
  baselineY: number;
  baselineLabel: string;
  /** y of the dashed target rule, or null when no target is set. A bar chart
   *  of intake with no target line answers "how much" but never "enough?". */
  targetY: number | null;
  ticks: AxisTick[];
}

/** Pair the real maximum with a true zero on a round number, the way
 *  levelChart does — a scale that starts anywhere else exaggerates the bars. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/** "2k" over "2000": the gutter is 44pt wide and four digits do not fit. */
export function scaleLabel(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${thousands % 1 === 0 ? thousands : thousands.toFixed(1)}k`;
  }
  return String(Math.round(value));
}

/** ms for a `YYYY-MM-DD` day key, at local midnight. */
function dayKeyToTime(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).getTime();
}

const BAR_GAP_RATIO = 5.3 / 19.3; // frame: 14pt bars on a 19.3pt pitch

export function barPlot(
  input: readonly DayBarInput[],
  target: number | null,
  width: number,
  height: number,
): BarPlot | null {
  if (input.length === 0 || width <= 0 || height <= 0) return null;

  const top = height * TOP_INSET;
  const baselineY = height;
  const ceiling = niceCeiling(Math.max(target ?? 0, ...input.map((bar) => bar.value)));
  const y = (value: number) =>
    baselineY - (Math.max(0, value) / ceiling) * (baselineY - top);

  const pitch = width / input.length;
  const barWidth = pitch * (1 - BAR_GAP_RATIO);
  const bars = input.map((bar, index) => {
    const barTop = y(bar.value);
    return {
      day: bar.day,
      x: index * pitch,
      y: barTop,
      width: barWidth,
      // A logged day is never invisible: a 2pt stub still says "you logged
      // this and it was small", where a zero-height bar says nothing at all.
      height: Math.max(2, baselineY - barTop),
      hit: bar.hit,
    };
  });

  const first = dayKeyToTime(input[0]!.day);
  const lastDay = dayKeyToTime(input[input.length - 1]!.day);

  return {
    bars,
    // Two rules and the floor, exactly as the frame draws it: 2k, 1k, 0.
    gridlines: [ceiling, ceiling / 2].map((value) => ({ y: y(value), label: scaleLabel(value) })),
    baselineY,
    baselineLabel: '0',
    targetY: target != null && target > 0 ? y(target) : null,
    ticks: lastDay > first ? timeTicks(first, lastDay, width) : [],
  };
}

// ---------------------------------------------------------------------------
// Shot detail — the level across one dose's window
// ---------------------------------------------------------------------------

export interface CurveSample {
  datetime: string;
  level: number;
}

export interface WindowSparkline {
  linePath: string;
  areaPath: string;
  /** The shot itself: the frame rings the FIRST point, because that is the
   *  moment this sheet is about. There is no "now" in a window that closed. */
  head: ChartPoint;
  gridlines: number[];
  baselineY: number;
}

// The frame's sheet chart is a 296×104 box with no printed scale: two dashed
// rules at y 26 and 60, a solid floor at 94, and the curve inset 4pt each side.
// It is a shape, deliberately — the numbers for this window are already stated
// as text in the three stat tiles above it.
const SPARK_GRID = [26 / 104, 60 / 104];
const SPARK_FLOOR = 94 / 104;
const SPARK_PEAK = 18 / 104;
const SPARK_X_INSET = 4 / 296;

export function windowSparkline(
  curve: readonly CurveSample[],
  width: number,
  height: number,
): WindowSparkline | null {
  if (curve.length < 2 || width <= 0 || height <= 0) return null;

  const samples = curve
    .map((point) => ({ t: new Date(point.datetime).getTime(), level: point.level }))
    .filter((point) => Number.isFinite(point.t))
    .sort((left, right) => left.t - right.t);
  if (samples.length < 2) return null;

  const t0 = samples[0]!.t;
  const t1 = samples[samples.length - 1]!.t;
  const span = t1 - t0;
  if (span <= 0) return null;

  const inset = width * SPARK_X_INSET;
  const plotWidth = width - inset * 2;
  const baselineY = height * SPARK_FLOOR;
  const peakY = height * SPARK_PEAK;
  // From zero, always — the same rule levelChart states: height is
  // proportional to how much is in the system, not to the window's range.
  const max = Math.max(...samples.map((sample) => sample.level));
  const x = (t: number) => inset + ((t - t0) / span) * plotWidth;
  const y = (level: number) =>
    max <= 0 ? baselineY : baselineY - (Math.max(0, level) / max) * (baselineY - peakY);

  const points = samples.map((sample) => ({ x: x(sample.t), y: y(sample.level) }));
  const linePath = `M${points.map((point) => `${point.x},${point.y}`).join(' L')}`;

  return {
    linePath,
    areaPath: `${linePath} L${points[points.length - 1]!.x},${baselineY} L${points[0]!.x},${baselineY} Z`,
    head: points[0]!,
    gridlines: SPARK_GRID.map((ratio) => height * ratio),
    baselineY,
  };
}

// ---------------------------------------------------------------------------
// WEIGHT
//
// The weight card shipped as a chart-kit sparkline fed `points.map(p => p.value)`
// — every timestamp discarded. That is failure #1 from levelChart's audit,
// still live on a second chart: "Real data rendered as an unanchored shape."
// Two weigh-ins a month apart drew identically to two on consecutive days, and
// a gap where the user stopped weighing in was invisible.
//
// The frame specifies a real instrument, and its scale is the good idea: the
// plot FLOOR IS THE GOAL WEIGHT. 200 sits at the top inset, 165 (the goal) at
// the baseline, gridlines every 10 in between. So "how far down the card the
// line has travelled" is literally "how much of the journey is done" — and the
// line reaching the floor means arriving. A min→max autoscale cannot say that:
// it makes a 0.4 lb wobble fill the frame exactly like a 30 lb loss.
//
// Straight segments between real weigh-ins, never bezier — the same rule
// levelChart gives for a step function, for the same reason. We know the two
// endpoints; the curve between them is invented.

export interface WeightSample {
  t: number;
  value: number;
}

export interface WeightPlot {
  /** Solid path through real weigh-ins. */
  linePath: string;
  areaPath: string;
  /** Dashed path from the latest weigh-in to the goal, or null when unknown. */
  projectedPath: string | null;
  projectedAreaPath: string | null;
  /** One dot per real weigh-in — where data actually exists. */
  dots: ChartPoint[];
  /** The latest weigh-in: the emphasised "you are here" dot. */
  head: ChartPoint;
  /** x of the latest weigh-in, for the vertical Today rule. */
  todayX: number;
  gridlines: ScaleLine[];
  /** The goal line and its label, when a goal is set. */
  goal: { y: number; label: string } | null;
  baselineY: number;
  topY: number;
  plotWidth: number;
  ticks: AxisTick[];
}

const WEIGHT_PLOT_WIDTH = 270 / 320;
const WEIGHT_TOP = 8 / 124;
const WEIGHT_BASELINE = 104 / 124;
/** The frame rules four values; a fifth would crowd a 132pt plot. */
const WEIGHT_GRIDLINES = 4;

/** Round a weight span up to a step a person would print on an axis. */
export function weightStep(span: number): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50]) {
    if (span / step <= WEIGHT_GRIDLINES) return step;
  }
  return 100;
}

export function weightPlot(
  samples: readonly WeightSample[],
  goalValue: number | null,
  goalAt: number | null,
  width: number,
  height: number,
): WeightPlot | null {
  const points = samples
    .filter((sample) => Number.isFinite(sample.t) && Number.isFinite(sample.value))
    .slice()
    .sort((left, right) => left.t - right.t);
  if (points.length === 0 || width <= 0 || height <= 0) return null;

  const plotWidth = width * WEIGHT_PLOT_WIDTH;
  const topY = height * WEIGHT_TOP;
  const baselineY = height * WEIGHT_BASELINE;

  const values = points.map((point) => point.value);
  const highest = Math.max(...values);
  const lowest = Math.min(...values, goalValue ?? Infinity);

  // The floor is the goal when there is one. Without a goal the floor is the
  // lowest reading, padded, so the line still has somewhere to go.
  const step = weightStep(Math.max(1, highest - lowest));
  const top = Math.ceil(highest / step) * step;
  const floor = goalValue ?? Math.min(lowest, top - step * WEIGHT_GRIDLINES);
  const range = top - floor;
  if (!(range > 0)) return null;

  const t0 = points[0]!.t;
  const latest = points[points.length - 1]!;
  // The x axis runs from the first weigh-in to the goal date, so "today" lands
  // at its true position along the journey rather than at the right edge.
  const tEnd = goalAt != null && goalAt > latest.t ? goalAt : latest.t;
  const span = tEnd - t0;

  // A single weigh-in, or several on one day, has no span to scale: pin it to
  // the left rather than dividing by zero or stretching one reading across the
  // whole card as though it were a trend.
  const x = (t: number) => (span > 0 ? ((t - t0) / span) * plotWidth : 0);
  const y = (value: number) =>
    baselineY - ((Math.max(floor, Math.min(top, value)) - floor) / range) * (baselineY - topY);

  const dots = points.map((point) => ({ x: x(point.t), y: y(point.value) }));
  const head = dots[dots.length - 1]!;
  const linePath = `M${dots.map((point) => `${point.x},${point.y}`).join(' L')}`;

  const gridlines: ScaleLine[] = [];
  for (let value = top; value > floor; value -= step) {
    gridlines.push({ y: y(value), label: String(Math.round(value)) });
  }

  const hasProjection = goalValue != null && goalAt != null && goalAt > latest.t;

  return {
    linePath,
    areaPath: `${linePath} L${head.x},${baselineY} L${dots[0]!.x},${baselineY} Z`,
    projectedPath: hasProjection ? `M${head.x},${head.y} L${plotWidth},${y(goalValue)}` : null,
    projectedAreaPath: hasProjection
      ? `M${head.x},${head.y} L${plotWidth},${y(goalValue)} L${head.x},${baselineY} Z`
      : null,
    dots,
    head,
    todayX: head.x,
    gridlines,
    goal: goalValue != null ? { y: y(goalValue), label: String(Math.round(goalValue)) } : null,
    baselineY,
    topY,
    plotWidth,
    ticks: span > 0 ? timeTicks(t0, tEnd, plotWidth) : [],
  };
}
