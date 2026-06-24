// Shared header for the secondary tabs (Track / Progress / Account) — mirrors the
// design lab: a screen title on the left, a "Today" scope pill + a round
// adjustments button on the right. Home has its own (logo + streak) header.

import React from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface ScreenHeaderProps {
  title: string;
  // When provided, the round adjustments button becomes tappable.
  onAdjust?: () => void;
}

export function ScreenHeader({ title, onAdjust }: ScreenHeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}
    >
      <AppText variant="screenTitle">{title}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Pressable
          onPress={() => Haptics.selectionAsync().catch(() => undefined)}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingVertical: 7,
              paddingHorizontal: 11,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.surface,
              borderWidth: 0.5,
              borderColor: theme.colors.border,
            },
            theme.shadows.card,
          ]}
        >
          <Icon name="calendar" size={14} color={theme.colors.textSecondary} stroke={2.1} />
          <AppText variant="caption" style={{ fontWeight: '700', fontSize: 13 }}>
            Today
          </AppText>
          <Icon name="chevron-down" size={13} color={theme.colors.textTertiary} stroke={2.2} />
        </Pressable>
        <Pressable
          onPress={
            onAdjust
              ? () => {
                  Haptics.selectionAsync().catch(() => undefined);
                  onAdjust();
                }
              : undefined
          }
          accessibilityRole="button"
          accessibilityLabel="Adjust"
          style={{
            width: 34,
            height: 34,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="adjustments-horizontal" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}
