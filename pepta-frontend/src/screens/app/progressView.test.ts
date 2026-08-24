import { describe, expect, it } from 'vitest';
import type { ProgressResponse, UserProfileResponse, WeightLogResponse } from '@pepta/shared';
import {
  bmiView,
  computeBmi,
  formatShortDate,
  latestMeasurements,
  latestRetention,
  mergeWeightsWithLatest,
  summary,
  weightPulse,
  weightSeries,
  weightSummary,
} from './progressView';

const now = new Date(2026, 5, 22); // Jun 22 2026

function w(value: number, iso: string): WeightLogResponse {
  return { id: iso, userId: 'u', value, unit: 'lb', datetime: iso, createdAt: iso, updatedAt: iso } as WeightLogResponse;
}

const weights = [
  w(196, '2026-04-04T08:00:00.000Z'),
  w(190, '2026-05-09T08:00:00.000Z'),
  w(184, '2026-06-21T08:00:00.000Z'),
];

const profile = { currentWeight: 196, weightUnit: 'lb', goalWeight: 165, height: 70, heightUnit: 'in', estimatedGoalDate: '2026-09-14' } as unknown as UserProfileResponse;

describe('weightSeries', () => {
  it('windows by range', () => {
    expect(weightSeries(weights, 'All', now)).toHaveLength(3);
    expect(weightSeries(weights, '90d', now)).toHaveLength(3); // Apr 4 is within 90d of Jun 22
    expect(weightSeries(weights, '30d', now)).toHaveLength(1); // only Jun 21 (May 9 is 44d out)
    expect(weightSeries(weights, '7d', now)).toHaveLength(1); // only Jun 21
  });
  it('returns points sorted ascending', () => {
    const pts = weightSeries(weights, 'All', now);
    expect(pts[0]!.value).toBe(196);
    expect(pts[2]!.value).toBe(184);
  });
});

describe('weightSummary', () => {
  it('derives current/start/difference and to-goal %', () => {
    const s = weightSummary(weights, profile);
    expect(s.current).toBe(184);
    expect(s.start).toBe(196);
    expect(s.difference).toBe(-12);
    expect(s.goalWeight).toBe(165);
    // (196-184)/(196-165) = 12/31 ≈ 0.387
    expect(s.toGoalPct).toBeCloseTo(0.387, 2);
  });
  it('falls back to profile weight when no logs', () => {
    const s = weightSummary([], profile);
    expect(s.current).toBe(196);
    expect(s.difference).toBe(0);
  });
});

describe('mergeWeightsWithLatest', () => {
  it('adds a newer home latest weight when progress rows are stale', () => {
    const latest = w(182.5, '2026-06-23T08:00:00.000Z');
    const merged = mergeWeightsWithLatest(weights, latest);

    expect(merged).toHaveLength(4);
    expect(weightSummary(merged, profile).current).toBe(182.5);
  });

  it('does not duplicate the same latest weight row', () => {
    const latest = weights[2]!;
    const merged = mergeWeightsWithLatest(weights, latest);

    expect(merged).toHaveLength(3);
  });
});

describe('weightPulse', () => {
  it('asks for a first check-in when no weight has been logged', () => {
    const pulse = weightPulse([], profile, now);

    expect(pulse.state).toBe('missing');
    expect(pulse.actionLabel).toBe('Add weight');
    expect(pulse.lastWeight).toEqual({ value: 196, unit: 'lb' });
  });

  it('stays quiet when the last weigh-in is fresh', () => {
    const pulse = weightPulse(weights, profile, now);

    expect(pulse.state).toBe('fresh');
    expect(pulse.daysSince).toBe(1);
    expect(pulse.actionLabel).toBe('Same');
  });

  it('nudges when the last weigh-in is stale', () => {
    const staleNow = new Date(2026, 6, 4);
    const pulse = weightPulse(weights, profile, staleNow);

    expect(pulse.state).toBe('stale');
    expect(pulse.daysSince).toBe(13);
    expect(pulse.copy).toContain('13 days');
  });
});

describe('computeBmi / bmiView', () => {
  it('computes BMI + category', () => {
    const bmi = computeBmi(184, 'lb', 70, 'in');
    expect(bmi.value).toBeCloseTo(26.4, 1);
    expect(bmi.category).toBe('Overweight range');
  });
  it('returns null without height', () => {
    expect(bmiView(184, 'lb', { goalWeight: 165 } as unknown as UserProfileResponse)).toBeNull();
  });
});

describe('latestRetention', () => {
  it('maps the most recent week and verdict', () => {
    const list = [
      { weekOf: '2026-06-08', score: 70, verdict: 'watch', verdictProse: 'old', drivers: [], engineVersion: 'v1', copyVersion: null },
      { weekOf: '2026-06-15', score: 88, verdict: 'steady', verdictProse: 'Nice work', drivers: [{ type: 'protein', label: 'Protein', score: 90, contribution: 1 }], engineVersion: 'v1', copyVersion: null },
    ] as unknown as ProgressResponse['weeklyRetention'];
    const r = latestRetention(list)!;
    expect(r.score).toBe(88);
    expect(r.label).toBe('On track');
    expect(r.tone).toBe('good');
    expect(r.drivers[0]).toEqual({ label: 'Protein', score: 90 });
  });
  it('returns null when empty', () => {
    expect(latestRetention([])).toBeNull();
  });
});

describe('latestMeasurements', () => {
  it('keeps the newest per type with a label', () => {
    const measurements = [
      { id: '1', type: 'waist', value: 36, unit: 'in', datetime: '2026-05-01T00:00:00.000Z' },
      { id: '2', type: 'waist', value: 34, unit: 'in', datetime: '2026-06-01T00:00:00.000Z' },
      { id: '3', type: 'hips', value: 40, unit: 'in', datetime: '2026-06-01T00:00:00.000Z' },
    ] as unknown as ProgressResponse['measurements'];
    const out = latestMeasurements(measurements);
    expect(out).toHaveLength(2);
    expect(out.find((m) => m.type === 'waist')!.value).toBe(34);
    expect(out.find((m) => m.type === 'hips')!.label).toBe('Hips');
  });
});

describe('formatShortDate', () => {
  it('formats month + day', () => {
    expect(formatShortDate('2026-06-21T08:00:00.000Z')).toBe('Jun 21');
  });
});

describe('a goal date in the past is not a projection', () => {
  // A real profile carried estimatedGoalDate 2025-11-09 (computed from the
  // journey start — fixed server-side). formatShortDate hides the year, so
  // the legend read "Projected · Nov 9" in August 2026 and looked current,
  // while the chart correctly refused to extend its axis to a past date. The
  // stored stale value only heals on the next profile write, so the client
  // must not present it meanwhile: summary nulls it, and the legend, chart
  // and timeline all inherit that from the one place.
  const profileWith = (estimatedGoalDate: string | null) =>
    ({ estimatedGoalDate }) as never;
  const empty = { weights: [], measurements: [], progressPhotos: [], weeklyRetention: [], sectionErrors: {} } as never;
  const NOW = new Date('2026-08-24T12:00:00.000Z');

  it('nulls a past goal date', () => {
    expect(summary(empty, profileWith('2025-11-09'), NOW).estimatedGoalDate).toBeNull();
  });

  it('keeps a future one', () => {
    expect(summary(empty, profileWith('2026-11-09'), NOW).estimatedGoalDate).toBe('2026-11-09');
  });

  it("keeps TODAY's — arriving today is not stale", () => {
    expect(summary(empty, profileWith('2026-08-24'), NOW).estimatedGoalDate).toBe('2026-08-24');
  });
});

describe('a deleted weigh-in is invisible everywhere, immediately', () => {
  // deleteLog marks rows optimistically and lets the refetch bring truth. The
  // mark is only worth anything if consumers FILTER it — these three did not,
  // so between the tap and the refetch the chart, the summary and the Home
  // merge all kept drawing the row the user had just removed.
  const w = (id: string, value: number, day: number, deletedAt: string | null = null) =>
    ({ id, value, unit: 'lb', datetime: `2026-08-${String(day).padStart(2, '0')}T12:00:00.000Z`, deletedAt }) as WeightLogResponse;
  const NOW = new Date('2026-08-24T15:00:00.000Z');

  it('weightSeries drops marked rows', () => {
    const series = weightSeries([w('a', 200, 20), w('b', 190, 22, '2026-08-24T14:00:00.000Z')], 'All', NOW);

    expect(series.map((p) => p.value)).toEqual([200]);
  });

  it('weightSummary neither starts nor ends on a marked row', () => {
    const s = weightSummary([w('a', 200, 20, '2026-08-24T14:00:00.000Z'), w('b', 190, 22)], null);

    expect(s.start).toBe(190);
    expect(s.current).toBe(190);
  });

  it('mergeWeightsWithLatest does not resurrect a deleted latest', () => {
    // home.latestWeight can still hold the row for a beat after the delete;
    // merging it back in would undo the removal on the chart.
    const merged = mergeWeightsWithLatest([w('a', 200, 20)], w('b', 180, 24, '2026-08-24T14:00:00.000Z'));

    expect(merged.map((row) => row.id)).toEqual(['a']);
  });
});
