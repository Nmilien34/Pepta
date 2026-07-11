// Apple Health pitch — OUT OF THE FLOW until HealthKit actually lands.
// App Review rejected 1.0(7) under 5.1.1(iv) for exactly this pattern: a
// pre-permission message with a "Connect Apple Health" button and a skip link,
// for a permission that doesn't even exist yet (Connect was a stub). When
// HealthKit ships, re-add the step with a single "Continue" button that
// immediately triggers the real system prompt — no skip/maybe-later escape.

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
