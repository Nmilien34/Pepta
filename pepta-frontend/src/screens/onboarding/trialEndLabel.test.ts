import { describe, expect, it } from 'vitest';
import { trialEndLabel } from './trialEndLabel';

// A term ("3 days") is a condition; a date ("through Saturday") is something
// you own until then. The label is parsed from the LIVE offering, so it must
// cope with whatever shape that duration arrives in.
describe('trialEndLabel', () => {
  const wed = new Date('2026-08-19T12:00:00Z'); // a Wednesday

  it('names the weekday for a trial inside one week', () => {
    expect(trialEndLabel('3 days', wed)).toMatch(/day$/);
  });

  it('falls back to a date once a weekday would be ambiguous', () => {
    // "next next Tuesday" helps nobody; past 6 days a date is clearer.
    expect(trialEndLabel('14 days', wed)).toMatch(/\d/);
  });

  it('passes the label straight through when the shape is unrecognised', () => {
    // e.g. a "1 week" or "1 month" intro — better to say the term we were
    // given than to compute a date from a guess.
    expect(trialEndLabel('1 week', wed)).toBe('1 week');
    expect(trialEndLabel('', wed)).toBe('');
  });

  it('never invents a date from a zero or negative duration', () => {
    expect(trialEndLabel('0 days', wed)).toBe('0 days');
  });
});
