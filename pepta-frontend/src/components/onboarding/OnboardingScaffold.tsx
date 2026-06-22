// Shared chrome for every onboarding step: themed background, status bar, the
// progress header, a rise-in scrollable body, and an optional sticky footer for
// the primary CTA. Each step renders its own scaffold, so the body's entrance
// animation (Reveal) replays on every step — matching Leanient's per-screen rise.

import React, { type ReactNode } from 'react';
import { ScrollView, StatusBar, StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { Reveal } from '../Reveal';
import { OnboardingHeader } from './OnboardingHeader';

export interface OnboardingScaffoldProps {
  progress: number;
  onBack?(): void;
  showBack?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
  // Optional soft top-of-screen wash (celebratory / pitch screens).
  tintColor?: string;
}

export function OnboardingScaffold({
  progress,
  onBack,
  showBack = true,
  children,
  footer,
  contentStyle,
  tintColor,
}: OnboardingScaffoldProps) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {tintColor ? (
        <LinearGradient colors={[tintColor, theme.colors.bg] as const} locations={[0, 0.5] as const} style={StyleSheet.absoluteFill} />
      ) : null}
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <OnboardingHeader progress={progress} onBack={onBack} showBack={showBack} />
        <Reveal duration={520} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              {
                flexGrow: 1,
                paddingHorizontal: theme.spacing.xl,
                paddingTop: theme.spacing.xs,
                paddingBottom: theme.spacing.lg,
              },
              contentStyle,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Reveal>
        {footer ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.xl,
              paddingTop: theme.spacing.sm,
              paddingBottom: theme.spacing.xs,
            }}
          >
            {footer}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
