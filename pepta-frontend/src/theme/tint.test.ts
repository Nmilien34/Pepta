// The card-header chip, and the tint maths behind it.
//
// The frame puts every card icon in a chip tinted with that card's own accent:
//
//   .ch svg.ic { padding:8.5px; border-radius:11px;
//                background: color-mix(in srgb, currentColor 13%, transparent) }
//
// The app shipped BARE glyphs on all of them — Fiber, Water, Protein, Meals,
// Weight — which is why Home read flatter and lighter than the design
// everywhere at once rather than on one card. It was one omission repeated, not
// five bugs, and it came from reading the frame's inline styles and skipping
// what its classes add.
//
// `color-mix` has no React Native equivalent, so the tint is computed. These
// pin the computation; the chip geometry is pinned where it is used.

import { describe, expect, it } from 'vitest';
import { tint } from '../theme/tint';

describe('tint', () => {
  it('matches color-mix(currentColor 13%) for the app accents', () => {
    expect(tint('#7C5CFC')).toBe('rgba(124,92,252,0.13)'); // weight
    expect(tint('#34C759')).toBe('rgba(52,199,89,0.13)'); // fiber
  });

  it('accepts shorthand hex', () => {
    expect(tint('#0AF')).toBe('rgba(0,170,255,0.13)');
  });

  it('re-tints an rgb/rgba colour rather than nesting it', () => {
    // A nested rgba(rgba(...)) is invalid and renders as nothing — the chip
    // would silently vanish, which is the bug this component exists to end.
    expect(tint('rgb(124, 92, 252)')).toBe('rgba(124,92,252,0.13)');
    expect(tint('rgba(124, 92, 252, 0.8)')).toBe('rgba(124,92,252,0.13)');
  });

  it('takes an explicit alpha when a surface needs a different weight', () => {
    expect(tint('#7C5CFC', 0.08)).toBe('rgba(124,92,252,0.08)');
  });

  it('passes an unrecognised colour through instead of throwing', () => {
    // A header in the wrong tint is a far smaller failure than a header that
    // does not render at all.
    expect(tint('papayawhip')).toBe('papayawhip');
    expect(tint('')).toBe('');
  });

  it('is case-insensitive about hex', () => {
    expect(tint('#7c5cfc')).toBe(tint('#7C5CFC'));
  });
});
