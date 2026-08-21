// Recipes, New recipe and Favourites, against their frames.
//
// design-lab/hub-new-screens.html draws these three as one family of stack
// screens, and a conformance pass over them shipped WITHOUT A SINGLE TEST.
// Everything below was found by reading the frames' CSS CLASSES rather than
// their inline styles — which is where every one of these misses came from:
//
//   `<span class="h1" style="font-size:24px">` is only half the spec. `.h1`
//   is the other half, and reading the inline half alone is how five screens
//   shipped their title at `screenTitle`'s 34.
//
// So these assertions pin the CLASS-derived values, not just the inline ones.
// They read the sources as text, the house style for this folder: a `.ts` test
// cannot import a `.tsx` or anything that reaches react-native.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

const recipes = read('RecipesScreen.tsx');
const newRecipe = read('NewRecipeScreen.tsx');
const favourites = read('FavouritesScreen.tsx');
const water = read('WaterScreen.tsx');
const nutrientWays = read('NutrientWaysScreen.tsx');

describe('the three stack screens share one title size', () => {
  // Every frame that draws one of these writes `class="h1" style="font-size:24px"`
  // — Recipes · your list, Recipes · start one, and all three Favourites
  // frames (food, drinks, first run). `screenTitle` is 34, so each site has to
  // say 24 explicitly.
  //
  // Water · log & hydration and Protein/Fiber · ways to hit it specify the
  // same 24 and are now fixed too, so all five are covered here. Every `.h1`
  // in the hub is 24px inline; the only exceptions are the item-detail frames
  // (24 with an explicit line-height) and "What to show" at 22.
  //
  // The real shape of this: 24 sites now override to 24 and only a handful use
  // screenTitle bare, so the 34 default is the odd one out. Changing it moves
  // ScreenHeader, which many screens share, so it is a deliberate follow-up
  // rather than something to slip in — see the audit notes.
  const TITLED: Array<[name: string, source: string, title: string]> = [
    ['Recipes', recipes, 'Recipes'],
    ['New recipe', newRecipe, 'New recipe'],
    ['Favourites', favourites, 'Favourites'],
    ['Water', water, 'Water'],
    ['Protein/Fiber', nutrientWays, '\\{TITLES\\[kind\\]\\}'],
  ];

  it.each(TITLED)('%s renders its title at 24', (_name, source, title) => {
    const decl = new RegExp(
      `<AppText variant="screenTitle" style=\\{\\{ fontSize: 24 \\}\\}>${title}<`,
    );
    expect(source).toMatch(decl);
  });

  it('leaves none of them on the unmodified 34', () => {
    for (const [, source] of TITLED) {
      expect(source).not.toContain('<AppText variant="screenTitle">');
    }
  });
});

describe("Recipes' header action is the frame's pill, not a bare link", () => {
  // `.pill` — a var(--alt) fill with a var(--ts) label — and a 13px plus.
  // It shipped as plain purple text, which put a second primary-coloured
  // element in a header that already has one job.
  const header = recipes.slice(0, recipes.indexOf('{!hydrated'));

  it('fills the pill with --alt', () => {
    expect(header).toContain('backgroundColor: theme.colors.surfaceAlt');
    expect(header).toContain('borderRadius: theme.radii.pill');
  });

  it('labels it in --ts, never primary', () => {
    expect(header).toContain('<AppText variant="caption" color="textSecondary"');
    expect(header).not.toContain('theme.colors.primary');
  });

  it('sets the plus at 13, the size the frame draws', () => {
    expect(header).toContain('<Icon name="add" size={13} color={theme.colors.textSecondary}');
  });
});

describe('the food tint comes from the token, never a literal', () => {
  // #FFF1E6 was hardcoded in four screens before it was centralised into
  // theme.colors.foodTint, which is dark-aware; a literal is invisible-on-
  // invisible in dark mode.
  it.each([
    ['RecipesScreen.tsx', recipes],
    ['NewRecipeScreen.tsx', newRecipe],
    ['FavouritesScreen.tsx', favourites],
  ])('%s hardcodes no #FFF1E6', (_file, source) => {
    expect(source).not.toContain('FFF1E6');
  });

  it('tints the Log pill on a saved recipe with it', () => {
    // The frame gives Log the warm food fill with a --protein label; it
    // shipped on --alt, which made the one affordance on the row read as
    // disabled.
    const log = recipes.slice(recipes.indexOf('accessibilityLabel={`Log ${recipe.name}`}'));
    expect(log).toContain('backgroundColor: theme.colors.foodTint');
    expect(log).toContain('color: theme.colors.protein');
  });
});

describe("New recipe's three route tiles carry the food cue", () => {
  // The frame's only colour on this screen: a warm-peach 44pt tile with a
  // protein glyph, one per route. They shipped in the app's purple, which
  // made the screen look like Settings.
  it('offers the three routes the frame draws', () => {
    expect(newRecipe).toContain("key: 'scan'");
    expect(newRecipe).toContain("key: 'voice'");
    expect(newRecipe).toContain("key: 'search'");
  });

  it('gives the tile the food tint and the glyph the protein accent', () => {
    expect(newRecipe).toContain('backgroundColor: theme.colors.foodTint');
    expect(newRecipe).toContain('<Icon name={r.icon} size={20} color={theme.colors.protein}');
    expect(newRecipe).not.toContain('<Icon name={r.icon} size={20} color={theme.colors.primary}');
  });

  it('draws the tile at 44 with a 14 radius', () => {
    // Bounded to the tile's own style object, so a 44 elsewhere on the screen
    // cannot satisfy this.
    const fill = newRecipe.indexOf('backgroundColor: theme.colors.foodTint');
    expect(fill).toBeGreaterThan(-1);
    const tile = newRecipe.slice(newRecipe.lastIndexOf('style={{', fill), fill);
    expect(tile).toContain('width: 44');
    expect(tile).toContain('height: 44');
    expect(tile).toContain('borderRadius: 14');
  });
});

describe('Favourites · first run centres its empty card on a star tile', () => {
  // The frame:
  //   .card + padding:26px 18px + text-align:center
  //   52x52 tile, border-radius:18, background var(--alt)
  //   star glyph, font-size:23px, color var(--tt)
  //   .nm mt12 font-size:15px   "Nothing saved yet"
  //   .lab mt6 font-size:11px line-height:1.45
  //
  // It shipped as two left-aligned lines of text in a default 16pt card with
  // no tile at all — the one state every new user meets, looking like content
  // that failed to load rather than a deliberate empty state.
  // Just the empty branch, so nothing here can match the saved-rows card
  // above it: from the `:` of the ternary to the end of the body copy.
  const empty = (() => {
    const marker = favourites.indexOf('Nothing saved yet');
    expect(marker).toBeGreaterThan(-1);
    const start = favourites.lastIndexOf(') : (', marker);
    const end = favourites.indexOf('that it is one tap.', marker);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return favourites.slice(start, end);
  })();

  it('centres the card and opens it out to 26/18', () => {
    expect(empty).toContain('paddingVertical: 26');
    expect(empty).toContain('paddingHorizontal: 18');
    expect(empty).toContain("alignItems: 'center'");
    expect(empty).toContain("textAlign: 'center'");
  });

  it('draws the 52pt --alt tile', () => {
    expect(empty).toContain('width: 52');
    expect(empty).toContain('height: 52');
    expect(empty).toContain('borderRadius: 18');
    expect(empty).toContain('backgroundColor: theme.colors.surfaceAlt');
  });

  it('puts a 23px star in it, in --tt', () => {
    expect(empty).toContain('<Icon name="star" size={23} color={theme.colors.textTertiary}');
  });

  it('is NOT a CardIcon chip', () => {
    // `.ic` is an 18px glyph on a 35pt box tinted from its own accent. This
    // is a 52pt --alt square with a grey glyph — a different thing that a
    // chip pass would happily "fix" into being wrong.
    expect(empty).not.toContain('<CardIcon');
  });

  it('sets the two lines at the sizes the classes give them', () => {
    // .nm at 15 with mt12, .lab at 11 with mt6 and 1.45 line-height (= 16).
    expect(empty).toContain('style={{ fontSize: 15, marginTop: 12');
    expect(empty).toContain('fontSize: 11, marginTop: 6, lineHeight: 16');
  });
});
