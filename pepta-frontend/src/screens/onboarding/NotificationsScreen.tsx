// Onboarding screen 21 — Notifications. "Allow" requests local reminder
// permission through the navigator; "Not now" skips without saving defaults.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from "../../components/Icon";
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold } from '../../components';

export interface NotificationsScreenProps {
  progress: number;
  onBack?(): void;
  onAllow?(): Promise<void> | void;
  onContinue(): void;
}

export function NotificationsScreen({ progress, onBack, onAllow, onContinue }: NotificationsScreenProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);

  const handleAllow = async () => {
    setLoading(true);
    try {
      await onAllow?.();
    } finally {
      setLoading(false);
      onContinue();
    }
  };

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      tintColor="#F1ECFF"
      footer={
        <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <Button label="Allow notifications" onPress={handleAllow} loading={loading} />
          <Pressable onPress={onContinue} hitSlop={theme.sizes.hitSlop} accessibilityRole="button">
            <AppText variant="caption" color="textSecondary">
              Not now
            </AppText>
          </Pressable>
        </View>
      }
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl }}>
        <LinearGradient
          colors={[theme.colors.primaryGradientStart, theme.colors.primaryGradientEnd] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 96, height: 96, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="notifications" size={44} color="#FFFFFF" />
        </LinearGradient>
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <AppText variant="obTitle" align="center">
            Never miss a shot
          </AppText>
          <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 260 }}>
            Gentle reminders for your dose, water and protein — only when they help.
          </AppText>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
