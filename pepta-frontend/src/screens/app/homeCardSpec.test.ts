// Home's level card and activity card, against their frames.
//
// design-lab/hub-new-screens.html draws Home three times — "Home", "Home ·
// first run" and "Home · dose day" — and every value pinned below is one the
// three frames AGREE on. Each was missed the same way: by reading a node's
// inline `style="..."` and skipping what its CLASS contributed. The classes at
// stake here are:
//
//   .big    { font-weight:800; font-size:26px; letter-spacing:-.6px }
//   .unit   { font-weight:700; font-size:15px; color:var(--ts) }
//   .lab    { font-weight:500; font-size:12.5px; color:var(--ts) }
//   .pill   { padding:5px 11px; border-radius:999px; font-weight:600 }
//   .ch     { display:flex; align-items:center; gap:8px; min-width:0 }
//   .streak { display:inline-flex; align-items:center; gap:3px;
//             font-weight:800; font-size:15px }
//   .seg    { height:6px; border-radius:999px; flex:1; background:#E9E9EE }
//   .seg.on { background:linear-gradient(90deg,var(--g1),var(--g2)) }
//
// Nothing here imports HomeScreen: it is a .tsx, and a .ts vitest file cannot
// load react-native ("Unexpected token 'typeof'"). Same house style as
// cardHeaderSpec.test.ts and doseCardSpec.test.ts — read the source as text.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const home = readFileSync(join(__dirname, 'HomeScreen.tsx'), 'utf8');
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

/** JSX wraps across lines at the mercy of the formatter; the shapes do not. */
const flat = (s: string) => s.replace(/\s+/g, ' ');

/** Just one card, so an assertion cannot be satisfied by another card's copy. */
const between = (start: string, end: string) => {
  const from = home.indexOf(start);
  const to = home.indexOf(end, from);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return home.slice(from, to);
};

// Both branches of the medication card — the one with a level and the empty
// one — live inside this slice, which is the point: the frames give them the
// same treatment and only one of them ever got it.
const levelCard = between('{/* medication level */}', '{/* macros + goal');
const activityCard = between('function ActivityCard', 'const LOG_META');
const header = between('{/* header */}', '<SectionErrorBanner');
const getStarted = between('function GettingStartedCard', 'function FiberCard');

describe('the level card sets its unit in .unit, not in caption', () => {
  it('renders " mg" at 15/700 secondary in BOTH branches', () => {
    // The frame writes the reading as `.big` (26/800, accent) and the unit
    // beside it as `.unit` (15/700, --ts) — two sizes, deliberately. Shipped at
    // `caption` (13/500) the unit read as the same run of text as the number,
    // which flattened the only hierarchy this card has.
    const units = flat(levelCard).match(
      /variant="cardTitle" style=\{\{ fontSize: 15, color: theme\.colors\.textSecondary \}\}/g,
    );

    expect(units).toHaveLength(2);
  });

  it('leaves neither unit as a bare caption', () => {
    // The populated branch's unit is data; the empty branch's is the literal
    // "mg". Banning only one would let the other regress silently.
    expect(flat(levelCard)).not.toMatch(/variant="caption"[^>]*> \{view\.medication\.unit\}/);
    expect(flat(levelCard)).not.toMatch(/variant="caption"[^>]*> mg </);
  });

  it('is the same treatment the weight card already had', () => {
    // The weight card was corrected for exactly this and carries a comment
    // saying so; the level card is its twin and was the one left behind. If
    // that precedent ever moves, these two should move with it.
    expect(home).toContain('variant="cardTitle" style={{ fontSize: 15, color: theme.colors.textSecondary }}');
  });
});

describe('"Current estimate" is .lab mt8', () => {
  it('sits in --ts at 12.5, 8 below the reading, in BOTH branches', () => {
    // `.lab` is secondary, not tertiary. It shipped one step too faint AND one
    // step too close (marginTop 6, which is `.lab mt6` — the weight card's
    // spacing, not this card's).
    const labels = flat(levelCard).match(
      /color="textSecondary" style=\{\{ marginTop: 8, fontSize: 12\.5 \}\}> Current estimate/g,
    );

    expect(labels).toHaveLength(2);
  });

  it('is never rendered tertiary', () => {
    expect(flat(levelCard)).not.toMatch(/color="textTertiary"[^>]*> Current estimate/);
  });
});

describe('the activity card’s Log pill is the quiet pill', () => {
  it('sits on --alt, like "Steady" and "4.5 lb to go"', () => {
    // Both Home frames give this `.pill` with background:var(--alt) and
    // color:var(--ts) — the same neutral pill the level and weight cards wear.
    // It shipped on a 10% activity wash, which made the routine action the
    // loudest thing in the header and put a second orange element beside the
    // orange header chip.
    expect(activityCard).toContain('backgroundColor: theme.colors.surfaceAlt');
  });

  it('has retired the orange wash entirely', () => {
    // The constant that held it is gone too — a colour no longer specified
    // anywhere should not sit in the file waiting to be reused.
    expect(home).not.toContain('rgba(255,107,90');
    expect(home).not.toContain('ACTIVITY_WASH');
  });

  it('tints its glyph and label --ts, not the activity accent', () => {
    expect(flat(activityCard)).toContain('<Icon name="add" size={13} color={theme.colors.textSecondary}');
    expect(flat(activityCard)).toMatch(
      /color="textSecondary" style=\{\{ fontWeight: '600', fontSize: 11\.5 \}\}> Log </,
    );
    expect(flat(activityCard)).not.toMatch(/color: theme\.colors\.activity[^}]*\}\}> Log </);
  });
});

describe('the streak counter is bare, per .streak', () => {
  it('wears no pill — no rim, no tint, no padding', () => {
    // `.streak` is `display:inline-flex; align-items:center; gap:3px;
    // font-weight:800; font-size:15px` and that is the ENTIRE class. It shipped
    // wrapped in a GlassEdge on a #FFF1E8 tint, which put a third pill in a
    // header the frame gives exactly one (`.today`).
    expect(header).not.toContain('#FFF1E8');
    expect(flat(header)).not.toMatch(/<GlassEdge[^>]*>\s*<View[^>]*>\s*<Icon name="fire"/);
  });

  it('sets the row at gap 3 with an 18px flame', () => {
    // gap:3 from the class; the flame's 18px from the frame's inline override.
    // It shipped at gap 5 with a 14px glyph, sized to fit the pill it was in.
    expect(flat(header)).toContain(
      "flexDirection: 'row', alignItems: 'center', gap: 3 }}> <Icon name=\"fire\" size={18}",
    );
  });

  it('renders the COUNT in ink at 800/15, not in the flame’s orange', () => {
    // `.streak` sets no colour, so the digit inherits --tp. The frame's own
    // note on this screen is that true ink is reserved to mean "this is the
    // value" — and the streak count is a value. Orange-on-orange made the
    // number read as part of the icon rather than as the number of days.
    expect(flat(header)).toContain("<AppText style={{ fontWeight: '800', fontSize: 15 }}> {view.streakDays}");
    expect(flat(header)).not.toMatch(/color: theme\.colors\.streak \}\}> \{view\.streakDays\}/);
  });

  it('still keeps the flame itself on the streak accent', () => {
    // The colour moved off the digit, not out of the row. --protein is what
    // `theme.colors.streak` resolves to, so the token stays the right one.
    expect(header).toContain('<Icon name="fire" size={18} color={theme.colors.streak} />');
  });
});

describe('the get-started meter uses .seg’s own cool track', () => {
  it('lays the unlit segments on #E9E9EE, not the warm border', () => {
    // `.seg`'s off state is its own colour — a COOL grey, and the only place in
    // the hub that uses it. It shipped as `--border` (#E9E4DB), the warm
    // hairline colour: correct for a card edge, muddy as the ground beneath a
    // purple fill.
    // The const sits just above GettingStartedCard, so it is matched against
    // the whole file; the usage below is scoped to the card.
    expect(home).toContain("const SEG_TRACK = '#E9E9EE';");
    expect(flat(getStarted)).toContain('backgroundColor: SEG_TRACK');
    expect(flat(getStarted)).not.toContain('backgroundColor: theme.colors.border');
  });

  it('keeps the meter filling by COUNT', () => {
    // Pre-existing behaviour worth holding: ticking off the fourth item must
    // not light the fourth segment and leave holes. It reads "2 of 5", it is
    // not a row of checkboxes.
    expect(flat(getStarted)).toContain('i < data.doneCount ?');
  });

  it('fills a LIT segment with the gradient, never flat primary', () => {
    // `.seg.on` is `linear-gradient(90deg,--g1,--g2)`. Five identical flat
    // purple capsules read as a disabled control; the ramp is what makes them
    // read as filled. CSS paints the gradient PER ELEMENT, so each lit segment
    // runs its own ramp — hence a LinearGradient per segment rather than one
    // spread across the row.
    expect(flat(getStarted)).toContain('<LinearGradient');
    expect(flat(getStarted)).toContain(
      'colors={[theme.colors.fillGradientStart, theme.colors.fillGradientEnd]}',
    );
    // Horizontal, matching the frame's 90deg.
    expect(flat(getStarted)).toContain('start={{ x: 0, y: 0 }}');
    expect(flat(getStarted)).toContain('end={{ x: 1, y: 0 }}');
    // And the flat fill is gone.
    expect(flat(getStarted)).not.toContain('backgroundColor: theme.colors.primary');
  });

  it('uses the hub ramp, not the darker primary-button ramp', () => {
    // The theme already carried primaryGradientStart/End (#6751E8→#8C63F4) for
    // buttons. Reaching for those here would have looked plausible and been
    // the wrong purple — the hub's --g1/--g2 is lighter and runs toward violet.
    const colors = read('../../theme/colors.ts');
    expect(colors).toContain('fillGradientStart: "#8B6CFF"');
    expect(colors).toContain('fillGradientEnd: "#C77DFF"');
    expect(colors).toContain('primaryGradientStart: "#6751E8"');
  });
});

describe('the resistance row leads with its glyph', () => {
  it('renders the frame’s 17px barbell in --act', () => {
    // Both frames open this row with `.ch` and a 17px barbell; the build
    // dropped it, leaving the only switch on Home as two lines of text with
    // nothing to say what kind of thing it logs. `dumbbell` is the registry
    // name for Tabler's IconBarbell — the exact path the frame draws.
    expect(activityCard).toContain('<Icon name="dumbbell" size={17} color={theme.colors.activity}');
  });

  it('puts the glyph AHEAD of the label, in a .ch row', () => {
    // A .ch is a row with gap 8; the icon landing after the text, or outside
    // the row, would render as a trailing decoration rather than the label's
    // marker.
    const glyph = activityCard.indexOf('name="dumbbell"');
    const label = activityCard.indexOf('Resistance today');

    expect(glyph).toBeGreaterThan(-1);
    expect(glyph).toBeLessThan(label);
    expect(flat(activityCard)).toContain(
      "flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0",
    );
  });
});
