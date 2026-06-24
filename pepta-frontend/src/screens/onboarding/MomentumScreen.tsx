// Onboarding screen 20 — Momentum interstitial. A tasteful beat derived from the
// user's own numbers (to-go / already-lost). No data captured; pure motivation.

import React from 'react';
import { View } from 'react-native';
import { Icon } from "../../components/Icon";
import { useTheme } from '../../theme';
import { AppText, Button, Mascot, OnboardingScaffold } from '../../components';

export interface MomentumScreenProps {
  progress: number;
  onBack?(): void;
  toGo: number;
  lost: number;
  unit: 'lb' | 'kg';
  onContinue(): void;
}

export function MomentumScreen({ progress, onBack, toGo, lost, unit, onContinue }: MomentumScreenProps) {
  const theme = useTheme();
  const hasToGo = toGo > 0;
  const title = hasToGo ? `${toGo} ${unit} to go.` : 'You’re at your goal!';
  const sub =
    lost > 0
      ? `You’ve already lost ${lost} ${unit}. Let’s keep the momentum together.`
      : 'Let’s build the momentum together.';

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      tintColor="#EAF7EF"
      footer={<Button label="Keep going" onPress={onContinue} />}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xl }}>
        <Mascot pose="wave" size={150} />
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <AppText variant="screenTitle" align="center" color="fiber">
            {title}
          </AppText>
          <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 250 }}>
            {sub}
          </AppText>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#E8F8EE',
            paddingVertical: 7,
            paddingHorizontal: 13,
            borderRadius: theme.radii.pill,
          }}
        >
          <Icon name="checkmark" size={14} color="#1E8E40" />
          <AppText variant="caption" style={{ color: '#1E8E40', fontWeight: '700' }}>
            Works with any GLP-1
          </AppText>
        </View>
      </View>
    </OnboardingScaffold>
  );
}
