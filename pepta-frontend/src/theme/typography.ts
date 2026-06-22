// Pepta typography tokens.
// Display + body = Hanken Grotesk (Master Prompt §3B): heavy near-black grotesk
// at 800 for titles/stats, lighter weights for body. Prominent bold numerals
// are a signature of this category.
//
// React Native selects a weight by family NAME, so each style names its exact
// Hanken family. The names mirror FONT_FAMILIES in theme/fonts.ts (which loads
// the actual assets). `fontWeight` is kept as a harmless fallback hint for the
// brief window before fonts load and for any system fallback.

import type { TextStyle } from 'react-native';

const weights = {
  medium: '500' as TextStyle['fontWeight'],
  semiBold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
  heavy: '800' as TextStyle['fontWeight'],
} as const;

// Weight-role → Hanken family name. Mirrors FONT_FAMILIES in theme/fonts.ts.
const family = {
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  heavy: 'HankenGrotesk_800ExtraBold',
} as const;

type TypeStyle = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily'>;

export const fonts = family;

export const typography = {
  weights,
  fonts: family,

  // Big screen titles ("Home", "Progress").
  screenTitle: { fontFamily: family.heavy, fontWeight: weights.heavy, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 } as TypeStyle,
  // Large hero stats (184 lbs, 5d 9h, 0/94g).
  statBig: { fontFamily: family.heavy, fontWeight: weights.heavy, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 } as TypeStyle,
  statMedium: { fontFamily: family.heavy, fontWeight: weights.heavy, fontSize: 22, lineHeight: 26, letterSpacing: -0.3 } as TypeStyle,
  // Onboarding question/step titles ("Where are you in your journey?").
  obTitle: { fontFamily: family.heavy, fontWeight: weights.heavy, fontSize: 24, lineHeight: 28, letterSpacing: -0.4 } as TypeStyle,

  cardTitle: { fontFamily: family.bold, fontWeight: weights.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 } as TypeStyle,
  body: { fontFamily: family.medium, fontWeight: weights.medium, fontSize: 15, lineHeight: 21 } as TypeStyle,
  bodyStrong: { fontFamily: family.semiBold, fontWeight: weights.semiBold, fontSize: 15, lineHeight: 21 } as TypeStyle,
  caption: { fontFamily: family.medium, fontWeight: weights.medium, fontSize: 13, lineHeight: 18 } as TypeStyle,
  // Tertiary denominator text, e.g. "/120g".
  denominator: { fontFamily: family.medium, fontWeight: weights.medium, fontSize: 13, lineHeight: 18 } as TypeStyle,
  // Caps-gray section headers (settings groups). Render with textTransform:'uppercase'.
  sectionHeader: { fontFamily: family.semiBold, fontWeight: weights.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 } as TypeStyle,
  button: { fontFamily: family.bold, fontWeight: weights.bold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 } as TypeStyle,
} as const;

export type Typography = typeof typography;
export type TypographyVariant = Exclude<keyof Typography, 'weights' | 'fonts'>;
