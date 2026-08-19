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
  /**
   * The scope this screen is showing. A LABEL, not a picker — the frame draws
   * it as bare text in a pill, with no chevron, because Track and Progress
   * show current state rather than a chosen day.
   *
   * It used to carry a calendar icon and a chevron-down over an onPress that
   * fired haptics and did nothing else: a control that promised a picker
   * nobody had built. Screens that really do scope (Your log) own their own
   * pill, with a chevron, because theirs opens something.
   */
  scopeLabel?: string;
  /**
   * Makes the pill a control: it grows a chevron and becomes pressable.
   * Without it the pill stays a label, which is what Track and Progress-
   * before-the-scope-pill need — a chevron over nothing was the decoration
   * this replaced.
   */
  onScopePress?: () => void;
}

/** The scope pill's shell: a Pressable only when it has somewhere to go. */
function Pill({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  const style = [
    {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 0.5,
      borderColor: theme.colors.border,
    },
    theme.shadows.card,
  ];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Change what this screen covers"
      style={({ pressed }) => [...style, { opacity: pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

export function ScreenHeader({ title, onAdjust, scopeLabel = 'Today', onScopePress }: ScreenHeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}
    >
      <AppText variant="screenTitle">{title}</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Pill onPress={onScopePress}>
          <AppText variant="caption" style={{ fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
            {scopeLabel}
          </AppText>
          {onScopePress ? (
            <Icon name="chevron-down" size={13} color={theme.colors.textTertiary} stroke={2.2} />
          ) : null}
        </Pill>
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
