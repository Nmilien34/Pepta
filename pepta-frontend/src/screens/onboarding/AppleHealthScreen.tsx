// Onboarding screen 8 — Apple Health (optional). A friendly value pitch. The
// HealthKit integration is DEFERRED: "Connect" is a safe no-op that advances the
// flow (never fakes a real connection), and "Maybe later" skips. Both move on.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from "../../components/Icon";
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold } from '../../components';

export interface AppleHealthScreenProps {
  progress: number;
  onBack?(): void;
  onContinue(): void;
}

export function AppleHealthScreen({ progress, onBack, onContinue }: AppleHealthScreenProps) {
  const theme = useTheme();

  const handleConnect = () => {
    // TODO: wire HealthKit permission (read weight + steps) when the integration
    // lands. For now this is a safe stub that advances the flow.
    onContinue();
  };

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={
        <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <Button label="Connect Apple Health" onPress={handleConnect} />
          <Pressable onPress={onContinue} hitSlop={theme.sizes.hitSlop} accessibilityRole="button">
            <AppText variant="caption" color="textSecondary">
              Maybe later
            </AppText>
          </Pressable>
        </View>
      }
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: theme.radii.pill,
            backgroundColor: '#FCEBEB',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="heart" size={42} color="#A32D2D" />
        </View>
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <AppText variant="obTitle" align="center">
            Sync Apple Health
          </AppText>
          <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 270 }}>
            Pull in weight & steps automatically — less to log by hand.
          </AppText>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
