// The Progress screen asked the server for the wrong amount of history.
//
// Two different windows were being conflated. `weightSeries` cuts an
// already-downloaded payload for DISPLAY. The SERVER has its own default —
// DEFAULT_LOOKBACK_DAYS = 30 in crud.service.ts — applied whenever /progress
// is called with no `from`.
//
// ProgressScreen mounts with scope 'start' ("Since you started") and called
// `refreshProgress()` with no argument. So the screen's own default view
// claimed to show everything while holding thirty days. Only CHANGING the
// pill ever sent a window — and the comment on that line already says why it
// had to ("older logs looked deleted"). The mount path was never fixed.
//
// For an account older than a month this erases the user's history: the
// onboarding weigh-in sits outside the window, so the earliest weight the
// screen can see is a recent one. That produces exactly what was reported —
// a chart that will not move, "Difference 0 lb" measured from today's weight,
// and 0% to goal.

import { describe, expect, it } from 'vitest';
import { scopeWindowDays } from './progressScope';

describe('the window the server is asked for matches the scope shown', () => {
  it('asks for EVERYTHING on the default scope', () => {
    // The failure that was reported. 'start' is the initial scope, so this is
    // the request every user makes on first open.
    expect(scopeWindowDays('start')).toBe(Infinity);
  });

  it('never silently falls back to the server default', () => {
    // Any finite-but-wrong answer here is the bug in a new costume: the
    // screen would still be showing less than it claims.
    for (const scope of ['start', '30d', '90d', 'year'] as const) {
      expect(scopeWindowDays(scope)).toBeGreaterThanOrEqual(30);
    }
  });

  it('maps the narrower scopes to their own spans', () => {
    expect(scopeWindowDays('30d')).toBe(30);
    expect(scopeWindowDays('90d')).toBe(90);
    expect(scopeWindowDays('year')).toBe(365);
  });

  it('asks for at least as much as it will display', () => {
    // The display cut must never be wider than the fetch, or the screen shows
    // a window it does not have the data to fill.
    const display = { start: Infinity, '30d': 30, '90d': 90, year: 365 } as const;
    for (const scope of ['start', '30d', '90d', 'year'] as const) {
      expect(scopeWindowDays(scope)).toBeGreaterThanOrEqual(display[scope]);
    }
  });
});
