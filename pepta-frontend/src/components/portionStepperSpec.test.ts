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

describe('recipe copy never promises what the recipe path refuses to do', () => {
  // The compiler guarantees every view HAS recipe wording; it cannot check the
  // wording is true. commit() saves a recipe and leaves today alone, so no
  // string in the recipe table may talk about logging, today, or Home.
  //
  // This is the rule the old code broke in three separate places.
  const recipeTable = (() => {
    const start = source.indexOf('  recipe: {', source.indexOf('const HEADINGS'));
    expect(start, 'the recipe copy table moved').toBeGreaterThan(-1);
    // to the closing brace of the recipe record
    const end = source.indexOf('\n  },\n};', start);
    return stripComments(source.slice(start, end));
  })();

  it.each([
    ['add it to today', /add it to today/i],
    ['macros landing on Home', /land on Home/i],
    ['logging', /\blog(ged|ging|s)?\b/i],
    ['what you ate', /what you ate/i],
  ])('says nothing about %s', (_label, pattern) => {
    expect(recipeTable).not.toMatch(pattern);
  });

  it('is a full table, not a partial one — omission must not compile', () => {
    // Partial<Record<…>> was the first attempt at this fix and it let a view
    // silently keep the meal copy, which is the entire bug.
    expect(source).toContain('Record<SheetIntent, Record<View_, Heading>>');
    expect(source).not.toContain('Partial<Record<View_');
  });

  it('derives the intent once rather than re-deriving per view', () => {
    expect(source).toContain('const intent: SheetIntent = keepAsRecipe ? "recipe" : "meal"');
  });
});

describe('the search view is a tall anchored sheet', () => {
  // Two bugs meet on this view.
  //
  // Keyboard avoidance is OFF for search, and that is deliberate: with it on,
  // the sheet lifted by the keyboard's full height and pushed the back button
  // under the status area. MealLogSheet.test.tsx pins that.
  //
  // But it also had NO height, so it was content-sized at bottom:0 — and a
  // ~340pt keyboard covered the whole sheet. A dimmed screen, a keyboard, and
  // nothing else. That is the state reached from New recipe -> Search foods.
  //
  // The height is what reconciles them: a tall anchored sheet keeps the
  // autofocused input near its top, clear of the keyboard, with the results
  // scrolling underneath. Nothing moves, so nothing is pushed off the top.
  // Fixing either half alone just swaps one defect for the other.

  it('gives search a fixed height, not a content-sized sheet', () => {
    expect(stripComments(source)).toContain(
      'height={view === "chooser" || view === "search" ? "84%" : undefined}',
    );
  });

  it('keeps avoidance off for search — the back button must stay put', () => {
    expect(stripComments(source)).toContain('avoidKeyboard={view !== "search"}');
  });

  it('still autofocuses the search input — the reason the height matters', () => {
    // If the autoFocus goes, re-read the coupling above rather than assuming
    // the constraint went with it.
    expect(source).toContain('autoFocus');
  });
});
