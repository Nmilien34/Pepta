// The examples screens' "Yours" card, and the "Today" header above it.
//
// Both misses on these screens came from the same habit: reading a frame's
// `style="..."` and skipping what its CLASSES contribute.
//
//   Today's header is written `<div class="ch"><svg class="tin ic" ...>`.
//   The chip is in `ic`, not in the inline style, so an app-wide chip pass
//   that grepped inline styles walked straight past it.
//
//   The Yours card is a `.card` of two `.row`s. Nothing inline says "two" —
//   the SHAPE says it, and the water build shipped one row.
//
// Reads sources as text: a `.ts` test cannot import a `.tsx`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

const yours = read('YoursBlock.tsx');
const nutrient = read('NutrientWaysScreen.tsx');
const favourites = read('FavouritesScreen.tsx');

describe("the nutrient screens' Today header wears the .ic chip", () => {
  // Protein writes `class="tin ic" style="color:var(--protein)"`, Fiber the
  // same with `--fiber`. One header, one accent per nutrient — and it shipped
  // as a bare glyph, so the card that carries the screen's whole point had no
  // colour identity at all.
  it('renders the header glyph as a CardIcon in the nutrient accent', () => {
    expect(nutrient).toContain(
      "<CardIcon name={kind === 'fiber' ? 'leaf' : 'food-drumstick'} color={tint} />",
    );
  });

  it('leaves no bare glyph of the same icon behind', () => {
    expect(nutrient).not.toContain("<Icon name={kind === 'fiber' ? 'leaf' : 'food-drumstick'}");
  });

  it('tints it from the screen, not from a fixed colour', () => {
    // `tint` is protein or fiber depending on `kind`; a literal here would
    // give both screens the same header.
    expect(nutrient).toContain("const tint = kind === 'fiber' ? theme.colors.fiber : theme.colors.protein");
  });
});

describe('the Yours card always has two rows', () => {
  // Protein / Fiber:  Build a recipe  ·  Favourites
  // Water:            Favourites      ·  Add your own
  //
  // Water has no recipes, and the frame fills the gap rather than leaving the
  // card one row short. "Add your own" shipped missing entirely, so naming a
  // drink Pepta does not stock meant finding an unrelated section at the foot
  // of Favourites.
  it('offers Add your own on the drinks side', () => {
    expect(yours).toContain("{noun === 'drink' ? (");
    expect(yours).toContain('Add your own');
  });

  it('carries the copy the frame writes under it', () => {
    expect(yours).toContain('Name it, set the volume, log it in a tap');
  });

  it('draws its tile and glyph like the rows either side of it', () => {
    const row = yours.slice(yours.indexOf("{noun === 'drink' ? ("));
    expect(row).toContain('width: 44');
    expect(row).toContain('borderRadius: 14');
    expect(row).toContain('<Icon name="add" size={19}');
    expect(row).toContain('<Icon name="chevron-forward" size={17}');
  });

  it('rules Favourites off when Add your own follows it', () => {
    // Only the LAST row goes without a hairline. Favourites is last on
    // protein and fiber, second-to-last on water, so its rule is conditional
    // rather than absent — which is how it shipped.
    expect(yours).toContain("borderBottomWidth: noun === 'drink' ? 0.5 : 0");
  });

  it('keeps Build a recipe off the drinks side', () => {
    // The recipe row is gated on the callback, which water does not pass.
    expect(yours).toContain('{onRecipes ? (');
    expect(yours).toContain('/** Omitted on the water screen — recipes are food. */');
  });

  it('types the noun so the row cannot be handed a side it has no door for', () => {
    // `noun` doubles as the discriminator. As a bare `string` a typo would
    // silently drop the row rather than fail the build.
    expect(yours).toContain("noun: 'eat' | 'drink'");
  });
});

describe('Add your own goes to the sheet, not to a list', () => {
  // The row names an action. Landing on Favourites and making the user scroll
  // to find the add section would make the label a lie, so it carries a param
  // that opens the sheet on arrival.
  it('navigates with the drinks side and the sheet already open', () => {
    expect(yours).toContain("navigation.navigate('Favourites', { kind: 'drink', addNew: true })");
  });

  it('declares addNew on the route params', () => {
    expect(favourites).toContain('addNew?: boolean');
  });

  it('opens the sheet from it on arrival', () => {
    expect(favourites).toContain('useState(route.params?.addNew === true)');
  });
});
