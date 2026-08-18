import { describe, expect, it } from 'vitest';
import { doseCtaExpanded, parseDoseCtaFold, type DoseCtaFold } from './doseCtaFold';

const TODAY = '2026-08-17';

describe('doseCtaExpanded', () => {
  it('opens on its own on a dose day — the point of the whole thing', () => {
    expect(doseCtaExpanded(true, null, TODAY)).toBe(true);
  });

  it('stays shut for the rest of the day once closed', () => {
    expect(doseCtaExpanded(true, { day: TODAY }, TODAY)).toBe(false);
  });

  it('lapses at midnight, so the next dose day opens itself again', () => {
    expect(doseCtaExpanded(true, { day: '2026-08-16' }, TODAY)).toBe(true);
  });

  it('has nothing to open when no dose is wanted', () => {
    expect(doseCtaExpanded(false, null, TODAY)).toBe(false);
    expect(doseCtaExpanded(false, { day: TODAY }, TODAY)).toBe(false);
  });

  it('is not confused by a stale fold dated in the future', () => {
    // Clock changes and timezone travel can both produce this. Only an exact
    // match for today suppresses; anything else has lapsed or not happened.
    expect(doseCtaExpanded(true, { day: '2026-08-18' }, TODAY)).toBe(true);
  });
});

describe('parseDoseCtaFold', () => {
  it('round-trips a real fold', () => {
    const fold: DoseCtaFold = { day: TODAY };
    expect(parseDoseCtaFold(JSON.stringify(fold))).toEqual(fold);
  });

  it('reads anything malformed as "not closed" rather than throwing', () => {
    for (const raw of [
      null,
      '',
      'not json',
      '[]',
      'null',
      '{}',
      '{"day":123}',
      '{"day":"17-08-2026"}',
      '{"day":"2026-8-17"}',
    ]) {
      expect(parseDoseCtaFold(raw), `raw=${String(raw)}`).toBeNull();
    }
  });

  it('never leaves the section stuck shut on a corrupt blob', () => {
    // The failure that matters: a bad read must not hide the logging action.
    expect(doseCtaExpanded(true, parseDoseCtaFold('{"day":'), TODAY)).toBe(true);
  });
});
