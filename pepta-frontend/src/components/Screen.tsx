// Screen — the standard screen container (Foster's ScreenContainer equivalent).
// Handles safe area, themed background, status-bar style, and the standard 20px
// horizontal padding. Set `scroll` for vertical scroll content; the Home screen
// is a single vertical scroll with no carousels (Master Prompt §2/§7.2).

import React, { type ReactNode } from 'react';
import { ScrollView, StatusBar, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  // Horizontal screen padding (20px). Disable for full-bleed layouts.
  padded?: boolean;
  edges?: readonly Edge[];
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
  // Extra bottom space so content clears the floating tab bar / FAB.
  bottomInset?: number;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  contentContainerStyle,
  style,
  bottomInset = 0,
}: ScreenProps) {
  const theme = useTheme();
  const horizontal = padded ? theme.spacing.screen.paddingHorizontal : 0;

  const innerStyle: ViewStyle = {
    paddingHorizontal: horizontal,
    paddingTop: theme.spacing.screen.paddingTop,
  };

  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            innerStyle,
            { paddingBottom: theme.spacing.screen.paddingBottom + bottomInset },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, innerStyle, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
