import { describe, expect, it } from 'vitest';
import { RAMP_STYLES } from '../../utils/hapticRamp';
import {
  CLIP_X_BY_FRACTION,
  CURVED_EFFECTS,
  CURVE_LENGTH,
  DRAW_DURATION_MS,
  EASING_LABEL_AT,
  PEAK_LABEL_AT,
  drawMarks,
  symptomForWeekBeat,
  symptomWeekTitle,
} from './symptomWeek';

describe('symptomForWeekBeat', () => {
  it('skips the beat when they reported nothing', () => {
    // "None yet" comes through as an empty selection. Drawing a nausea curve
    // for someone with no symptoms reads as being told what is coming.
    expect(symptomForWeekBeat([])).toBeNull();
    expect(symptomForWeekBeat(undefined)).toBeNull();
  });

  it('skips when nothing they picked follows this arc', () => {
    // An injection-site reaction does not rise and ease with the dose, so a
    // GI curve would be a non-sequitur — the same rule that keeps the
    // lean-mass bars away from users who are not dosing.
    expect(symptomForWeekBeat(['injection_site_reaction'])).toBeNull();
    expect(symptomForWeekBeat(['other'])).toBeNull();
    expect(symptomForWeekBeat(['injection_site_reaction', 'other'])).toBeNull();
  });

  it('draws the curve when at least one pick does follow it', () => {
    expect(symptomForWeekBeat(['other', 'nausea'])).toBe('nausea');
    expect(symptomForWeekBeat(['injection_site_reaction', 'fatigue'])).toBe('fatigue');
  });

  it('titles the card with their most dose-linked pick, not their first', () => {
    // Selection order is whatever they happened to tap; the curve should be
    // labelled with the symptom it describes best.
    expect(symptomForWeekBeat(['headache', 'nausea'])).toBe('nausea');
    expect(symptomForWeekBeat(['constipation', 'diarrhea'])).toBe('diarrhea');
  });

  it('names every curved effect it is willing to title', () => {
    for (const effect of CURVED_EFFECTS) {
      const title = symptomWeekTitle(effect);
      expect(title).toMatch(/ after a dose change$/);
      expect(title.startsWith('Side effects')).toBe(false); // no unnamed fallbacks
    }
  });
});

describe('the draw', () => {
  it('is slow enough to be watched being traced', () => {
    // Same call as the lean-mass bars. If this drops back near a second, the
    // curve stops reading as drawn and starts reading as appearing.
    expect(DRAW_DURATION_MS).toBeGreaterThan(1800);
    expect(DRAW_DURATION_MS).toBeLessThan(3000);
  });

  it('hides the whole line at rest', () => {
    // CURVE_LENGTH is the dash length. Under-measure it and a stub of curve
    // sits on screen before the draw begins; the real path measures 345.1.
    expect(CURVE_LENGTH).toBeGreaterThanOrEqual(346);
    expect(CURVE_LENGTH).toBeLessThan(360); // over-measuring stalls the start
  });

  it('marks the crest and the settle, in order and within the path', () => {
    const marks = drawMarks();
    expect(marks.length).toBeGreaterThan(0);
    let previous = 0;
    for (const mark of marks) {
      expect(mark.at).toBeGreaterThan(previous);
      expect(mark.at).toBeLessThanOrEqual(1);
      expect(RAMP_STYLES).toContain(mark.haptic);
      previous = mark.at;
    }
    expect(marks[marks.length - 1]!.at).toBe(1);
  });

  it('reveals each label only after the line has passed it', () => {
    // The crest sits at 0.30 of the measured path length and the tail begins
    // at 0.86. A label that appears early points at empty space.
    expect(PEAK_LABEL_AT).toBeGreaterThan(0.3);
    expect(EASING_LABEL_AT).toBeGreaterThan(0.86);
    expect(PEAK_LABEL_AT).toBeLessThan(EASING_LABEL_AT);
  });

  it('sweeps the fill clip along the line, not linearly across the box', () => {
    // The bug this guards: a linear sweep leads the stroke by 22px at the
    // crest, because the steep rise burns path length without moving in x.
    const { inputRange, outputRange } = CLIP_X_BY_FRACTION;
    expect(inputRange).toHaveLength(outputRange.length);
    for (let i = 1; i < inputRange.length; i += 1) {
      expect(inputRange[i]!).toBeGreaterThan(inputRange[i - 1]!);
      expect(outputRange[i]!).toBeGreaterThan(outputRange[i - 1]!);
    }
    expect(inputRange[0]).toBe(0);
    expect(inputRange[inputRange.length - 1]).toBe(1);
    // Ends match the path's own endpoints, and the middle lags a linear sweep.
    expect(outputRange[0]).toBe(8);
    expect(outputRange[outputRange.length - 1]).toBe(292);
    const atCrest = outputRange[3]!; // fraction 0.3
    expect(atCrest).toBeLessThan(0.3 * 300);
  });
});
