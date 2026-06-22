// Onboarding screen 11 — Birthday. A full-screen month/day/year wheel. The year
// range is capped at 13+ years old, so a future date is impossible (no clamp
// needed). Each scroll fires the haptic + tick (see WheelPicker).

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText, Button, DateWheel, OnboardingScaffold } from '../../components';
import type { DateParts } from '../../utils/dateParts';

export interface BirthdayScreenProps {
  progress: number;
  onBack?(): void;
  value: DateParts;
  onChange(parts: DateParts): void;
  onContinue(): void;
}

export function BirthdayScreen({ progress, onBack, value, onChange, onContinue }: BirthdayScreenProps) {
  const theme = useTheme();
  const { minYear, maxYear } = useMemo(() => {
    const current = new Date().getFullYear();
    return { minYear: current - 100, maxYear: current - 13 };
  }, []);

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle">When’s your birthday?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        Used to personalize your targets.
      </AppText>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <DateWheel value={value} onChange={onChange} minYear={minYear} maxYear={maxYear} />
      </View>
    </OnboardingScaffold>
  );
}
