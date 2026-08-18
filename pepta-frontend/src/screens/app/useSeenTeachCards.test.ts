import { describe, expect, it } from 'vitest';
import { parseFold, TEACH_FOLD_KEY, TEACH_SEEN_KEY } from './useSeenTeachCards';

describe('parseFold', () => {
  it('reads a fold written by setFold', () => {
    expect(
      parseFold(JSON.stringify({ entryId: 'aod-9604', day: '2026-08-13', collapsed: true })),
    ).toEqual({ entryId: 'aod-9604', day: '2026-08-13', collapsed: true });
    expect(
      parseFold(JSON.stringify({ entryId: 'aod-9604', day: '2026-08-13', collapsed: false })),
    ).toEqual({ entryId: 'aod-9604', day: '2026-08-13', collapsed: false });
  });

  it('reads anything malformed as “nothing folded”, never a throw', () => {
    // Worst case is one card that opens expanded. A throw here would be a
    // blank Home screen, which is not a trade worth making for a fold.
    for (const raw of [
      null,
      '',
      'not json',
      '{}',
      '[]',
      '"aod-9604"',
      JSON.stringify({ entryId: 'aod-9604' }), // no day
      JSON.stringify({ day: '2026-08-13' }), // no entry
      JSON.stringify({ entryId: 'aod-9604', day: '2026-08-13' }), // no collapsed flag
      JSON.stringify({ entryId: '', day: '2026-08-13', collapsed: true }),
      JSON.stringify({ entryId: 'aod-9604', day: 'yesterday', collapsed: true }),
      JSON.stringify({ entryId: 'aod-9604', day: 1_755_000_000, collapsed: true }),
    ]) {
      expect(parseFold(raw)).toBeNull();
    }
  });

  it('rejects a day that is not a plain local date', () => {
    // An ISO timestamp would compare unequal to localDateOnly's output every
    // time, so a fold stored that way would look permanently lapsed.
    expect(
      parseFold(JSON.stringify({ entryId: 'x', day: '2026-08-13T00:00:00.000Z', collapsed: true })),
    ).toBeNull();
  });

  it('keeps the fold in its own key, separate from the permanent seen list', () => {
    expect(TEACH_FOLD_KEY).not.toBe(TEACH_SEEN_KEY);
  });
});
