import { describe, expect, it } from 'vitest';
import { LEVEL_RANGES, levelRangeView } from './levelRange';

const point = (day: number, level: number) => ({
  datetime: `2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  level,
});

const HOME_DOSES = [{ datetime: point(13, 0).datetime }];

const home = {
  compoundId: 'c1',
  curve: [point(12, 1), point(13, 0.9), point(14, 0.8)],
  peakEstimate: 1,
};

const served = (compoundId: string, peak: number) => ({
  range: 'quarter' as const,
  daysBefore: 90,
  daysAfter: 14,
  doses: [
    { compoundId, datetime: point(2, 0).datetime },
    { compoundId: 'someone-else', datetime: point(3, 0).datetime },
  ],
  levels: [
    {
      compoundId,
      compoundName: 'Tirzepatide',
      halfLifeDays: 5,
      currentEstimate: 0.5,
      peakEstimate: peak,
      troughEstimate: 0.1,
      curve: [point(1, 2), point(2, 1.8), point(3, 1.6)],
      nextDoseAt: null,
      hoursUntilNextDose: null,
      estimateBasis: 'relative-dose-equivalent' as const,
      engineVersion: 'pk-v2',
    },
  ],
});

describe('which curve the chart shows', () => {
  it('serves the week from what /home already loaded — no request, no spinner', () => {
    const view = levelRangeView({ range: 'week', home, homeDoses: HOME_DOSES, fetched: {}, loading: false });

    expect(view.curve).toEqual(home.curve);
    expect(view.peak).toBe(1);
    expect(view.loading).toBe(false);
  });

  it('shows a fetched window once it lands', () => {
    const view = levelRangeView({
      range: 'quarter',
      home,
      homeDoses: HOME_DOSES,
      fetched: { quarter: served('c1', 2) },
      loading: false,
    });

    expect(view.curve).toHaveLength(3);
    expect(view.peak).toBe(2);
  });

  it('NEVER falls back to the week curve under a wider label', () => {
    // This is the whole bug being fixed: seven days of data under a control
    // that says 90 is worse than an empty frame, because it reads as answered.
    const view = levelRangeView({ range: 'quarter', home, homeDoses: HOME_DOSES, fetched: {}, loading: true });

    expect(view.curve).toEqual([]);
    expect(view.loading).toBe(true);
  });

  it('is empty rather than loading when nothing is coming', () => {
    const view = levelRangeView({ range: 'all', home, homeDoses: HOME_DOSES, fetched: {}, loading: false });

    expect(view.empty).toBe(true);
    expect(view.loading).toBe(false);
  });

  it('keeps plotting the compound home is showing when several come back', () => {
    const many = served('c1', 2);
    many.levels.unshift({ ...many.levels[0]!, compoundId: 'other', peakEstimate: 99 });

    const view = levelRangeView({ range: 'quarter', home, homeDoses: HOME_DOSES, fetched: { quarter: many }, loading: false });

    expect(view.peak).toBe(2);
  });

  it('falls back to the first compound when home has none', () => {
    const view = levelRangeView({
      range: 'quarter',
      home: null,
      homeDoses: HOME_DOSES,
      fetched: { quarter: served('whoever', 3) },
      loading: false,
    });

    expect(view.peak).toBe(3);
  });

  it('does not draw a single-point curve — one sample is not a line', () => {
    const thin = served('c1', 2);
    thin.levels[0]!.curve = [point(1, 2)];

    const view = levelRangeView({ range: 'quarter', home, homeDoses: HOME_DOSES, fetched: { quarter: thin }, loading: false });

    expect(view.curve).toEqual([]);
    expect(view.empty).toBe(true);
  });

  it('offers exactly the windows the server can draw', () => {
    expect(LEVEL_RANGES.map((r) => r.key)).toEqual(['week', 'month', 'quarter', 'all']);
    expect(LEVEL_RANGES.map((r) => r.label)).toEqual(['Week', 'Month', '90d', 'All']);
  });
});

describe('the markers that explain each rise', () => {
  it('uses the doses /track already loaded for the week', () => {
    const view = levelRangeView({ range: 'week', home, homeDoses: HOME_DOSES, fetched: {}, loading: false });

    expect(view.doses).toEqual(HOME_DOSES);
  });

  it('uses the window\'s own doses for anything wider — /track only looks back 30 days', () => {
    const view = levelRangeView({
      range: 'quarter',
      home,
      homeDoses: HOME_DOSES,
      fetched: { quarter: served('c1', 2) },
      loading: false,
    });

    expect(view.doses).toEqual([{ compoundId: 'c1', datetime: point(2, 0).datetime }]);
  });

  it('never marks another compound\'s doses on this compound\'s curve', () => {
    const view = levelRangeView({
      range: 'quarter',
      home,
      homeDoses: HOME_DOSES,
      fetched: { quarter: served('c1', 2) },
      loading: false,
    });

    expect(view.doses.every((d) => (d as unknown as { compoundId: string }).compoundId === 'c1')).toBe(true);
  });
});
