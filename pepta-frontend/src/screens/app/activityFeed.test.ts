import { describe, expect, it } from 'vitest';
import { makeHome } from '../../mocks/home';
import { buildActivityFeed, entryTime, localDay, removeConfirmLine, severityWord } from './activityFeed';

const NOW = new Date(2026, 7, 13, 14, 0, 0); // Thu Aug 13 2026, 2pm local
const at = (day: number, hour: number) => new Date(2026, 7, day, hour, 0, 0).toISOString();

const home = (compounds: unknown[] = [{ id: 'c1', name: 'Zepbound', route: 'injection', doseUnit: 'mg' }]) =>
  makeHome({ activeCompounds: compounds as never });

const track = (over: Record<string, unknown> = {}) =>
  ({
    doseLogs: [], mealLogs: [], waterLogs: [], proteinLogs: [],
    activityLogs: [], sideEffectLogs: [], measurements: [], weightLogs: [], fiberLogs: [],
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
      // Protein, not water: water is deliberately one row per day now, so it
      // cannot demonstrate the ordering of several entries within a day.
      track: track({
        proteinLogs: [
          { id: 'a', grams: 20, datetime: at(11, 9), deletedAt: null },
          { id: 'b', grams: 20, datetime: at(13, 9), deletedAt: null },
          { id: 'c', grams: 20, datetime: at(13, 17), deletedAt: null },
        ],
      }),
    });
    expect(feed.map((d) => d.label)).toEqual(['Today', 'Tue, Aug 11']);
    expect(feed[0]!.entries.map((e) => e.id)).toEqual(['protein-c', 'protein-b']);
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
    const proteinLogs = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, grams: 20, datetime: at(13, 8 + i), deletedAt: null })),
      { id: 'y', grams: 20, datetime: at(12, 9), deletedAt: null },
      { id: 'x', grams: 20, datetime: at(11, 9), deletedAt: null },
      { id: 'w', grams: 20, datetime: at(10, 9), deletedAt: null },
    ];
    const feed = buildActivityFeed({ home: home(), now: NOW, track: track({ proteinLogs }), maxDays: 2 });
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

describe('the dose never falls off the end', () => {
  it('keeps the last dose visible for a weekly injector who logs daily habits', () => {
    // Regression: three days of water filled the window and the shot from five
    // days ago vanished — worse than the doses-only card this replaced.
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(8, 9), deletedAt: null }],
        waterLogs: [11, 12, 13].map((d) => ({ id: `w${d}`, amountOz: 64, datetime: at(d, 9), deletedAt: null })),
      }),
    });
    const kinds = feed.flatMap((day) => day.entries.map((entry) => entry.kind));
    expect(kinds).toContain('dose');
    // Appended, not promoted: recency order is preserved.
    expect(feed[feed.length - 1]!.entries.some((e) => e.kind === 'dose')).toBe(true);
  });

  it('does not append a duplicate when a dose is already in the window', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(13, 9), deletedAt: null }],
        waterLogs: [{ id: 'w', amountOz: 64, datetime: at(13, 10), deletedAt: null }],
      }),
    });
    expect(feed).toHaveLength(1);
    expect(feed.flatMap((d) => d.entries).filter((e) => e.kind === 'dose')).toHaveLength(1);
  });

  it('stays empty when the user has no doses at all', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({ waterLogs: [{ id: 'w', amountOz: 64, datetime: at(13, 9), deletedAt: null }] }),
    });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.entries.every((e) => e.kind !== 'dose')).toBe(true);
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

const withTargets = (compounds?: unknown[]) =>
  makeHome({
    activeCompounds: (compounds ?? [
      { id: 'c1', name: 'Zepbound', route: 'injection', doseUnit: 'mg' },
    ]) as never,
    profile: { dailyProteinTargetGrams: 140, dailyWaterTargetOz: 100 } as never,
  });

const find = (feed: ReturnType<typeof buildActivityFeed>, kind: string) =>
  feed.flatMap((day) => day.entries).find((entry) => entry.kind === kind);

describe('every row says what it means, not just what it was', () => {
  it('measures a habit log against the target for that day', () => {
    const feed = buildActivityFeed({
      home: withTargets(),
      now: NOW,
      track: track({
        proteinLogs: [{ id: 'p', grams: 42, datetime: at(13, 8), deletedAt: null }],
        waterLogs: [{ id: 'h', amountOz: 64, datetime: at(13, 10), deletedAt: null }],
      }),
    });

    expect(find(feed, 'protein')!.detail).toBe('Of 140 g today');
    expect(find(feed, 'water')!.detail).toBe('Of 100 oz today');
  });

  it("does not put today's target under an older day — it may never have been theirs", () => {
    const feed = buildActivityFeed({
      home: withTargets(),
      now: NOW,
      track: track({
        proteinLogs: [{ id: 'p', grams: 42, datetime: at(11, 8), deletedAt: null }],
      }),
    });

    expect(find(feed, 'protein')!.detail).toBe('');
  });

  it('says nothing about a target the user has not set', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({ waterLogs: [{ id: 'h', amountOz: 64, datetime: at(13, 10), deletedAt: null }] }),
    });

    expect(find(feed, 'water')!.detail).toBe('');
  });

  it('gives a weigh-in its weekly trend', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        weightLogs: [
          { id: 'w2', value: 230, unit: 'lb', datetime: at(13, 7), deletedAt: null },
          { id: 'w1', value: 231.2, unit: 'lb', datetime: at(6, 7), deletedAt: null },
        ],
      }),
    });

    expect(find(feed, 'weight')!.detail).toBe('Down 1.2 lb this week');
  });

  it('says up when it went up, and level when it did not move', () => {
    const up = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        weightLogs: [
          { id: 'w2', value: 232, unit: 'lb', datetime: at(13, 7), deletedAt: null },
          { id: 'w1', value: 230, unit: 'lb', datetime: at(6, 7), deletedAt: null },
        ],
      }),
    });
    expect(find(up, 'weight')!.detail).toBe('Up 2 lb this week');

    const level = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        weightLogs: [
          { id: 'w2', value: 230, unit: 'lb', datetime: at(13, 7), deletedAt: null },
          { id: 'w1', value: 230, unit: 'lb', datetime: at(6, 7), deletedAt: null },
        ],
      }),
    });
    expect(find(level, 'weight')!.detail).toBe('Same as last week');
  });

  it('claims no weekly trend from two weigh-ins on the same morning', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        weightLogs: [
          { id: 'w2', value: 230, unit: 'lb', datetime: at(13, 9), deletedAt: null },
          { id: 'w1', value: 231, unit: 'lb', datetime: at(13, 7), deletedAt: null },
        ],
      }),
    });

    expect(find(feed, 'weight')!.detail).toBe('');
  });

  it('places a side effect against the dose that preceded it', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(10, 9), deletedAt: null }],
        sideEffectLogs: [{ id: 's', types: ['nausea'], severity: 2, datetime: at(12, 18), deletedAt: null }],
      }),
    });

    const effect = find(feed, 'sideEffect')!;
    expect(effect.title).toBe('Nausea · mild');
    expect(effect.detail).toBe('2 days after your dose');
  });

  it('never reads a side effect against a dose that came after it', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(13, 9), deletedAt: null }],
        sideEffectLogs: [{ id: 's', types: ['nausea'], severity: 4, datetime: at(11, 18), deletedAt: null }],
      }),
    });

    expect(find(feed, 'sideEffect')!.detail).toBe('');
  });

  it('says severity as a word, so nobody converts 3-of-5 in their head', () => {
    expect(severityWord(1)).toBe('mild');
    expect(severityWord(2)).toBe('mild');
    expect(severityWord(3)).toBe('moderate');
    expect(severityWord(5)).toBe('severe');
    expect(severityWord(null)).toBe('');
  });

  it('leaves a severity-less effect with just its name', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        sideEffectLogs: [{ id: 's', types: ['nausea'], severity: null, datetime: at(13, 18), deletedAt: null }],
      }),
    });

    expect(find(feed, 'sideEffect')!.title).toBe('Nausea');
  });
});

describe('water is a day, not a moment', () => {
  const day = (logs: { id: string; amountOz: number; datetime: string }[]) =>
    buildActivityFeed({
      home: makeHome({ profile: { dailyWaterTargetOz: 100 } as never }),
      now: NOW,
      track: track({ waterLogs: logs.map((log) => ({ ...log, deletedAt: null })) }),
    });

  it('adds a day\'s pours into one row', () => {
    const feed = day([
      { id: 'a', amountOz: 8, datetime: at(13, 8) },
      { id: 'b', amountOz: 16, datetime: at(13, 12) },
      { id: 'c', amountOz: 40, datetime: at(13, 17) },
    ]);
    const water = feed[0]!.entries.filter((entry) => entry.kind === 'water');

    expect(water).toHaveLength(1);
    expect(water[0]!.title).toBe('64 oz water');
  });

  it('says "All day" rather than picking one pour\'s clock time', () => {
    const feed = day([
      { id: 'a', amountOz: 8, datetime: at(13, 8) },
      { id: 'b', amountOz: 8, datetime: at(13, 17) },
    ]);

    expect(feed[0]!.entries[0]!.timeLabel).toBe('All day');
  });

  it('keeps each day separate — yesterday is not folded into today', () => {
    const feed = day([
      { id: 'a', amountOz: 8, datetime: at(13, 8) },
      { id: 'b', amountOz: 24, datetime: at(12, 8) },
    ]);

    expect(feed.map((d) => d.entries[0]!.title)).toEqual(['8 oz water', '24 oz water']);
  });

  it('rounds the sum — adding floats gives 63.99999999999999', () => {
    const feed = day([
      { id: 'a', amountOz: 21.3, datetime: at(13, 8) },
      { id: 'b', amountOz: 21.3, datetime: at(13, 9) },
      { id: 'c', amountOz: 21.4, datetime: at(13, 10) },
    ]);

    expect(feed[0]!.entries[0]!.title).toBe('64 oz water');
  });

  it('still measures the day against the target', () => {
    const feed = day([{ id: 'a', amountOz: 64, datetime: at(13, 8) }]);

    expect(feed[0]!.entries[0]!.detail).toBe('Of 100 oz today');
  });

  it('leaves out a pour the user deleted', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        waterLogs: [
          { id: 'a', amountOz: 8, datetime: at(13, 8), deletedAt: null },
          { id: 'b', amountOz: 500, datetime: at(13, 9), deletedAt: '2026-08-13T10:00:00.000Z' },
        ],
      }),
    });

    expect(feed[0]!.entries[0]!.title).toBe('8 oz water');
  });

  it('gives every other kind its own row and its own time', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        proteinLogs: [
          { id: 'p1', grams: 20, datetime: at(13, 8), deletedAt: null },
          { id: 'p2', grams: 22, datetime: at(13, 12), deletedAt: null },
        ],
      }),
    });
    const protein = feed[0]!.entries.filter((entry) => entry.kind === 'protein');

    expect(protein).toHaveLength(2);
    expect(protein.every((entry) => entry.timeLabel == null)).toBe(true);
  });
});

describe('what a Remove confirmation says', () => {
  const one = { sourceIds: ['a'], title: 'Zepbound · 5 mg' } as never;
  const many = { sourceIds: ['a', 'b', 'c'], title: '64 oz water' } as never;

  it('names the row for a single record', () => {
    expect(removeConfirmLine(one)).toBe('Remove Zepbound · 5 mg?');
  });

  it('says how many when one swipe would take several', () => {
    // A day's water is a dozen pours. "Remove 64 oz water?" would hide that.
    expect(removeConfirmLine(many)).toBe(
      '64 oz water is 3 separate entries. Remove all of them?',
    );
  });

  it('carries the source ids the delete needs, on every kind', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        doseLogs: [{ id: 'd', compoundId: 'c1', amount: 5, unit: 'mg', datetime: at(13, 9), deletedAt: null }],
        weightLogs: [{ id: 'w', value: 230, unit: 'lb', datetime: at(13, 7), deletedAt: null }],
        proteinLogs: [{ id: 'p', grams: 42, datetime: at(13, 8), deletedAt: null }],
        waterLogs: [
          { id: 'h1', amountOz: 8, datetime: at(13, 10), deletedAt: null },
          { id: 'h2', amountOz: 8, datetime: at(13, 11), deletedAt: null },
        ],
        sideEffectLogs: [{ id: 's', types: ['nausea'], severity: 2, datetime: at(13, 18), deletedAt: null }],
      }),
    });

    for (const item of feed.flatMap((day) => day.entries)) {
      expect(item.sourceIds.length).toBeGreaterThan(0);
      expect(item.sourceIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    }
    const water = feed[0]!.entries.find((item) => item.kind === 'water')!;
    expect(water.sourceIds.sort()).toEqual(['h1', 'h2']);
  });
});

// Fibre was the app's only write-only log kind: the Home stepper created rows,
// GET /track never carried them, and so nothing could show or delete them.
describe('fibre is a real record, not a number that vanishes', () => {
  it('shows the day’s fibre and carries every row id for deletion', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        fiberLogs: [
          { id: 'f1', grams: 5, datetime: at(13, 9), deletedAt: null },
          { id: 'f2', grams: 3, datetime: at(13, 11), deletedAt: null },
        ],
      }),
    });

    const fiber = feed[0]!.entries.find((item) => item.kind === 'fiber')!;
    expect(fiber.title).toBe('8 g fibre');
    // One row per day, like water — the stepper logs it +1g at a time.
    expect(fiber.sourceIds.sort()).toEqual(['f1', 'f2']);
    expect(fiber.timeLabel).toBe('All day');
  });

  it('NEVER resurrects a soft-deleted fibre row', () => {
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({
        fiberLogs: [{ id: 'f1', grams: 5, datetime: at(13, 9), deletedAt: at(13, 10) }],
      }),
    });

    expect(feed.flatMap((day) => day.entries).some((e) => e.kind === 'fiber')).toBe(false);
  });

  it('survives a backend that predates fiberLogs', () => {
    // The field is optional-with-default in the shared schema, but a cached
    // snapshot written by an older client has no key at all.
    const feed = buildActivityFeed({
      home: home(),
      now: NOW,
      track: track({ fiberLogs: undefined }),
    });

    expect(feed).toEqual([]);
  });
});
