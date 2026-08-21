// AppText — the single text primitive. Every label in Pepta goes through this so
// typography variants and color tokens stay consistent. Usage:
//   <AppText variant="screenTitle">Home</AppText>
//   <AppText variant="caption" color="textSecondary">/120g</AppText>

import React, { useMemo } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import type { TypographyVariant } from '../theme';
import type { ThemeColors } from '../theme';

// EVERY BOLD IN THE APP WAS A NO-OP.
//
// theme/typography.ts says it plainly: "React Native selects a weight by family
// NAME, so each style names its exact Hanken family. `fontWeight` is kept as a
// harmless fallback hint." It is harmless on a variant — and inert on an
// OVERRIDE. `<AppText variant="caption" style={{ fontWeight: '800' }}>` keeps
// the variant's HankenGrotesk_500Medium family and renders Medium, because
// nothing changed the family. 189 call sites did exactly that (126 at 700, 52
// at 800), which is why the whole app read lighter than the design no matter
// how many individual cards were corrected.
//
// Rather than edit 189 sites and rely on the next one remembering, the
// primitive now resolves it: a fontWeight with no fontFamily beside it picks
// the matching Hanken face. Callers keep writing the obvious thing and get
// what they asked for.
const FAMILY_FOR_WEIGHT: Record<string, string> = {
  '500': 'HankenGrotesk_500Medium',
  '600': 'HankenGrotesk_600SemiBold',
  '700': 'HankenGrotesk_700Bold',
  '800': 'HankenGrotesk_800ExtraBold',
  '900': 'HankenGrotesk_800ExtraBold',
  normal: 'HankenGrotesk_500Medium',
  bold: 'HankenGrotesk_700Bold',
};

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  // A theme color token (e.g. 'textSecondary', 'primary', 'protein') or any raw color.
  color?: keyof ThemeColors | (string & {});
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
}

export function AppText({
  variant = 'body',
  color = 'textPrimary',
  align,
  uppercase,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const resolvedColor = (theme.colors as Record<string, string>)[color] ?? color;

  // Flatten first: the weight and the family can arrive from different entries
  // of the style array, and only the winning pair matters.
  const weightFix = useMemo(() => {
    const flat = StyleSheet.flatten(style) as TextStyle | undefined;
    const weight = flat?.fontWeight;
    if (!weight || flat?.fontFamily) return null;
    const family = FAMILY_FOR_WEIGHT[String(weight)];
    // The serif is deliberately outside this map — the welcome promise sets its
    // own family and must never be swapped for a grotesk.
    return family && family !== theme.typography[variant].fontFamily ? { fontFamily: family } : null;
  }, [style, theme.typography, variant]);

  return (
    <Text
      {...rest}
      style={[
        theme.typography[variant],
        { color: resolvedColor },
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
        weightFix,
      ]}
    />
  );
}
