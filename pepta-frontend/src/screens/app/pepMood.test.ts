import { describe, expect, it } from 'vitest';
import type { MedicationLevelResponse } from '@pepta/shared';
import { buildPepMood, levelFraction } from './pepMood';

function level(current: number, peak = 2.1, trough = 0.9): MedicationLevelResponse {
  return {
    compoundId: 'c1',
    compoundName: 'Tirzepatide',
    halfLifeDays: 5,
    currentEstimate: current,
    peakEstimate: peak,
    troughEstimate: trough,
    curve: [],
    nextDoseAt: null,
    hoursUntilNextDose: null,
    estimateBasis: 'relative-dose-equivalent',
    engineVersion: 'v1',
  } as MedicationLevelResponse;
}

describe('levelFraction', () => {
  it('places the current estimate between trough and peak', () => {
    expect(levelFraction(level(0.9))).toBe(0);
    expect(levelFraction(level(2.1))).toBe(1);
    expect(levelFraction(level(1.5))).toBeCloseTo(0.5, 2);
  });

  it('clamps readings outside the modelled band', () => {
    expect(levelFraction(level(3.0))).toBe(1);
    expect(levelFraction(level(0.1))).toBe(0);
  });

  it('reports unknown rather than dividing by zero on a flat curve', () => {
    expect(levelFraction(level(1.0, 1.0, 1.0))).toBeNull();
    expect(levelFraction(null)).toBeNull();
    expect(levelFraction(undefined)).toBeNull();
  });
});

describe('buildPepMood', () => {
  it('is bright near peak and quotes the real number', () => {
    const view = buildPepMood({ level: level(2.0) });
    expect(view.mood).toBe('peak');
    expect(view.line).toContain('2 mg');
  });

  it('goes drowsy near trough, and bobs slower than at peak', () => {
    const low = buildPepMood({ level: level(1.0) });
    const high = buildPepMood({ level: level(2.0) });
    expect(low.mood).toBe('drowsy');
    expect(low.pose).toBe('drowsy');
    expect(low.bobSeconds).toBeGreaterThan(high.bobSeconds);
  });

  it('sleeps through a rest week INSTEAD of reading as drowsy', () => {
    // During an off week the level is low by design; "drowsy" would imply
    // something is wrong rather than that the break is deliberate.
    const view = buildPepMood({ level: level(0.9), resting: true });
    expect(view.mood).toBe('resting');
    expect(view.pose).toBe('asleep');
    expect(view.line).toContain('Resting');
  });

  it('lets a milestone outrank both the curve and the rest week', () => {
    expect(buildPepMood({ level: level(0.9), resting: true, milestone: true }).mood)
      .toBe('celebrating');
  });

  it('stays neutral when there is no level model yet', () => {
    const view = buildPepMood({});
    expect(view.mood).toBe('steady');
    expect(view.pose).toBe('idle');
    expect(view.line).toBeUndefined();
  });

  it('NEVER produces a sad, scolding or disappointed mood', () => {
    // Load-bearing: a missed dose must not change how Pep looks. Shame can
    // push someone to double up, which is a medical risk.
    const moods = [
      buildPepMood({}),
      buildPepMood({ level: level(0.9) }),
      buildPepMood({ level: level(2.1) }),
      buildPepMood({ level: level(0.9), resting: true }),
      buildPepMood({ milestone: true }),
    ].map((v) => v.mood);

    expect(moods).not.toContain('sad');
    expect(moods).not.toContain('disappointed');
    for (const view of moods) {
      expect(['peak', 'steady', 'drowsy', 'resting', 'celebrating']).toContain(view);
    }
  });

  it('never writes a line that nags about a missed dose', () => {
    const lines = [
      buildPepMood({ level: level(0.9) }).line,
      buildPepMood({ level: level(2.1) }).line,
      buildPepMood({ level: level(0.9), resting: true }).line,
    ].filter(Boolean) as string[];

    for (const line of lines) {
      expect(line.toLowerCase()).not.toMatch(/missed|late|forgot|behind|should have/);
    }
  });
});
