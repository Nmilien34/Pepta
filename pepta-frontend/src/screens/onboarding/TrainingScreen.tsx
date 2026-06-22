// Onboarding screen 17 — Training → profile.trainingStatus (real schema field).
// Our muscle-retention flair input — kept light and friendly.

import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TrainingStatus } from '@pepta/shared';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard } from '../../components';

export interface TrainingScreenProps {
  progress: number;
  onBack?(): void;
  value?: TrainingStatus;
  onChange(value: TrainingStatus): void;
  onContinue(): void;
}

interface TrainingOption {
  value: TrainingStatus;
  title: string;
  icon: 'sofa' | 'sprout' | 'refresh' | 'dumbbell';
  color: string;
}

const OPTIONS: TrainingOption[] = [
  { value: 'not_training', title: 'Not yet', icon: 'sofa', color: '#5F5E5A' },
  { value: 'beginner', title: 'Just starting', icon: 'sprout', color: '#854F0B' },
  { value: 'returning', title: 'Getting back into it', icon: 'refresh', color: '#0F6E56' },
  { value: 'consistent', title: 'Consistent', icon: 'dumbbell', color: '#0C447C' },
];

export function TrainingScreen({ progress, onBack, value, onChange, onContinue }: TrainingScreenProps) {
  const theme = useTheme();
  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value === undefined} />}
    >
      <AppText variant="obTitle">Do you lift?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        Resistance work is the best way to keep muscle.
      </AppText>
      <View style={{ gap: 11, marginTop: theme.spacing.xl }}>
        {OPTIONS.map((option) => (
          <OptionCard
            key={option.value}
            title={option.title}
            icon={<MaterialCommunityIcons name={option.icon} size={22} color={option.color} />}
            selected={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </OnboardingScaffold>
  );
}
