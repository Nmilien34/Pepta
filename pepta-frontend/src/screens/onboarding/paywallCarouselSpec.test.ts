// The paywall proof carousel, against its frames.
//
// Two slides shipped as placeholders on the ONE screen that asks for money:
//
//   "Snap a meal, get the numbers"  -> a flat 74px grey rectangle. The slide's
//      entire argument is that we recognise your food, made with no food in it.
//   "Ask Pep anything"              -> the PEP label alone, no Pep. The card is
//      named after a character it never showed.
//
// Both are placeholder shapes that render as "broken image" to anyone who has
// seen the design, which is why they read as a rendering failure rather than a
// design gap.
//
// These assert the rendered ELEMENTS, not the styling — a future restyle should
// be free, but neither slide may go back to being an empty box.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'PaywallProofCarousel.tsx'), 'utf8');

/** One slide's render body, so an assertion cannot match a neighbour's. */
const slide = (key: string) => {
  const start = source.indexOf(`key: '${key}'`);
  expect(start, `no slide keyed ${key}`).toBeGreaterThan(-1);
  const next = source.indexOf('    key: ', start + 10);
  return source.slice(start, next > start ? next : source.length);
};

describe('the scan slide shows the food', () => {
  const scan = slide('scan');

  it('renders a real photograph, not a grey box', () => {
    expect(scan).toContain('<Image source={SCAN_PHOTO}');
    expect(scan).toContain('resizeMode="cover"');
  });

  it('sources that photo from a bundled asset that exists', () => {
    const match = source.match(/import SCAN_PHOTO from '([^']+)'/);
    expect(match, 'SCAN_PHOTO is not imported from an asset').toBeTruthy();
    // A require of a missing file is a runtime red box, not a type error, so
    // the path is checked here rather than trusted.
    const asset = join(__dirname, match![1]!);
    expect(() => readFileSync(asset), `${match![1]} does not exist`).not.toThrow();
  });

  it('is a chicken photo — the slide names the food out loud', () => {
    // Swapping the asset without swapping the caption gives a photo of one food
    // labelled as another, on the paywall.
    expect(scan).toContain('Chicken breast');
    expect(source).toMatch(/import SCAN_PHOTO from '[^']*chicken\.jpg'/);
  });

  it('lays the photo beside the name rather than above it', () => {
    expect(scan).toContain('styles.scanRow');
    expect(source).toContain("scanRow: { flexDirection: 'row'");
  });

  it('keeps no flat placeholder block behind', () => {
    expect(source).not.toContain('styles.thumb');
  });
});

describe('the Pep slide shows Pep', () => {
  const pep = slide('pep');

  it('renders the mascot', () => {
    expect(pep).toContain('<Mascot');
  });

  it('imports it from the shared component, not a local copy', () => {
    expect(source).toContain("import { Mascot } from '../../components/Mascot'");
  });

  it('puts him beside the label and question, not below them', () => {
    expect(pep).toContain('styles.pepRow');
    expect(source).toContain("pepRow: { flexDirection: 'row'");
    // The frame aligns the row to flex-start: the avatar sits level with the
    // eyebrow, not centred against a two-line question.
    expect(source).toMatch(/pepRow:[^}]*alignItems: 'flex-start'/);
  });

  it('still says PEP — the avatar adds to the label, it does not replace it', () => {
    expect(pep).toContain('styles.cardLabel');
    expect(pep).toContain('PEP');
  });
});
