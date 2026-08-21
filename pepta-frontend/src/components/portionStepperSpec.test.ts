// The portion stepper, after a voice log pushed the + button off the screen.
//
// The row was:
//
//   [ Portion ]            [ − ]  {portion} × {servingSize}  [ + ]
//
// with `minWidth: 64` on the value and no maximum. For a barcode or a typed
// food the serving is short ("1 cup") and it looked fine. For a VOICE log the
// model returns a whole sentence — "1 omelet (2 eggs, 1/2 cup asparagus, 1/2
// cup tomatoes)" — and the value simply grew: the + button was shoved past the
// right screen edge and the text wrapped onto two centred lines inside a pill.
//
// The layout bug and the content bug are the same bug. That serving string is
// ALREADY printed in full immediately above the stepper ("… · detected"), so
// the row was rendering a long description twice and paying for it in layout.
// A stepper's value is the count.
//
// These pin both halves: the value stays compact, and the serving keeps its
// one legitimate home.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'MealLogSheet.tsx'), 'utf8');

/** Comments explain the bug and necessarily quote the broken code, so every
 *  assertion below runs against the JSX with comments removed. Without this a
 *  test that bans `{a.servingSize}` is tripped by the note saying why. */
const stripComments = (code: string) =>
  code.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

/** Just the stepper, so an assertion cannot be satisfied by another row. */
const stepper = (() => {
  const start = source.indexOf('{/* portion stepper');
  expect(start, 'the portion stepper comment moved').toBeGreaterThan(-1);
  const end = source.indexOf('source === "voice"', start);
  return stripComments(source.slice(start, end > start ? end : start + 3000));
})();

describe('the portion stepper shows a count, not a sentence', () => {
  it('renders the multiplier alone', () => {
    expect(stepper).toContain('{portion}×');
  });

  it('does NOT render the serving size inside the stepper', () => {
    // This is the whole defect. Any serving string here is unbounded in
    // length, because it comes from a language model.
    // Checks the RENDERED expression, not the word — the comment above this
    // stepper explains the bug and necessarily names it.
    expect(stepper).not.toContain('{a.servingSize}');
    expect(stepper).not.toMatch(/\{\s*portion\s*\}\s*×\s*\{/);
  });

  it('keeps the value on one line', () => {
    // Belt and braces: even a long count must not wrap the pill.
    expect(stepper).toContain('numberOfLines={1}');
  });

  it('lets the value group shrink instead of overflowing its row', () => {
    // Without minWidth: 0 a flex row refuses to shrink its children below
    // their content width, which is what let the + leave the screen.
    expect(stepper).toContain('flexShrink: 1');
    expect(stepper).toContain('minWidth: 0');
  });

  it('still has both buttons, and the + after the value', () => {
    expect(stepper).toContain('step(-1)');
    expect(stepper).toContain('step(1)');
    expect(stepper.indexOf('{portion}×')).toBeLessThan(stepper.indexOf('step(1)'));
  });
});

describe('the serving size keeps its one home', () => {
  it('is still shown in full above the stepper', () => {
    // Removing it from the stepper must not remove it from the screen — the
    // user still needs to see what the model thought they ate.
    expect(source).toContain('{a.servingSize} · detected');
  });

  it('appears in exactly one rendered position for this estimate', () => {
    // Two renderings is what caused this. `r.servingSize` on the alternatives
    // list is a different row and is left alone.
    const rendered = [...source.matchAll(/\{a\.servingSize\}/g)];
    expect(rendered).toHaveLength(1);
  });
});
