// The Progress screen, against its frame.
//
// design-lab/hub-new-screens.html, frame `<div class="fl">Progress</div>`,
// stacks eight cards in this order and no other:
//
//   1  Weight (lbs)              .card, chart
//   2  To goal │ BMI / Difference    .grid — the two columns
//   3  Side effects              .card, chart
//   4  What you're eating        .card, chart
//   5  Muscle protection         .card
//   6  Timeline                  .card
//   7  What your numbers say     .card
//   8  Progress photos           .card
//
// The build had Muscle protection at slot 3, above both charts. That is not a
// cosmetic swap: the frame's sequence is a measured thing, then a felt thing,
// then a behaviour, then the interpretation of all three — the retention score
// is DERIVED from protein and pace, so it has to come after the cards those
// numbers are on. Read from the top it otherwise announces a verdict and then
// shows the evidence.
//
// Order is exactly the thing that drifts silently: nothing type-checks it,
// nothing renders wrong, and each individual card still looks right. Hence a
// test that reads the source in order.
//
// House style, per cardHeaderSpec / doseCardSpec: a `.ts` test cannot import a
// `.tsx`, so these read the source as text.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(join(__dirname, 'ProgressScreen.tsx'), 'utf8');
const sideEffectsCard = readFileSync(
  join(__dirname, '..', '..', 'components', 'SideEffectsCard.tsx'),
  'utf8',
);
const shotSheet = readFileSync(
  join(__dirname, '..', '..', 'components', 'ShotDetailSheet.tsx'),
  'utf8',
);

/** Where a card's title appears in the render, so the cards can be sorted. */
function slot(marker: string): number {
  const at = screen.indexOf(marker);
  expect(at, `${marker} is not in ProgressScreen`).toBeGreaterThan(-1);
  return at;
}

describe('the Progress cards stack in the frame’s order', () => {
  it('puts Side effects and What you’re eating above Muscle protection', () => {
    // The regression this file exists for.
    expect(slot('<SideEffectsCard')).toBeLessThan(slot('Muscle protection'));
    expect(slot('What you’re eating')).toBeLessThan(slot('Muscle protection'));
  });

  it('runs weight → goal trio → charts → verdict → timeline → numbers → photos', () => {
    const order = [
      'Weight ({s.weight.unit})',
      'To goal',
      '<SideEffectsCard',
      'What you’re eating',
      'Muscle protection',
      'Timeline',
      'What your numbers say',
      'Progress photos',
    ].map(slot);

    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it('keeps both Muscle protection states together', () => {
    // The card has a scored and an unscored variant. They are one card in the
    // frame and must not end up on opposite sides of another card.
    // The rendered title on its own line, so the section comment above the
    // first variant is not counted as a third card.
    const both = [...screen.matchAll(/^\s+Muscle protection$/gm)].map((match) => match.index!);
    expect(both).toHaveLength(2);
    expect(slot('Timeline')).toBeGreaterThan(both[1]!);
    expect(slot('What you’re eating')).toBeLessThan(both[0]!);
  });
});

describe('the Progress card headers wear the frame’s .ic chip', () => {
  it('chips To goal', () => {
    // `<svg class="tin ic" style="color:var(--weight)">` beside
    // `<span class="nm">To goal</span>`. The chip is specified ENTIRELY by the
    // `.ic` class, so reading the inline style alone missed it and this one
    // header shipped bare while every other card on the screen wore one.
    expect(screen).toContain('<CardIcon name="target" color={theme.colors.weight} />');
    expect(screen).not.toContain('<Icon name="target"');
  });

  it('gives Side effects its .info glyph', () => {
    // The frame prints `.info` after the title: the number is a weekly mean of
    // a subjective 1-5, and the header is where the card says so.
    expect(sideEffectsCard).toContain('information-circle-outline');
  });
});

describe('the Progress charts carry their scales', () => {
  // A chart with no scale is not a smaller version of the design, it is a
  // different and much weaker chart: without an axis a dip to 2-of-5 and a dip
  // to 4-of-5 are the same picture.

  it('draws all three plots to the frame’s 132 + 20 box', () => {
    // The frame gives the weight, side-effect and eating plots identical
    // geometry so the cards stack as one instrument. Side effects shipped at
    // 96 with no gutter; the eating bars were a 64pt strip.
    expect(sideEffectsCard).toContain('const PLOT_HEIGHT = 132');
    expect(sideEffectsCard).toContain('const SCALE_GUTTER = 34');
    expect(sideEffectsCard).toContain('const AXIS_HEIGHT = 20');
    expect(screen).toContain('const CHART_PLOT_HEIGHT = 132');
    expect(screen).toContain('const CHART_SCALE_GUTTER = 34');
    expect(screen).toContain('const CHART_AXIS_HEIGHT = 20');
    expect(screen).not.toContain('height: 64');
  });

  it('gives the eating bars a target rule and dated axis', () => {
    // Bars alone say how much they ate. Only the rule says whether it was
    // enough, and only the axis says which days these were.
    expect(screen).toContain('plot.targetY');
    expect(screen).toContain('g target');
    expect(screen).toContain('monthDay(tick.at)');
  });

  it('gives the side-effect curve its baseline, fill and dates', () => {
    expect(sideEffectsCard).toContain('model.baselineLabel');
    expect(sideEffectsCard).toContain('model.areaPath');
    expect(sideEffectsCard).toContain('monthDay(tick.at)');
  });
});

describe('the shot sheet plots a closed window, not "now"', () => {
  it('no longer renders Track’s live level chart', () => {
    // buildLevelChartModel clamps `now` into the curve's span, so a shot from
    // six weeks ago drew a "Today" marker pinned to the window's right edge and
    // printed "Right now · <today>" over the level at the END OF THAT OLD
    // WINDOW — a stale number presented as the user's current level.
    // Named in the comment that explains the removal, so match the import and
    // the element rather than the word.
    expect(shotSheet).not.toContain('<MedicationLevelChart');
    expect(shotSheet).not.toContain("from './MedicationLevelChart'");
  });

  it('dates both ends of the window under the curve', () => {
    // Otherwise the curve floats: nothing on the card says which days it is.
    expect(shotSheet).toContain('formatDayOnly(from)');
    expect(shotSheet).toContain('formatDayOnly(to)');
  });

  it('draws the frame’s 104pt sheet plot', () => {
    expect(shotSheet).toContain('const SPARK_HEIGHT = 104');
  });
});
