// The "What to show" sheet — what the sliders glyph opens.
//
// No Save button, per the frame: each switch changes the screen behind it as
// it moves. A sheet that collected choices and applied them on dismiss would
// hide the one thing that makes this legible — seeing the card go.

import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { useTheme } from '../theme';
import {
  PROGRESS_SECTIONS,
  type ProgressSectionKey,
  type ProgressSectionPrefs,
} from '../screens/app/progressSections';

export interface WhatToShowSheetProps {
  visible: boolean;
  sections: ProgressSectionPrefs;
  onToggle(key: ProgressSectionKey): void;
  onClose(): void;
}

export function WhatToShowSheet({
  visible,
  sections,
  onToggle,
  onClose,
}: WhatToShowSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard={false} scrollable>
      <AppText variant="screenTitle" style={{ fontSize: 22 }}>
        What to show
      </AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: 6, lineHeight: 17 }}>
        Hide what you don’t track. Nothing is deleted — turn it back on any time.
      </AppText>

      <View style={{ marginTop: 14 }}>
        {PROGRESS_SECTIONS.map((section, index) => {
          const on = sections[section.key];
          return (
            <View
              key={section.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 2,
                borderTopWidth: index === 0 ? 0 : 0.5,
                borderTopColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                <Icon name={section.icon} size={18} color={theme.colors.textSecondary} />
                <AppText variant="bodyStrong" style={{ fontSize: 14.5, fontWeight: '700' }} numberOfLines={1}>
                  {section.label}
                </AppText>
              </View>
              <Switch
                value={on}
                onValueChange={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  onToggle(section.key);
                }}
                accessibilityLabel={`Show ${section.label}`}
                trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Done"
        style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
      >
        <AppText variant="caption" color="textSecondary" style={{ fontWeight: '700', fontSize: 12.5 }}>
          Done
        </AppText>
      </Pressable>
    </BottomSheet>
  );
}
