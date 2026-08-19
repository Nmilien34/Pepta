import { describe, expect, it } from 'vitest';
import {
  PROGRESS_SCOPES,
  scopeCutoff,
  scopePillLabel,
  scopeStartSubtitle,
  withinScope,
} from './progressScope';

const NOW = new Date(2026, 7, 13, 14, 0, 0); // Thu Aug 13 2026
const STARTED = new Date(2026, 3, 4, 9, 0, 0).toISOString(); // Apr 4

describe('the pill names the window', () => {
  it('dates itself from the first log, rather than saying "All"', () => {
    // "Since Apr 4" is a fact the user recognises; "All" is a filter setting.
    expect(scopePillLabel('start', STARTED)).toBe('Since Apr 4');
  });

  it('falls back gracefully before there is anything to date it from', () => {
    expect(scopePillLabel('start', null)).toBe('Since you started');
  });

  it('uses the plain label for every fixed window', () => {
    expect(scopePillLabel('30d', STARTED)).toBe('Last 30 days');
    expect(scopePillLabel('90d', STARTED)).toBe('Last 90 days');
    expect(scopePillLabel('year', STARTED)).toBe('This year');
  });

  it('offers exactly the frame’s four options, in its order', () => {
    expect(PROGRESS_SCOPES.map((option) => option.label)).toEqual([
      'Since you started',
      'Last 30 days',
      'Last 90 days',
      'This year',
    ]);
  });
});

describe('the menu’s subtitle', () => {
  it('says the date and how long it has been', () => {
    expect(scopeStartSubtitle(STARTED, NOW)).toBe('Apr 4 · 18 weeks');
  });

  it('drops the duration in the first week — "0 weeks" says nothing', () => {
    const threeDaysAgo = new Date(2026, 7, 10, 9).toISOString();
    expect(scopeStartSubtitle(threeDaysAgo, NOW)).toBe('Aug 10');
  });

  it('is empty when nothing has been logged', () => {
    expect(scopeStartSubtitle(null, NOW)).toBe('');
  });
});

describe('what a scope covers', () => {
  it('clips nothing for "since you started" — the first log IS the start', () => {
    expect(scopeCutoff('start', NOW)).toBeNull();
  });

  it('counts calendar days including today, not a rolling window', () => {
    const cutoff = scopeCutoff('30d', NOW)!;
    // Midnight, 29 days back — so this morning's log survives tomorrow.
    expect(new Date(cutoff).getHours()).toBe(0);
    expect(new Date(cutoff).getDate()).toBe(15);
    expect(new Date(cutoff).getMonth()).toBe(6);
  });

  it('filters rows to the window, and leaves them alone at "start"', () => {
    const rows = [
      { datetime: new Date(2026, 7, 12).toISOString() },
      { datetime: new Date(2026, 5, 1).toISOString() },
    ];

    expect(withinScope(rows, '30d', NOW)).toHaveLength(1);
    expect(withinScope(rows, 'start', NOW)).toHaveLength(2);
  });
});
