// Item detail, against its three frames ("Item detail · top / scrolled / a
// drink" in design-lab/hub-new-screens.html).
//
// WHY A TEXT TEST. ItemDetailScreen.test.tsx already proves the screen behaves
// — the stepper drives every number, the button writes the right log. None of
// that catches a card that has drifted away from its frame, because a wrong
// padding still logs the right meal. This file pins the SHAPE, and it exists
// because seven separate shape defects shipped at once and every one of them
// survived a green behaviour suite.
//
// It reads the screen as text on purpose: a .ts test cannot import a .tsx (the
// react-native graph dies on "Unexpected token 'typeof'"), and the house style
// for spec tests is to assert against the source. See cardHeaderSpec.test.ts.
//
// Each assertion below names the frame value it defends. Sizes and paddings
// that the frame does NOT specify are deliberately left unpinned — a future
// restyle should be free to move them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'ItemDetailScreen.tsx'), 'utf8');

/** The source between two markers, so an assertion cannot match another card. */
function between(from: string, to: string): string {
  const a = src.indexOf(from);
  expect(a, `marker not found: ${from}`).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, `end marker not found: ${to}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe('the log CTA wears the number it moves', () => {
  // FRAME: all three end with
  //   background:var(--protein)|var(--water); border-radius:17px;
  //   padding:15px 0; color:#fff; font-weight:800; font-size:14.5px
  // It shipped as the shared <Button variant="primary"> — a 56pt pill filled
  // with the #6751E8→#8C63F4 brand gradient. The brand colour told the user
  // nothing about WHICH of today's numbers the tap was about to move, which is
  // the one thing this screen exists to say.
  const cta = between('THE CTA WEARS THE NUMBER IT MOVES', '/** A control that sits on the photo');

  it('fills with the item accent, not the brand gradient', () => {
    expect(cta).toContain('backgroundColor: accent');
    // The shared primary Button must not come back: it has no accent affordance.
    expect(src).not.toContain('<Button ');
    expect(src).not.toMatch(/import \{[^}]*\bButton\b[^}]*\} from '\.\.\/\.\.\/components'/);
  });

  it('is the frame rectangle, not the pill', () => {
    // 17pt radius and 15pt of vertical padding — NOT radii.pill / 56pt height.
    expect(cta).toContain('borderRadius: 17');
    expect(cta).toContain('paddingVertical: 15');
  });

  it('sets the label at 14.5/800 on the accent', () => {
    expect(cta).toContain('fontSize: 14.5');
    expect(cta).toContain("fontWeight: '800'");
    expect(cta).toContain('color: theme.colors.onPrimary');
  });

  it('still announces itself, now that it is a bare Pressable', () => {
    // The shared Button supplied a role and a label for free. Losing them on
    // the way to a Pressable would be a real accessibility regression.
    expect(cta).toContain('accessibilityRole="button"');
    expect(cta).toContain('accessibilityLabel={logButtonLabel(item, servings)}');
    expect(cta).toContain('accessibilityState={{ disabled: logging }}');
  });
});

describe('three section titles sit on the ground, one stays in its card', () => {
  // FRAME: `<div class="row bt mt16"><span class="nm" style="font-size:15px">`
  // followed by `<div class="card mt10">`. `.nm` is font-weight:700,
  // letter-spacing:-.1. All three shipped NESTED inside their card at 13px,
  // which flattened the screen into an undifferentiated stack of cards.
  it('lifts exactly the three the frame lifts', () => {
    expect(src.match(/<SectionHeader /g)).toHaveLength(3);
    for (const title of ['What this adds', 'What it does to today', 'Nutrition']) {
      expect(src).toContain(`<SectionHeader title="${title}"`);
    }
  });

  it('puts each lifted header BEFORE its card, not inside it', () => {
    // The ordering is the whole point of the finding: a header rendered after
    // the card opens is back to where it started.
    for (const title of ['What this adds', 'What it does to today', 'Nutrition']) {
      const header = src.indexOf(`<SectionHeader title="${title}"`);
      const card = src.indexOf('<Card', header);
      expect(card, title).toBeGreaterThan(header);
      expect(src.slice(header, card)).not.toContain('</');
    }
  });

  it('spaces them 16 above and 10 down to the card', () => {
    expect(between('function SectionHeader', '\n}')).toContain('marginTop: 16');
    expect(src.match(/<Card style=\{\{ marginTop: 10 \}\}>/g)).toHaveLength(3);
  });

  it('sets the lifted title at the frame 15, not the 13 that shipped', () => {
    expect(between('function SectionHeader', '\n}')).toContain('<Nm size={15}>');
  });

  it('keeps "How much" inside its own card at 14', () => {
    // The one header the frame does NOT lift. Lifting all four would be just
    // as wrong as lifting none.
    expect(between('{/* How much', '</Card>')).toContain('<Nm size={14}>How much</Nm>');
    expect(src).not.toContain('<SectionHeader title="How much"');
  });

  it('gives .nm its 700 weight and -0.1 tracking in one place', () => {
    const nm = between('function Nm(', '\n}');
    expect(nm).toContain("variant=\"cardTitle\"");
    expect(nm).toContain('letterSpacing: -0.1');
  });
});

describe('the hero fades into the sheet', () => {
  // FRAME: `linear-gradient(to bottom, rgba(247,245,242,0), var(--bg))` over
  // 70px. It shipped as a flat View at `opacity: 0.001` — a stubbed element
  // that renders nothing at all, with a comment claiming a fade.
  const hero = between('Fades the photo into the sheet', '{/* The sheet rides up');

  it('is a real gradient, not a 0.001-opacity stub', () => {
    expect(hero).toContain('<LinearGradient');
    expect(src).not.toContain('opacity: 0.001');
  });

  it('ramps from the ground colour at zero alpha to the ground colour', () => {
    // tint(bg, 0), NOT 'transparent': RN interpolates toward rgba(0,0,0,0),
    // so a bare transparent would drag the ramp through black.
    expect(hero).toContain('colors={[tint(theme.colors.bg, 0), theme.colors.bg]}');
    expect(hero).toContain('height: 70');
  });
});

describe('the collapsed state is a nav bar, not a centred title strip', () => {
  // FRAME (scrolled): `padding:8px 16px 12px`, hairline under, a left group at
  // `gap:9px` of a 19px chevron plus the ellipsized name at `.nm` 15px, and a
  // plain 18px star opposite. No white discs anywhere in the collapsed state.
  const bar = between('IT IS A NAV BAR, NOT A TITLE STRIP', '{/* The two circles');

  it('carries a chevron and a star, left group and right', () => {
    expect(bar).toContain('<Icon name="chevron-back" size={19}');
    expect(bar).toContain('<Icon name="star" size={18}');
    expect(bar).toContain('gap: 9');
    expect(bar).toContain("justifyContent: 'space-between'");
  });

  it('left-aligns and truncates the title at 15, never centres it', () => {
    expect(bar).toContain('fontSize: 15');
    expect(bar).toContain('numberOfLines={1}');
    // The 64pt side padding that faked a centred title is gone.
    expect(bar).not.toContain("textAlign: 'center'");
    expect(bar).not.toContain('paddingHorizontal: 64');
  });

  it('sits 8 below the inset and 12 above the hairline', () => {
    expect(bar).toContain('paddingTop: insets.top + 8');
    expect(bar).toContain('paddingBottom: 12');
    expect(bar).toContain('borderBottomWidth: 0.5');
  });

  it('fades the photo discs out as the bar fades in', () => {
    // Two back buttons at once is the defect: the discs belong to the photo.
    // Same inputRange as navTitleOpacity, opposite outputRange — one motion.
    const discs = between('const heroButtonsOpacity', 'return (');
    expect(discs).toContain('inputRange: [collapseAt - 20, collapseAt]');
    expect(discs).toContain('outputRange: [1, 0]');
    expect(between('{/* The two circles', '</Animated.View>')).toContain(
      'opacity: heroButtonsOpacity',
    );
  });
});

describe('"What this adds" ends in a divided strip, not a packed cluster', () => {
  // FRAME: `<div class="row mt12" style="padding-top:11px;border-top:.5px
  // solid var(--hair)">` with every cell `flex:1;text-align:center`, label
  // `.lab` 9px/+.5 tracking, value 13px/800. It shipped as a left-packed
  // flexWrap row with gap 16 and no rule, so four macros read as a sentence
  // that had run out of room.
  const micros = between('function Micros(', 'function NutritionCard');

  it('rules the micros off from the headline pair', () => {
    expect(micros).toContain('borderTopWidth: 0.5');
    expect(micros).toContain('paddingTop: 11');
    expect(micros).toContain('marginTop: 12');
  });

  it('gives every cell an equal centred column', () => {
    expect(micros).toContain('style={{ flex: 1 }}');
    expect(micros.match(/align="center"/g)).toHaveLength(2);
    // A wrapping cluster is the shape that shipped.
    expect(micros).not.toContain('flexWrap');
  });

  it('sets the value at 13/800 over a 9px label', () => {
    expect(micros).toContain('fontSize: 13');
    expect(micros).toContain("fontWeight: '800'");
    expect(micros).toContain('fontSize: 9');
    expect(micros).toContain('letterSpacing: 0.5');
  });
});

describe('"How much" is two lines, not three', () => {
  // FRAME: `<div class="card mt12" style="padding:13px 16px"><div class="row
  // bt">` — title stacked over the portion in a left column, stepper opposite,
  // ONE row. It shipped with the title on its own line and the portion demoted
  // into the stepper row below it, making the card that governs every number
  // on the screen the tallest thing above the fold.
  const card = between('{/* How much', '{/* What this adds');

  it('takes the frame padding, which is item-detail\'s own', () => {
    // 13/16, not the global card token.
    expect(card).toContain('<Card padding={16} style={{ marginTop: 12, paddingVertical: 13 }}>');
  });

  it('stacks title over portion opposite the stepper, in one row', () => {
    expect(card.match(/flexDirection: 'row'/g)).toHaveLength(2); // the card row + the stepper
    expect(card).toContain("justifyContent: 'space-between'");
    const title = card.indexOf('<Nm size={14}>How much</Nm>');
    const portion = card.indexOf('{item.servingLabel}');
    const stepper = card.indexOf('<StepButton');
    expect(portion).toBeGreaterThan(title);
    expect(stepper).toBeGreaterThan(portion);
  });

  it('sets the portion at 10.5 under the title', () => {
    expect(card).toContain('fontSize: 10.5, marginTop: 2');
  });
});

describe('the projection reads as one sentence, pinned right', () => {
  // FRAME: `<div class="row bt">` with `.lab` 10.5px left and the WHOLE
  // projection as a single 12px/800 var(--tp) run on the right — only the
  // number it would become tinted accent. It shipped left-packed at gap 6 as
  // four AppTexts across three sizes and two greys, with `to` blown up to 17pt
  // cardTitle, which read as four separate facts rather than one before/after.
  // Ends at the segmented bar, which is the next thing in the card.
  const line = between('ONE SENTENCE, PINNED RIGHT', "height: 7, borderRadius: 4");

  it('pushes the run to the right edge', () => {
    expect(line).toContain("justifyContent: 'space-between'");
    expect(line).not.toContain('gap: 6');
  });

  it('sets the nutrient label at 10.5, quiet', () => {
    expect(line).toContain('color="textSecondary" style={{ fontSize: 10.5 }}');
  });

  it('writes from → to → target as one 12/800 run', () => {
    // Two AppTexts at the SAME size and weight, so the accent number sits in
    // the sentence instead of interrupting it.
    expect(line.match(/fontSize: 12, fontWeight: '800'/g)).toHaveLength(2);
    expect(line).not.toContain('fontSize: 17');
  });

  it('tints only the number it would become', () => {
    expect(line).toContain("fontWeight: '800', color: accent");
  });
});
