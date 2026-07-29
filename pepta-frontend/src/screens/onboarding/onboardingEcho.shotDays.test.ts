// Pinned to Nick's TestFlight report (2026-07-28): picked Tue/Wed/Sat on the
// shot-day turn, and the next screen said "Tuesdays it is." — the data was
// stored in full, but the echo named only shotDays[0], which reads exactly
// like the answer was dropped.
import { describe, expect, it } from 'vitest';
import { shotDaysCompact, shotDaysEcho, instrumentContext } from './onboardingEcho';

const TUE = 2, WED = 3, SAT = 6;

describe('shotDaysEcho', () => {
  it('names every chosen day, not just the first', () => {
    expect(shotDaysEcho([TUE, WED, SAT])).toBe(
      'Tuesdays, Wednesdays and Saturdays. All three locked in.',
    );
  });

  it('keeps the one-day and two-day phrasings natural', () => {
    expect(shotDaysEcho([SAT])).toBe('Saturdays it is.');
    expect(shotDaysEcho([TUE, SAT])).toBe('Tuesdays and Saturdays it is.');
  });

  it('sorts whatever order the taps came in', () => {
    expect(shotDaysEcho([SAT, TUE])).toBe('Tuesdays and Saturdays it is.');
  });

  it('falls back gracefully with nothing chosen', () => {
    expect(shotDaysEcho(undefined)).toBe('Shot day set.');
    expect(shotDaysEcho([])).toBe('Shot day set.');
  });
});

describe('instrumentContext with multiple shot days', () => {
  it('lists the days compactly instead of naming only the first', () => {
    const context = instrumentContext({
      medication: { name: 'Tirzepatide', doseUnit: 'mg' } as never,
      dose: 5 as never,
      shotDays: [TUE, WED, SAT],
    });
    expect(context).toBe('Tirzepatide · 5 mg · Tue, Wed & Sat.');
  });

  it('keeps the plural single-day form', () => {
    expect(shotDaysCompact([SAT])).toBe('Saturdays');
  });
});
