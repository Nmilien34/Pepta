import { describe, expect, it } from 'vitest';
import { effectLabel, severityChartModel, sideEffectTrend } from './sideEffectTrend';

const NOW = new Date(2026, 7, 13, 14, 0, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const log = (id: string, days: number, types: string[], severity: number | null) => ({
  id,
  datetime: daysAgo(days),
  types,
  severity,
  deletedAt: null,
});

const dose = (days: number, amount: number) => ({
  datetime: daysAgo(days),
  amount,
  deletedAt: null,
});

describe('the chips are the user’s own effects', () => {
  it('lists only what they have logged, commonest first', () => {
    const trend = sideEffectTrend({
      logs: [
        log('a', 1, ['fatigue'], 2),
        log('b', 2, ['nausea'], 3),
        log('c', 3, ['nausea'], 3),
      ],
      doses: [],
      now: NOW,
    });

    expect(trend.types).toEqual(['nausea', 'fatigue']);
  });

  it('keeps every chip when one is selected — filtering must not hide the others', () => {
    const trend = sideEffectTrend({
      logs: [log('a', 1, ['fatigue'], 2), log('b', 2, ['nausea'], 4)],
      doses: [],
      type: 'nausea',
      now: NOW,
    });

    expect(trend.types.sort()).toEqual(['fatigue', 'nausea']);
    // But the numbers are the filtered ones.
    expect(trend.current).toBe(4);
  });

  it('reads a stored key as a label', () => {
    expect(effectLabel('dry_mouth')).toBe('Dry mouth');
    expect(effectLabel('nausea')).toBe('Nausea');
  });
});

describe('the weekly average', () => {
  it('averages within a week rather than plotting every log', () => {
    // A single rough evening is noise; the question is the week.
    const trend = sideEffectTrend({
      logs: [log('a', 1, ['nausea'], 1), log('b', 2, ['nausea'], 2), log('c', 3, ['nausea'], 3)],
      doses: [],
      now: NOW,
    });

    expect(trend.weeks).toHaveLength(1);
    expect(trend.weeks[0]!.average).toBe(2);
    expect(trend.weeks[0]!.count).toBe(3);
  });

  it('separates weeks, oldest first', () => {
    const trend = sideEffectTrend({
      logs: [log('old', 20, ['nausea'], 4), log('new', 1, ['nausea'], 1)],
      doses: [],
      now: NOW,
    });

    expect(trend.weeks.map((week) => week.average)).toEqual([4, 1]);
    expect(trend.current).toBe(1);
  });

  it('ignores a log with no severity — it cannot average to anything', () => {
    const trend = sideEffectTrend({
      logs: [log('a', 1, ['nausea'], null), log('b', 1, ['nausea'], 2)],
      doses: [],
      now: NOW,
    });

    expect(trend.weeks[0]!.count).toBe(1);
    expect(trend.current).toBe(2);
  });

  it('ignores anything deleted', () => {
    const trend = sideEffectTrend({
      logs: [{ ...log('a', 1, ['nausea'], 5), deletedAt: daysAgo(0) }, log('b', 1, ['nausea'], 1)],
      doses: [],
      now: NOW,
    });

    expect(trend.current).toBe(1);
  });
});

describe('what it compares against', () => {
  it('says what was ACTUALLY compared, not "your first month"', () => {
    // /track looks back 30 days, so for anyone past their first month that
    // phrase would name a period the data does not contain.
    const trend = sideEffectTrend({
      logs: [log('old', 21, ['nausea'], 3.4 as never), log('new', 1, ['nausea'], 1.5 as never)],
      doses: [],
      now: NOW,
    });

    expect(trend.comparison).toBe('Milder than 3 weeks ago · was 3.4');
  });

  it('says rougher when it got worse', () => {
    const trend = sideEffectTrend({
      logs: [log('old', 8, ['nausea'], 1), log('new', 1, ['nausea'], 4)],
      doses: [],
      now: NOW,
    });

    expect(trend.comparison).toBe('Rougher than last week · was 1');
  });

  it('does not call a rounding difference a change', () => {
    const trend = sideEffectTrend({
      logs: [log('old', 8, ['nausea'], 2), log('new', 1, ['nausea'], 2.2 as never)],
      doses: [],
      now: NOW,
    });

    expect(trend.comparison).toMatch(/About the same/);
  });

  it('compares nothing with only one week logged', () => {
    const trend = sideEffectTrend({
      logs: [log('a', 1, ['nausea'], 2)],
      doses: [],
      now: NOW,
    });

    expect(trend.comparison).toBeNull();
  });
});

describe('dose increases', () => {
  it('marks a step UP, and only up', () => {
    const trend = sideEffectTrend({
      logs: [log('a', 1, ['nausea'], 2)],
      doses: [dose(30, 2.5), dose(20, 5), dose(10, 5), dose(3, 2.5)],
      now: NOW,
    });

    // 2.5 → 5 is the only increase; 5 → 5 and 5 → 2.5 are not.
    expect(trend.doseIncreases).toHaveLength(1);
    expect(new Date(trend.doseIncreases[0]!).toISOString()).toBe(daysAgo(20));
  });

  it('finds nothing on a steady dose', () => {
    const trend = sideEffectTrend({
      logs: [log('a', 1, ['nausea'], 2)],
      doses: [dose(21, 5), dose(14, 5), dose(7, 5)],
      now: NOW,
    });

    expect(trend.doseIncreases).toEqual([]);
  });
});

describe('the empty state', () => {
  it('is flagged when nothing has ever been logged', () => {
    expect(sideEffectTrend({ logs: [], doses: [], now: NOW }).empty).toBe(true);
    expect(sideEffectTrend({ logs: undefined, doses: undefined, now: NOW }).empty).toBe(true);
  });

  it('is NOT flagged when logs exist but carry no severity', () => {
    // They have used the feature; the card should show its chips, not the
    // "nothing logged yet" pitch.
    const trend = sideEffectTrend({ logs: [log('a', 1, ['nausea'], null)], doses: [], now: NOW });

    expect(trend.empty).toBe(false);
    expect(trend.current).toBeNull();
  });
});

describe('the chart', () => {
  const weeks = [
    { startedAt: NOW.getTime() - 3 * 7 * 86_400_000, average: 3.4, count: 4 },
    { startedAt: NOW.getTime() - 7 * 86_400_000, average: 1.5, count: 3 },
  ];

  it('is always scaled 0 to 5, never to the data', () => {
    const model = severityChartModel(weeks, [], 100, 100)!;

    // 3.4 of 5 sits at 68% of the height, not at the top.
    expect(model.points[0]!.y).toBeCloseTo(100 - 68, 0);
    expect(model.points[1]!.y).toBeCloseTo(100 - 30, 0);
    expect(model.gridlines).toHaveLength(5);
  });

  it('places dose markers on the same time axis', () => {
    const midpoint = (weeks[0]!.startedAt + weeks[1]!.startedAt) / 2;
    const model = severityChartModel(weeks, [midpoint], 100, 100)!;

    expect(model.markers[0]).toBeCloseTo(50, 0);
  });

  it('drops a marker outside the plotted span rather than clamping it to the edge', () => {
    const model = severityChartModel(weeks, [NOW.getTime() - 300 * 86_400_000], 100, 100)!;

    expect(model.markers).toEqual([]);
  });

  it('draws nothing from a single week — one point is not a trend', () => {
    expect(severityChartModel([weeks[0]!], [], 100, 100)).toBeNull();
    expect(severityChartModel(weeks, [], 0, 100)).toBeNull();
  });
});
