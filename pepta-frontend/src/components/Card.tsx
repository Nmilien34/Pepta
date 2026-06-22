// Card / InsetCard — the surface primitives. Cards are the main content
// containers: 24px radius, soft single shadow, no harsh border (Master Prompt
// §3C). InsetCard is the flatter nested surface (20px radius, tinted fill) used
// for stepper rows and sub-sections.

import React, { type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  // Override the inner padding (defaults to the card padding token).
  padding?: number;
  // Drop the shadow for cards that sit on a colored/elevated surface.
  flat?: boolean;
}

export function Card({ children, style, padding, flat }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.sizes.card.borderRadius,
          padding: padding ?? theme.sizes.card.padding,
        },
        flat ? null : theme.shadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function InsetCard({ children, style, padding }: Omit<CardProps, 'flat'>) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.sizes.insetCard.borderRadius,
          padding: padding ?? theme.sizes.insetCard.padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
