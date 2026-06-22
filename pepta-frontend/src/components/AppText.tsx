// AppText — the single text primitive. Every label in Pepta goes through this so
// typography variants and color tokens stay consistent. Usage:
//   <AppText variant="screenTitle">Home</AppText>
//   <AppText variant="caption" color="textSecondary">/120g</AppText>

import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import type { TypographyVariant } from '../theme';
import type { ThemeColors } from '../theme';

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

  return (
    <Text
      {...rest}
      style={[
        theme.typography[variant],
        { color: resolvedColor },
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    />
  );
}
