// The item page's hero, and the one thing a naive fix to it breaks.
//
// The photo band started at y=0. On a device with a Dynamic Island that put the
// top of every packshot behind the clock — a `contain` image centred in a 212pt
// band whose first ~59pt were covered — so the Vita Coco carton arrived cropped
// at the cap. One screen renders EVERY item, so it was every item.
//
// Padding the scroll content down by the top inset fixes the photo. What it
// quietly breaks is the nav bar: the hero now leaves the screen `insetTop`
// later, and a collapse threshold that ignores the inset fades the title in
// while the photo is still visible. That is why the threshold is a function of
// the inset rather than a constant, and why it is worth a test.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heroCollapseAt, HERO_HEIGHT } from './itemDetail';

describe('heroCollapseAt', () => {
  it('moves with the inset, so the nav bar and the photo stay in step', () => {
    const noInset = heroCollapseAt(0);
    const island = heroCollapseAt(59);

    expect(island - noInset).toBe(59);
  });

  it('still fires slightly before the hero is fully gone', () => {
    // The nav title should have arrived by the time the photo has, not after —
    // a gap where neither is showing reads as a blank bar.
    for (const inset of [0, 20, 47, 59, 62]) {
      expect(heroCollapseAt(inset)).toBeLessThan(HERO_HEIGHT + inset);
    }
  });

  it('never asks for a negative scroll offset', () => {
    // A threshold below zero means the nav bar is already faded in at rest.
    expect(heroCollapseAt(0)).toBeGreaterThan(0);
  });
});

describe('the item hero clears the status bar', () => {
  const source = readFileSync(join(__dirname, 'ItemDetailScreen.tsx'), 'utf8');

  it('pads the scroll content by the top inset', () => {
    expect(source).toContain('paddingTop: insets.top');
  });

  it('does not ALSO wrap in a top SafeAreaView, which would double the offset', () => {
    // The nav bar and the floating back/star buttons are absolutely positioned
    // and already apply insets.top themselves. Adding a SafeAreaView on top of
    // the padding pushes the hero down twice.
    expect(source).not.toMatch(/SafeAreaView[^>]*edges=\{\[['"]top['"]/);
  });

  it('derives the collapse point rather than hardcoding it again', () => {
    expect(source).toContain('heroCollapseAt(insets.top)');
    expect(source).not.toContain('const COLLAPSE_AT =');
  });
});
