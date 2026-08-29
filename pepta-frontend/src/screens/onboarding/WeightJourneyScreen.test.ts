// The merged start+goal weight screen.
//
// journeyLine is the reason the merge is worth more than the screen it saves:
// "24 lb down, 46 to go" is the one sentence neither screen could say alone,
// because neither held both numbers.
//
// It also carries the invariant that used to be a STEP GATE. startWeight was
// skipped for anyone not already dosing, on the grounds that defaulting a
// start weight nobody gave us is how a progress chart quietly invents a loss.
// That gate is now a field on this screen, so the assertion moves here.
import { describe, expect, it } from 'vitest';
import { journeyLine } from './weightJourney';

describe('the live journey line', () => {
  it('states both halves when both are true', () => {
    expect(journeyLine(250, 226, 180, 'lb', true)).toBe('24 lb down, 46 to go.');
  });

  it('never invents a loss for someone who has not started', () => {
    // showStart false: the started-at field is hidden, so claiming progress
    // against it would be a number the user never gave.
    expect(journeyLine(226, 226, 180, 'lb', false)).toBe('46 to go.');
    // Even with a start weight present, a hidden field cannot be reported on.
    expect(journeyLine(250, 226, 180, 'lb', false)).toBe('46 to go.');
  });

  it('drops the "down" half rather than reporting a gain as progress', () => {
    expect(journeyLine(220, 226, 180, 'lb', true)).toBe('46 to go.');
    // Exactly at the start weight is not a loss either.
    expect(journeyLine(226, 226, 180, 'lb', true)).toBe('46 to go.');
  });

  it('drops the "to go" half once they are at or past the goal', () => {
    expect(journeyLine(250, 180, 180, 'lb', true)).toBe('70 lb down.');
    expect(journeyLine(250, 175, 180, 'lb', true)).toBe('75 lb down.');
  });

  it('says nothing rather than something empty', () => {
    // No loss and no distance left: a line here would be filler.
    expect(journeyLine(180, 180, 180, 'lb', true)).toBeNull();
  });

  it('carries the unit through', () => {
    expect(journeyLine(113, 102, 82, 'kg', true)).toBe('11 kg down, 20 to go.');
  });
});
