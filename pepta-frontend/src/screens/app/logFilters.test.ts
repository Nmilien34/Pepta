import { describe, expect, it } from 'vitest';
import type { ActivityDay } from './activityFeed';
import {
  LOG_GROUPS,
  LOG_SCOPES,
  NO_FILTER,
  emptyLine,
  entryCount,
  filterFeed,
  groupCounts,
  isFiltered,
  scopeLabel,
  toggleGroup,
} from './logFilters';

const NOW = new Date(2026, 7, 13, 14, 0, 0); // Thu Aug 13 2026, 2pm local
const at = (day: number, hour = 9) => new Date(2026, 7, day, hour, 0, 0).toISOString();

const entry = (id: string, kind: string, day: number, hour = 9) => ({
  id,
  kind: kind as never,
  title: id,
  detail: '',
  datetime: at(day, hour),
});

const feed: ActivityDay[] = [
  {
    date: '2026-08-13',
    label: 'Today',
    entries: [entry('d1', 'dose', 13), entry('w1', 'weight', 13, 7), entry('h1', 'water', 13, 10)],
  },
  {
    date: '2026-08-10',
    label: 'Mon, Aug 10',
    entries: [entry('p1', 'protein', 10), entry('m1', 'meal', 10, 12)],
  },
  {
    // Well outside a month: 54 days back, so "This month" excludes it and
    // "All time" is the only scope that reaches it.
    date: '2026-06-20',
    label: 'Sat, Jun 20',
    entries: [
      { ...entry('s1', 'sideEffect', 13), datetime: new Date(2026, 5, 20, 18).toISOString() },
      { ...entry('d2', 'dose', 13), datetime: new Date(2026, 5, 20, 8).toISOString() },
    ],
  },
];

describe('when — the scope pill', () => {
  it('today means the calendar day, not a rolling 24 hours', () => {
    const out = filterFeed(feed, { scope: 'today', groups: [] }, NOW);

    expect(out).toHaveLength(1);
    // 7am counts even though it is more than 24h from nothing — it is today.
    expect(entryCount(out)).toBe(3);
  });

  it('a week includes today and the six days before it', () => {
    const out = filterFeed(feed, { scope: 'week', groups: [] }, NOW);

    expect(out.map((day) => day.date)).toEqual(['2026-08-13', '2026-08-10']);
  });

  it('a month reaches back further, and all time reaches everything', () => {
    expect(filterFeed(feed, { scope: 'month', groups: [] }, NOW)).toHaveLength(2);
    expect(filterFeed(feed, NO_FILTER, NOW)).toHaveLength(3);
  });

  it('drops a day whose every entry fell outside, rather than leaving it empty', () => {
    const out = filterFeed(feed, { scope: 'today', groups: [] }, NOW);

    expect(out.every((day) => day.entries.length > 0)).toBe(true);
  });

  it('labels every scope it offers', () => {
    for (const scope of LOG_SCOPES) {
      expect(scopeLabel(scope.key)).toBe(scope.label);
    }
  });
});

describe('what — the filter', () => {
  it('shows everything when nothing is picked, not nothing', () => {
    expect(entryCount(filterFeed(feed, NO_FILTER, NOW))).toBe(entryCount(feed));
  });

  it('groups kinds the way people ask for them, not the way the schema stores them', () => {
    const food = filterFeed(feed, { scope: 'all', groups: ['food'] }, NOW);

    // One protein log and one meal, both answering "have I been eating".
    expect(entryCount(food)).toBe(2);
  });

  it('answers the question this screen exists for: did I take my shots', () => {
    const doses = filterFeed(feed, { scope: 'all', groups: ['dose'] }, NOW);

    expect(entryCount(doses)).toBe(2);
    expect(doses.flatMap((day) => day.entries).every((e) => e.kind === 'dose')).toBe(true);
  });

  it('composes what with when', () => {
    const thisWeeksDoses = filterFeed(feed, { scope: 'week', groups: ['dose'] }, NOW);

    expect(entryCount(thisWeeksDoses)).toBe(1);
  });

  it('adds up when several groups are picked', () => {
    const out = filterFeed(feed, { scope: 'all', groups: ['dose', 'water'] }, NOW);

    expect(entryCount(out)).toBe(3);
  });

  it('turning the last group off clears the filter rather than emptying the list', () => {
    const one = toggleGroup(NO_FILTER, 'dose');
    expect(one.groups).toEqual(['dose']);

    const cleared = toggleGroup(one, 'dose');
    expect(cleared.groups).toEqual([]);
    expect(entryCount(filterFeed(feed, cleared, NOW))).toBe(entryCount(feed));
  });

  it('every kind belongs to exactly one group — nothing is unreachable', () => {
    const kinds = LOG_GROUPS.flatMap((group) => group.kinds);
    expect(new Set(kinds).size).toBe(kinds.length);

    const covered = new Set(kinds);
    for (const day of feed) {
      for (const item of day.entries) expect(covered.has(item.kind)).toBe(true);
    }
  });
});

describe('counts', () => {
  it('are per group and track the scope, so the numbers match the pill', () => {
    const all = groupCounts(feed, 'all', NOW);
    expect(all.dose).toBe(2);
    expect(all.food).toBe(2);

    const today = groupCounts(feed, 'today', NOW);
    expect(today.dose).toBe(1);
    expect(today.food).toBe(0);
  });

  it('report zero rather than omitting a group — "none this month" is an answer', () => {
    const counts = groupCounts(feed, 'today', NOW);

    for (const group of LOG_GROUPS) {
      expect(counts[group.key]).toBeGreaterThanOrEqual(0);
    }
    expect(counts.sideEffect).toBe(0);
  });
});

describe('what an empty result means', () => {
  it('says nothing has been logged when nothing is filtered', () => {
    expect(emptyLine(NO_FILTER)).toMatch(/nothing logged yet/i);
  });

  it('names the window when only the scope is set', () => {
    expect(emptyLine({ scope: 'week', groups: [] })).toBe('Nothing logged this week.');
  });

  it('names what was asked for, so filtered-out never reads as never-logged', () => {
    expect(emptyLine({ scope: 'month', groups: ['sideEffect'] })).toBe(
      'No side effects this month.',
    );
    expect(emptyLine({ scope: 'all', groups: ['dose', 'water'] })).toBe('No doses or water.');
  });

  it('knows whether a filter is on at all', () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ scope: 'week', groups: [] })).toBe(true);
    expect(isFiltered({ scope: 'all', groups: ['dose'] })).toBe(true);
  });
});
