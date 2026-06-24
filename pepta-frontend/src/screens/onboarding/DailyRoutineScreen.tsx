// Onboarding screen 16 — Daily routine → profile.activityLevel (real schema
// field, type imported from @pepta/shared).

import React from 'react';
import { View } from 'react-native';
import { Icon } from "../../components/Icon";
import type { ActivityLevel } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard } from '../../components';

export interface DailyRoutineScreenProps {
  progress: number;
  onBack?(): void;
  value?: ActivityLevel;
  onChange(value: ActivityLevel): void;
  onContinue(): void;
}

interface RoutineOption {
  value: ActivityLevel;
  title: string;
  subtitle: string;
  icon: 'sofa' | 'walk' | 'run' | 'fire';
  color: string;
}

const OPTIONS: RoutineOption[] = [
  { value: 'sedentary', title: 'Mostly sitting', subtitle: 'Desk job, little movement', icon: 'sofa', color: '#5F5E5A' },
  { value: 'light', title: 'Lightly active', subtitle: 'On my feet some of the day', icon: 'walk', color: '#0F6E56' },
  { value: 'moderate', title: 'Active', subtitle: 'Moving most of the day', icon: 'run', color: '#854F0B' },
  { value: 'active', title: 'Very active', subtitle: 'Physical job or daily training', icon: 'fire', color: '#993C1D' },
];

export function DailyRoutineScreen({ progress, onBack, value, onChange, onContinue }: DailyRoutineScreenProps) {
  const theme = useTheme();
  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value === undefined} />}
    >
      <AppText variant="obTitle">Your daily routine</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        Roughly how active are you?
      </AppText>
      <View style={{ gap: 11, marginTop: theme.spacing.xl }}>
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            title={option.title}
            subtitle={option.subtitle}
            icon={<Icon name={option.icon} size={22} color={option.color} />}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}
