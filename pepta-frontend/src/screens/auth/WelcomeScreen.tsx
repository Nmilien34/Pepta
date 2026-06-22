// Onboarding screen 1 — Welcome / hero. Sets the premium, calm tone: Pep waving
// and gently floating, a confident one-line promise, and the entry CTA. Both
// "Get started" and "Sign in" lead to the provider sign-in screen (screen 1b).

import React from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { AppText, Button, Float, Mascot, Reveal } from '../../components';

export interface WelcomeScreenProps {
  onContinue(): void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <StatusBar barStyle="dark-content" />
      <LinearGradient
        colors={['#F1ECFF', theme.colors.bg] as const}
        locations={[0, 0.5] as const}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: theme.spacing['2xl'],
            paddingBottom: theme.spacing['2xl'],
          }}
        >
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing['2xl'] }}>
            <Reveal>
              <Float>
                <Mascot pose="wave" size={186} />
              </Float>
            </Reveal>
            <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
              <Reveal delay={140}>
                <AppText variant="screenTitle" align="center">
                  Your trusted{'\n'}GLP-1 partner.
                </AppText>
              </Reveal>
              <Reveal delay={220}>
                <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 290 }}>
                  Lose the fat, keep the muscle — Pepta tracks the whole journey.
                </AppText>
              </Reveal>
            </View>
          </View>

          <Reveal delay={340}>
            <Button label="Get started" onPress={onContinue} />
          </Reveal>
          <Reveal delay={420} style={{ marginTop: theme.spacing.lg, alignItems: 'center' }}>
            <Pressable onPress={onContinue} hitSlop={theme.sizes.hitSlop} accessibilityRole="button">
              <AppText variant="caption" color="textSecondary">
                Already have an account?{' '}
                <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                  Sign in
                </AppText>
              </AppText>
            </Pressable>
          </Reveal>
        </View>
      </SafeAreaView>
    </View>
  );
}
