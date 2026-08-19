// The scope pill's menu — the frame's anchored card, not a bottom sheet.
//
// It drops from under the pill it belongs to, because it is a four-item choice
// attached to a control the user just tapped. A sheet rising from the bottom
// of the screen for that would cover the very cards the choice governs, and
// hide the answer at the moment of asking.

import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import {
  PROGRESS_SCOPES,
  scopeStartSubtitle,
  type ProgressScopeKey,
} from '../screens/app/progressScope';

export interface ProgressScopeMenuProps {
  visible: boolean;
  scope: ProgressScopeKey;
  /** First log, so "Since you started" can name its own date. */
  startedAt: string | null;
  now?: Date;
  onPick(next: ProgressScopeKey): void;
  onClose(): void;
}

export function ProgressScopeMenu({
  visible,
  scope,
  startedAt,
  now = new Date(),
  onPick,
  onClose,
}: ProgressScopeMenuProps) {
  const theme = useTheme();
  if (!visible) return null;
  const subtitle = scopeStartSubtitle(startedAt, now);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the scope menu"
        style={{ flex: 1 }}
      >
        <View
          style={[
            {
              position: 'absolute',
              top: 96,
              right: 16,
              width: 210,
              backgroundColor: theme.colors.surface,
              borderWidth: 0.5,
              borderColor: theme.colors.border,
              borderRadius: 22,
              padding: 6,
            },
            theme.shadows.card,
          ]}
        >
          {PROGRESS_SCOPES.map((option) => {
            const on = option.key === scope;
            // Only "Since you started" has a second line, and only when there
            // is a first log to date it from.
            const second = option.key === 'start' ? subtitle : '';
            return (
              <Pressable
                key={option.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  onPick(option.key);
                  onClose();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={second ? `${option.label}, ${second}` : option.label}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingVertical: 9,
                  paddingHorizontal: 11,
                  borderRadius: 14,
                  backgroundColor: on ? theme.colors.surfaceAlt : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flexShrink: 1 }}>
                  <AppText variant="bodyStrong" style={{ fontSize: 13.5, fontWeight: '700' }}>
                    {option.label}
                  </AppText>
                  {second ? (
                    <AppText variant="caption" color="textTertiary" style={{ fontSize: 10.5, marginTop: 1 }}>
                      {second}
                    </AppText>
                  ) : null}
                </View>
                {on ? <Icon name="checkmark" size={15} color={theme.colors.primary} stroke={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}
