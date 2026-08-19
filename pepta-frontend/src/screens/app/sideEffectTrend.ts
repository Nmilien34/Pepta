// The Side effects card: does it ease off, and what happens when the dose goes up.
//
// THAT IS THE WHOLE QUESTION. Nausea in week one is expected; nausea still at
// week eight, or nausea that spikes every time the dose steps up, is worth
// knowing. So the card plots a WEEKLY AVERAGE — a single rough evening is
// noise — and marks the dose increases underneath it.
//
// THE CHIPS ARE THE USER'S OWN EFFECTS, not a fixed menu. Someone who has only
// ever logged fatigue should not be offered Constipation and Headache to
// filter by; the list is built from what they actually recorded.
//
// Pure and RN-free.

const DAY = 86_400_000;
const WEEK = 7 * DAY;

interface Deletable {
  deletedAt?: string | null;
}

export interface SideEffectRow extends Deletable {
  id: string;
  datetime: string;
  types: string[];
  severity?: number | null;
}

export interface DoseRow extends Deletable {
  datetime: string;
  amount: number;
}

export interface SeverityWeek {
  /** Start of the week bucket, ms. */
  startedAt: number;
  /** Mean severity across the logs in it, 1-5. */
  average: number;
  count: number;
}

export interface SideEffectTrend {
  /** Filter chips: 'All' plus every type they have logged, commonest first. */
  types: string[];
  weeks: SeverityWeek[];
  /** The big number: the most recent week's average. */
  current: number | null;
  /** Dose increases inside the window — the dashed markers. */
  doseIncreases: number[];
  /** "Milder than 4 weeks ago · was 3.4", or null with nothing to compare. */
  comparison: string | null;
  /** True when there is nothing logged at all — the empty state. */
  empty: boolean;
}

/** Title-cased from the stored key: "dry_mouth" → "Dry mouth". */
export function effectLabel(type: string): string {
  const spaced = type.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function live<T extends Deletable>(rows: readonly T[] | undefined): T[] {
  return (rows ?? []).filter((row) => row.deletedAt == null);
}

/**
 * Weekly buckets anchored on NOW, not on the calendar, so "this week" means
 * the last seven days rather than however much of Monday-to-Sunday has
 * happened — a Tuesday would otherwise average two days against seven.
 */
function bucketStart(at: number, now: number): number {
  const weeksBack = Math.floor((now - at) / WEEK);
  return now - (weeksBack + 1) * WEEK;
}

export function sideEffectTrend(input: {
  logs: readonly SideEffectRow[] | undefined;
  doses: readonly DoseRow[] | undefined;
  /** Chip selection. null = All. */
  type?: string | null;
  now?: Date;
}): SideEffectTrend {
  const now = (input.now ?? new Date()).getTime();
  const all = live(input.logs);

  // Types come from every log, not the filtered set — filtering to Fatigue
  // must not make the other chips disappear.
  const counts = new Map<string, number>();
  for (const row of all) {
    for (const type of row.types ?? []) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const types = [...counts.entries()]
    .sort(([leftKey, left], [rightKey, right]) => right - left || leftKey.localeCompare(rightKey))
    .map(([type]) => type);

  const selected = input.type
    ? all.filter((row) => (row.types ?? []).includes(input.type!))
    : all;
  // Only rows carrying a severity can average to anything.
  const scored = selected.filter((row) => typeof row.severity === 'number' && row.severity! > 0);

  const byWeek = new Map<number, { total: number; count: number }>();
  for (const row of scored) {
    const at = new Date(row.datetime).getTime();
    if (!Number.isFinite(at)) continue;
    const start = bucketStart(at, now);
    const bucket = byWeek.get(start) ?? { total: 0, count: 0 };
    bucket.total += row.severity!;
    bucket.count += 1;
    byWeek.set(start, bucket);
  }

  const weeks: SeverityWeek[] = [...byWeek.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startedAt, { total, count }]) => ({
      startedAt,
      average: Math.round((total / count) * 10) / 10,
      count,
    }));

  const doseIncreases = increases(live(input.doses));

  return {
    types,
    weeks,
    current: weeks.length > 0 ? weeks[weeks.length - 1]!.average : null,
    doseIncreases,
    comparison: comparisonLine(weeks),
    empty: all.length === 0,
  };
}

/**
 * When the dose went UP. A step down is not what anyone is watching for here —
 * the question the card answers is whether increases cost them anything.
 */
function increases(doses: readonly DoseRow[]): number[] {
  const sorted = [...doses]
    .map((dose) => ({ at: new Date(dose.datetime).getTime(), amount: dose.amount }))
    .filter((dose) => Number.isFinite(dose.at))
    .sort((left, right) => left.at - right.at);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.amount > sorted[i - 1]!.amount) out.push(sorted[i]!.at);
  }
  return out;
}

/**
 * The frame says "Milder than your first month". It cannot: /track looks back
 * 30 days, so for anyone past their first month that phrase would name a
 * period the data does not contain. This says what was ACTUALLY compared —
 * the earliest week held against the latest — and how far apart they are.
 */
function comparisonLine(weeks: SeverityWeek[]): string | null {
  if (weeks.length < 2) return null;
  const first = weeks[0]!;
  const last = weeks[weeks.length - 1]!;
  const gap = Math.max(1, Math.round((last.startedAt - first.startedAt) / WEEK));
  const when = gap === 1 ? 'last week' : `${gap} weeks ago`;
  const delta = Math.round((last.average - first.average) * 10) / 10;
  if (Math.abs(delta) < 0.3) return `About the same as ${when} · was ${first.average}`;
  return delta < 0
    ? `Milder than ${when} · was ${first.average}`
    : `Rougher than ${when} · was ${first.average}`;
}

export interface SeverityChartModel {
  /** Polyline through the weekly averages. */
  path: string;
  points: { x: number; y: number }[];
  /** x for each dose increase inside the plotted span. */
  markers: number[];
  baselineY: number;
  gridlines: { y: number; value: number }[];
}

/**
 * Geometry for the severity chart. ALWAYS 0-5, never scaled to the data: a
 * week averaging 1.2 must draw near the floor, not fill the frame the way a
 * min-max scale would. The whole point is "is this getting better".
 */
export function severityChartModel(
  weeks: readonly SeverityWeek[],
  doseIncreases: readonly number[],
  width: number,
  height: number,
): SeverityChartModel | null {
  if (weeks.length < 2 || width <= 0 || height <= 0) return null;
  const first = weeks[0]!.startedAt;
  const last = weeks[weeks.length - 1]!.startedAt;
  const span = last - first;
  if (span <= 0) return null;

  const MAX = 5;
  const x = (at: number) => ((at - first) / span) * width;
  const y = (value: number) => height - (Math.min(MAX, Math.max(0, value)) / MAX) * height;

  const points = weeks.map((week) => ({ x: x(week.startedAt), y: y(week.average) }));
  return {
    path: `M${points.map((point) => `${point.x},${point.y}`).join(' L')}`,
    points,
    markers: doseIncreases.filter((at) => at >= first && at <= last).map(x),
    baselineY: height,
    gridlines: [1, 2, 3, 4, 5].map((value) => ({ y: y(value), value })),
  };
}
