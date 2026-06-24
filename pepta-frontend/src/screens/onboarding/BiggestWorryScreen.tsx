// Onboarding screen 18 — Biggest worry → profile.biggestWorry (real schema
// field). An emotional beat: empathetic copy, calm 2x2 tiles.

import React from 'react';
import { View } from 'react-native';
import { Icon } from "../../components/Icon";
import type { BiggestWorry } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, SelectTile } from '../../components';

export interface BiggestWorryScreenProps {
  progress: number;
  onBack?(): void;
  value?: BiggestWorry;
  onChange(value: BiggestWorry): void;
  onContinue(): void;
}

interface WorryOption {
  value: BiggestWorry;
  label: string;
  icon: 'arm-flex' | 'emoticon-sad-outline' | 'alert-circle-outline' | 'trending-down' | 'restore' | 'sleep';
}

const OPTIONS: WorryOption[] = [
  { value: 'losing_muscle', label: 'Losing muscle', icon: 'arm-flex' },
  { value: 'ozempic_face', label: '“Ozempic face”', icon: 'emoticon-sad-outline' },
  { value: 'side_effects', label: 'Side effects', icon: 'alert-circle-outline' },
  { value: 'stalling', label: 'Stalling out', icon: 'trending-down' },
  { value: 'rebound', label: 'Regaining it', icon: 'restore' },
  { value: 'energy', label: 'Low energy', icon: 'sleep' },
];

export function BiggestWorryScreen({ progress, onBack, value, onChange, onContinue }: BiggestWorryScreenProps) {
  const theme = useTheme();
  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value === undefined} />}
    >
      <AppText variant="obTitle">What worries you most?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        We’ll keep a close eye on it for you.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: theme.spacing.lg }}>
        {OPTIONS.map((option) => (
          <View key={option.value} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <SelectTile
              label={option.label}
              selected={value === option.value}
              onPress={() => onChange(option.value)}
              icon={<Icon name={option.icon} size={21} color={theme.colors.textSecondary} />}
            />
          </View>
        ))}
      </View>
    </OnboardingScaffold>
  );
}
