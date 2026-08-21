// Why every bold in the app was a no-op.
//
// theme/typography.ts states it in its own words:
//
//   "React Native selects a weight by family NAME, so each style names its
//    exact Hanken family. `fontWeight` is kept as a harmless fallback hint."
//
// Harmless on a VARIANT — inert on an OVERRIDE. `variant="caption"` pins
// HankenGrotesk_500Medium, so `style={{ fontWeight: '800' }}` on top of it sets
// a property React Native does not use for selection and the text renders
// Medium. 189 call sites did exactly that (126 at 700, 52 at 800), which is why
// the app read lighter than the design no matter how many individual cards were
// corrected — and why "the word is heavier in the design" kept coming back
// after each card was fixed.
//
// AppText now resolves it centrally. These pin the mapping and, more
// importantly, pin the PREMISE — if a future variant stops naming a family, or
// the loaded faces are renamed in theme/fonts.ts, the mapping silently stops
// matching real fonts and the bug returns invisibly.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { typography } from './typography';

// fonts.ts imports @expo-google-fonts, which drags expo-modules-core into the
// graph and will not load in a plain node test — so the loaded set is read from
// the source instead. That is the point of the assertion anyway: the mapping
// must name families this file actually loads.
const FONT_FAMILIES = Object.fromEntries(
  [...readFileSync(join(__dirname, 'fonts.ts'), 'utf8').matchAll(/(\w+):\s*'([\w_]+)'/g)].map(
    (m) => [m[1]!, m[2]!],
  ),
);

describe('the premise: variants select by family, not by weight', () => {
  it('every variant names an explicit font family', () => {
    // The moment one does not, its fontWeight becomes load-bearing and the
    // central fix stops covering it.
    // typography also exports non-variant helpers (the weights map); a real
    // variant is anything carrying a fontSize.
    const variants = Object.entries(typography).filter(
      ([, v]) => v && typeof v === 'object' && 'fontSize' in v,
    );
    expect(variants.length).toBeGreaterThan(5);
    for (const [name, style] of variants) {
      expect((style as { fontFamily?: string }).fontFamily, `${name} has no fontFamily`).toBeTruthy();
    }
  });

  it('the caption variant really is a Medium face — the case that bit', () => {
    expect(typography.caption.fontFamily).toBe('HankenGrotesk_500Medium');
    // ...while declaring a weight that does nothing on its own.
    expect(typography.caption.fontWeight).toBeTruthy();
  });
});

describe('the weight→family map points at fonts that are actually loaded', () => {
  const MAP: Record<string, string> = {
    '500': 'HankenGrotesk_500Medium',
    '600': 'HankenGrotesk_600SemiBold',
    '700': 'HankenGrotesk_700Bold',
    '800': 'HankenGrotesk_800ExtraBold',
    '900': 'HankenGrotesk_800ExtraBold',
    normal: 'HankenGrotesk_500Medium',
    bold: 'HankenGrotesk_700Bold',
  };

  it('names only families the app loads', () => {
    // A family that useAppFonts never loads renders as the system fallback —
    // which looks like a DIFFERENT bug and would send the next person hunting
    // in the wrong place.
    const loaded = new Set(Object.values(FONT_FAMILIES));
    for (const family of Object.values(MAP)) {
      expect(loaded.has(family), `${family} is not loaded by useAppFonts`).toBe(true);
    }
  });

  it('covers every weight the codebase actually overrides with', () => {
    // 700 and 800 are the overwhelming majority; 600 appears too. If a new
    // weight starts being used it must be added here or it silently stays inert.
    for (const w of ['600', '700', '800']) {
      expect(MAP[w]).toBeTruthy();
    }
  });

  it('maps 900 down to the heaviest face that exists rather than nothing', () => {
    // There is no 900 Hanken loaded; falling through would drop to the system
    // font mid-sentence.
    expect(MAP['900']).toBe(MAP['800']);
  });

  it('leaves the serif out — the welcome promise sets its own family', () => {
    expect(Object.values(MAP)).not.toContain(FONT_FAMILIES.serif);
  });
});
