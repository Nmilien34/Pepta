import { describe, expect, it } from 'vitest';
import { doseCelebrationFor } from './doseCelebration';

const INJECTION_WORDS = /\b(shot|shots|inject\w*|syringe|vial|needle)\b/i;

describe('doseCelebrationFor', () => {
  it('makes the FIRST dose the moment the app starts working', () => {
    const c = doseCelebrationFor({ previousDoseCount: 0, noun: 'shot', tracksLevels: true });
    expect(c.title).toBe('You did it!');
    expect(c.line).toContain('First shot logged');
    expect(c.line).toContain('medication level');
    expect(c.burst).toBe(true);
  });

  it('does not promise a curve to someone who will never see one', () => {
    // Oral and unmodelled compounds have their level suppressed; congratulating
    // them on level tracking would be a lie the next screen contradicts.
    const c = doseCelebrationFor({ previousDoseCount: 0, noun: 'dose', tracksLevels: false });
    expect(c.line).not.toContain('medication level');
    expect(c.line).toContain('next-dose timing');
  });

  it('never uses injection language for an oral user', () => {
    for (const previousDoseCount of [0, 3, 9, 24]) {
      const c = doseCelebrationFor({ previousDoseCount, noun: 'dose', tracksLevels: false });
      expect(`${c.title} ${c.line}`).not.toMatch(INJECTION_WORDS);
    }
  });

  it('celebrates every log, per the brief', () => {
    for (const previousDoseCount of [0, 1, 5, 37]) {
      expect(
        doseCelebrationFor({ previousDoseCount, noun: 'shot', tracksLevels: true }).burst,
      ).toBe(true);
    }
  });

  it('marks the milestones', () => {
    for (const n of [10, 25, 50, 100]) {
      const c = doseCelebrationFor({
        previousDoseCount: n - 1,
        noun: 'shot',
        tracksLevels: true,
      });
      expect(c.title).toBe(`${n} logged`);
      expect(c.line).toContain(`${n} shots`);
    }
  });

  it('stays short and warm on an ordinary log', () => {
    const c = doseCelebrationFor({ previousDoseCount: 4, noun: 'shot', tracksLevels: true });
    expect(c.title).toBe('Logged');
    // No "congratulations" on dose five — the words have to keep pace with the
    // effort or the celebration becomes wallpaper.
    expect(c.line.length).toBeLessThan(60);
  });

  it('never claims a count it was not given', () => {
    const c = doseCelebrationFor({ previousDoseCount: 3, noun: 'shot', tracksLevels: true });
    expect(c.line).not.toMatch(/\d/);
  });
});
