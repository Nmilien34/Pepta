// Onboarding screen 9 — Goal type. Single-select → profile.goalType (a real
// @pepta/shared field). Type is derived from the schema so it can never drift.

import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { UserProfileInput } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard } from '../../components';

export type GoalType = UserProfileInput['goalType'];

export interface GoalTypeScreenProps {
  progress: number;
  onBack?(): void;
  value?: GoalType;
  onChange(value: GoalType): void;
  onContinue(): void;
}

interface GoalOption {
  value: GoalType;
  title: string;
  subtitle: string;
  icon: 'fire' | 'equal' | 'dumbbell';
  color: string;
}

const GOALS: GoalOption[] = [
  { value: 'lose_fat', title: 'Lose fat', subtitle: 'Drop fat, protect muscle', icon: 'fire', color: '#993C1D' },
  { value: 'maintain', title: 'Maintain', subtitle: 'Hold steady', icon: 'equal', color: '#5F5E5A' },
  { value: 'recomp', title: 'Build & recomp', subtitle: 'Add muscle while leaning out', icon: 'dumbbell', color: '#0F6E56' },
];

export function GoalTypeScreen({ progress, onBack, value, onChange, onContinue }: GoalTypeScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value === undefined} />}
    >
      <AppText variant="obTitle">What’s your goal?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        Sets your calorie & protein targets.
      </AppText>

      <View style={{ gap: 11, marginTop: theme.spacing.xl }}>
        {GOALS.map((goal) => (
          <OptionCard
            key={goal.value}
            title={goal.title}
            subtitle={goal.subtitle}
            icon={<MaterialCommunityIcons name={goal.icon} size={22} color={goal.color} />}
            selected={value === goal.value}
            onPress={() => onChange(goal.value)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}
