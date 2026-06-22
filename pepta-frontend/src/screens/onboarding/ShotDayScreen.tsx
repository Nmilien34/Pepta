// Onboarding screen 7 — Shot day. Day-of-week selector (multi-select; some
// protocols dose on more than one day → maps to schedule.daysOfWeek[]), framed
// with our flair so the dose timing feels personalized. Shown only for weekly
// injections (gated by the navigator).

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText, Button, Card, DayOfWeekPicker, Mascot, OnboardingScaffold } from '../../components';

export interface ShotDayScreenProps {
  progress: number;
  onBack?(): void;
  value: number[];
  onToggle(day: number): void;
  onContinue(): void;
}

export function ShotDayScreen({ progress, onBack, value, onToggle, onContinue }: ShotDayScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value.length === 0} />}
    >
      <AppText variant="obTitle">Which days do cravings hit hardest?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        Pick all that apply — we’ll time your dose insights around them.
      </AppText>

      <View style={{ marginTop: theme.spacing.xl }}>
        <DayOfWeekPicker value={value} onToggle={onToggle} />
      </View>

      <Card style={{ marginTop: theme.spacing.xl, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Mascot pose="idle" size={44} />
        <AppText variant="caption" color="textPrimary" style={{ flex: 1 }}>
          Appetite usually dips for a day or two after your shot — we’ll help you front-load protein then.
        </AppText>
      </Card>
    </OnboardingScaffold>
  );
}
