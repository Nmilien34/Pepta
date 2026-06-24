// Onboarding screen 21 — Notifications. Deferred integration: "Allow" is a safe
// stub that advances (no permission request yet); "Not now" skips. Both move on.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from "../../components/Icon";
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold } from '../../components';

export interface NotificationsScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

export function NotificationsScreen({ progress, onBack, onContinue }: NotificationsScreenProps) {
  const theme = useTheme();

  const handleAllow = () => {
    // TODO: request push permission (expo-notifications) when the integration lands.
    onContinue();
  };

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      tintColor="#F1ECFF"
      footer={
        <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <Button label="Allow notifications" onPress={handleAllow} />
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
