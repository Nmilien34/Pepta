// Geometry for the medication-level chart. Pure → unit-testable, and the single
// place the chart's honesty is enforced.
//
// WHAT WAS WRONG WITH THE OLD CHART (2026-08-13 audit, verified against a real
// production account whose curve is 57 points spanning Aug 6 → Aug 20):
//
//  1. TIME WAS THROWN AWAY. TrendLineChart received `curve.map(p => p.level)` —
//     every point's `datetime` discarded — then disabled labels, both axes and
//     all gridlines. Real data rendered as an unanchored shape.
//
//  2. THE EMPHASISED DOT WAS SIX DAYS IN THE FUTURE. `showLastDot` marks the
//     LAST curve point, but the curve runs ±7 days around now, so the dot sat
//     on a projection (0.0011 on that account) while the caption beside it read
//     "Current 0.0027". The dot reads as "you are here"; it was not.
//
//  3. NO ZERO BASELINE. Without `fromZero` the library scaled min→max, so a
//     tail decaying 0.0079 → 0.0011 filled the full height and looked like a
//     collapse. The same picture appeared whether you held 8 mg or 0.008 mg.
//
//  4. BEZIER SMOOTHED A STEP FUNCTION. The engine models instant absorption —
//     a dose is a vertical jump. Smoothing rounded it into a gentle rise,
//     claiming gradual absorption the model never computed.
//
// This module fixes all four by construction: y always starts at zero, x is
// real elapsed time, the split at `now` is explicit, and the path is a straight
// polyline through the actual samples with no interpolation invented between
// them.

export interface LevelPoint {
  datetime: string;
  level: number;
}

export interface LevelChartInput {
  curve: readonly LevelPoint[];
  now: Date;
  width: number;
  height: number;
  /** Doses actually logged — drawn as markers so each rise is explained. */
  doses?: readonly { datetime: string }[];
}

export interface LevelChartModel {
  /** Polyline through samples at or before `now` — computed from real doses. */
  pastPath: string;
  /** Polyline from `now` onward — projected from the schedule. */
  futurePath: string;
  pastArea: string;
  futureArea: string;
  /** Where "now" sits. null when the curve does not span it. */
  now: { x: number; y: number; level: number } | null;
  /** y for the 0 line, and the horizontal gridlines above it. */
  baselineY: number;
  gridlines: { y: number; value: number }[];
  /** Ticks on the time axis, evenly spaced across the real span. */
  timeTicks: { x: number; at: Date; isNow: boolean }[];
  doseMarkers: { x: number; y: number; isFuture: boolean }[];
  /** Top of the y scale. Always ≥ the curve max, and always paired with 0. */
  yMax: number;
}

/** Chart-kit's default picks a "nice" max off the data range; we always pair
 *  the real maximum with a true zero, so height is proportional to dose. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

export function buildLevelChartModel({
  curve,
  now,
  width,
  height,
  doses = [],
}: LevelChartInput): LevelChartModel | null {
  if (curve.length < 2 || width <= 0 || height <= 0) return null;

  const points = curve
    .map((point) => ({ t: new Date(point.datetime).getTime(), level: point.level }))
    .filter((point) => Number.isFinite(point.t))
    .sort((left, right) => left.t - right.t);
  if (points.length < 2) return null;

  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  const span = t1 - t0;
  if (span <= 0) return null;

  // FROM ZERO, ALWAYS. This is the fix for (3): the scale is anchored at 0 so a
  // near-empty system draws near the floor instead of filling the frame.
  const yMax = niceCeiling(Math.max(...points.map((p) => p.level)));
  const baselineY = height;
  const x = (t: number) => ((t - t0) / span) * width;
  const y = (level: number) => height - (Math.max(0, level) / yMax) * height;

  const nowT = Math.min(Math.max(now.getTime(), t0), t1);
  const nowX = x(nowT);
  // Level at `now` by linear interpolation BETWEEN REAL SAMPLES — never an
  // invented curve, and never the last point (that was bug 2).
  const after = points.findIndex((p) => p.t >= nowT);
  const hi = after === -1 ? points.length - 1 : after;
  const lo = Math.max(0, hi - 1);
  const seg = points[hi]!.t - points[lo]!.t;
  const ratio = seg > 0 ? (nowT - points[lo]!.t) / seg : 0;
  const nowLevel = points[lo]!.level + (points[hi]!.level - points[lo]!.level) * ratio;

  const at = (p: { t: number; level: number }) => `${x(p.t)},${y(p.level)}`;
  const past = points.filter((p) => p.t <= nowT);
  const future = points.filter((p) => p.t >= nowT);
  const join = `${nowX},${y(nowLevel)}`;

  // Straight segments between samples — the fix for (4). The engine's dose is a
  // vertical step, and the path must show it as one.
  const pastPts = [...past.map(at), join];
  const futurePts = [join, ...future.map(at)];
  const pastPath = `M${pastPts.join(' L')}`;
  const futurePath = `M${futurePts.join(' L')}`;

  const GRID_STEPS = 4;
  const gridlines = Array.from({ length: GRID_STEPS }, (_, i) => {
    const value = (yMax / GRID_STEPS) * (i + 1);
    return { y: y(value), value };
  });

  const TICKS = 3;
  const timeTicks = Array.from({ length: TICKS }, (_, i) => {
    const t = t0 + (span / (TICKS - 1)) * i;
    return { x: x(t), at: new Date(t), isNow: false };
  });
  timeTicks.push({ x: nowX, at: new Date(nowT), isNow: true });
  timeTicks.sort((left, right) => left.x - right.x);

  const doseMarkers = doses
    .map((dose) => new Date(dose.datetime).getTime())
    .filter((t) => Number.isFinite(t) && t >= t0 && t <= t1)
    .map((t) => {
      // Snap to the sample at or after the dose: that is the sample carrying
      // the jump, so the marker sits on the peak rather than beside it.
      const index = points.findIndex((p) => p.t >= t);
      const point = points[index === -1 ? points.length - 1 : index]!;
      return { x: x(t), y: y(point.level), isFuture: t > nowT };
    });

  return {
    pastPath,
    futurePath,
    pastArea: `${pastPath} L${nowX},${baselineY} L0,${baselineY} Z`,
    futureArea: `${futurePath} L${width},${baselineY} L${nowX},${baselineY} Z`,
    now: { x: nowX, y: y(nowLevel), level: nowLevel },
    baselineY,
    gridlines,
    timeTicks,
    doseMarkers,
    yMax,
  };
}

/** "8/13" — compact axis label, matching the tracker idiom. */
export function shortTick(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
