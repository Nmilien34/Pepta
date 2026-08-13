import { describe, expect, it } from 'vitest';
import { makeHome } from '../../mocks/home';
import { buildActivityFeed, entryTime, localDay } from './activityFeed';

const NOW = new Date(2026, 7, 13, 14, 0, 0); // Thu Aug 13 2026, 2pm local
const at = (day: number, hour: number) => new Date(2026, 7, day, hour, 0, 0).toISOString();

const home = (compounds: unknown[] = [{ id: 'c1', name: 'Zepbound', route: 'injection', doseUnit: 'mg' }]) =>
  makeHome({ activeCompounds: compounds as never });

const track = (over: Record<string, unknown> = {}) =>
  ({
    doseLogs: [], mealLogs: [], waterLogs: [], proteinLogs: [],
    activityLogs: [], sideEffectLogs: [], measurements: [], weightLogs: [],
    sectionErrors: {}, ...over,
  }) as never;

describe('the feed is the user’s real records', () => {
  it('shows every kind of log, not just doses', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(13, 9), injectionSite: 'abdomen_left', deletedAt: null }],
        weightLogs: [{ id: 'w', value: 230, unit: 'lb', datetime: at(13, 7), deletedAt: null }],
        proteinLogs: [{ id: 'p', grams: 42, datetime: at(13, 8), deletedAt: null }],
        waterLogs: [{ id: 'h', amountOz: 64, datetime: at(13, 10), deletedAt: null }],
        sideEffectLogs: [{ id: 's', types: ['nausea'], severity: 2, datetime: at(13, 18), deletedAt: null }],
      }),
    });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.entries.map((e) => e.kind).sort()).toEqual(
      ['dose', 'protein', 'sideEffect', 'water', 'weight'],
    );
  });

  it('NEVER resurrects a soft-deleted log', () => {
    // deletedAt is the only delete this app performs; ignoring it would show
    // people entries they removed.
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(13, 9), deletedAt: at(13, 10) }],
        weightLogs: [{ id: 'w', value: 230, unit: 'lb', datetime: at(13, 7), deletedAt: at(13, 8) }],
      }),
    });
    expect(feed).toHaveLength(0);
  });

  it('reads values off the record rather than computing them', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 2.5, unit: 'mg', datetime: at(13, 9), injectionSite: 'thigh_right', deletedAt: null }],
      }),
    });
    const entry = feed[0]!.entries[0]!;
    expect(entry.title).toBe('Zepbound · 2.5 mg');
    expect(entry.detail).toBe('Right Thigh'); // trackView.siteLabel's own casing
  });

  it('returns nothing when there is nothing logged', () => {
    expect(buildActivityFeed({ track: track(), home: home(), now: NOW })).toEqual([]);
    expect(buildActivityFeed({ track: null, home: home(), now: NOW })).toEqual([]);
  });
});

describe('grouping and order', () => {
  it('groups by local day, newest day first, newest entry first', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        waterLogs: [
          { id: 'a', amountOz: 8, datetime: at(11, 9), deletedAt: null },
          { id: 'b', amountOz: 8, datetime: at(13, 9), deletedAt: null },
          { id: 'c', amountOz: 8, datetime: at(13, 17), deletedAt: null },
        ],
      }),
    });
    expect(feed.map((d) => d.label)).toEqual(['Today', 'Tue, Aug 11']);
    expect(feed[0]!.entries.map((e) => e.id)).toEqual(['water-c', 'water-b']);
  });

  it('labels today and yesterday by name', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        waterLogs: [
          { id: 'a', amountOz: 8, datetime: at(13, 9), deletedAt: null },
          { id: 'b', amountOz: 8, datetime: at(12, 9), deletedAt: null },
        ],
      }),
    });
    expect(feed.map((d) => d.label)).toEqual(['Today', 'Yesterday']);
  });

  it('caps DAYS, never truncating a busy day', () => {
    const waterLogs = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, amountOz: 8, datetime: at(13, 8 + i), deletedAt: null })),
      { id: 'y', amountOz: 8, datetime: at(12, 9), deletedAt: null },
      { id: 'x', amountOz: 8, datetime: at(11, 9), deletedAt: null },
      { id: 'w', amountOz: 8, datetime: at(10, 9), deletedAt: null },
    ];
    const feed = buildActivityFeed({ home: home(), now: NOW, track: track({ waterLogs }), maxDays: 2 });
    expect(feed).toHaveLength(2);
    expect(feed[0]!.entries).toHaveLength(9);
  });

  it('groups on the LOCAL day — a late-evening log is not filed under tomorrow', () => {
    // UTC slicing would push a 9pm log in a western zone into the next day.
    const evening = new Date(2026, 7, 13, 21, 30, 0).toISOString();
    expect(localDay(evening)).toBe('2026-08-13');
  });
});

describe('route awareness', () => {
  it('never says "site" for an oral medication', () => {
    const feed = buildActivityFeed({
      home: home([{ id: 'c1', name: 'Foundayo', route: 'oral', doseUnit: 'mg' }]),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 2.5, unit: 'mg', datetime: at(13, 9), deletedAt: null }],
      }),
    });
    const entry = feed[0]!.entries[0]!;
    expect(entry.title).toBe('Foundayo · 2.5 mg');
    expect(entry.detail).toBe('Logged dose');
    expect(`${entry.title} ${entry.detail}`).not.toMatch(/shot|inject/i);
  });

  it('survives a dose whose compound is no longer active', () => {
    const feed = buildActivityFeed({
      home: home([]),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'gone', amount: 5, unit: 'mg', datetime: at(13, 9), deletedAt: null }],
      }),
    });
    expect(feed[0]!.entries[0]!.title).toBe('Medication · 5 mg');
  });
});

describe('entryTime', () => {
  it('formats a clock time', () => {
    expect(entryTime(at(13, 9))).toMatch(/9:00/);
  });
  it('returns empty for junk rather than "Invalid Date"', () => {
    expect(entryTime('not-a-date')).toBe('');
  });
});
