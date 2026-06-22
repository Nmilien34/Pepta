// SectionErrorBanner — surfaces the `sectionErrors` map that /home and /track
// return when a section degrades (partial failure). Renders nothing when empty.

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { AppText } from './AppText';

export interface SectionErrorBannerProps {
  errors: Record<string, string> | undefined;
  style?: object;
}

export function SectionErrorBanner({ errors, style }: SectionErrorBannerProps) {
  const theme = useTheme();
  const messages = Array.from(new Set(Object.values(errors ?? {})));
  if (messages.length === 0) return null;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 10,
          backgroundColor: '#FFF8EC',
          borderRadius: theme.radii.md,
          borderWidth: 0.5,
          borderColor: theme.colors.warning,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
        },
        style,
      ]}
    >
      <Ionicons name="warning" size={18} color={theme.colors.warning} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ fontWeight: '700' }}>
          Some data couldn’t load
        </AppText>
        {messages.map((m, i) => (
          <AppText key={i} variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            {m}
          </AppText>
        ))}
      </View>
    </View>
  );
}
