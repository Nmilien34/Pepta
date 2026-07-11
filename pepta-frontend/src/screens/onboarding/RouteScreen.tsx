// Onboarding — medication route. Shown only when the picked medication doesn't
// pin how it's taken (compounded meds and "something else" ship as injections
// AND as oral drops/troches). The explicit answer overrides the catalog's
// default route and gates the injection-only steps (device type, shot day).

import React from 'react';
import { View } from 'react-native';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard } from '../../components';

export type MedicationRoute = 'injection' | 'oral' | 'unsure';

export interface RouteScreenProps {
  progress: number;
  onBack?(): void;
  medicationName?: string;
  value?: MedicationRoute;
  onChange(value: MedicationRoute): void;
  onContinue(): void;
}

export function RouteScreen({
  progress,
  onBack,
  medicationName,
  value,
  onChange,
  onContinue,
}: RouteScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={!value} />}
    >
      <AppText variant="obTitle">How do you take it?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        {medicationName ? `${medicationName} comes in a few forms.` : 'This tailors your tracking.'}
      </AppText>

      <View style={{ gap: 11, marginTop: theme.spacing.xl }}>
        <OptionCard
          title="Injection"
          subtitle="Pen, auto-injector, or syringe"
          icon={<Icon name="needle" size={22} color={theme.colors.primary} />}
          selected={value === 'injection'}
          onPress={() => onChange('injection')}
        />
        <OptionCard
          title="Pill or oral"
          subtitle="Tablets, drops, or troches"
          icon={<Icon name="pill" size={22} color={theme.colors.fiber} />}
          selected={value === 'oral'}
          onPress={() => onChange('oral')}
        />
        <OptionCard
          title="Not sure"
          subtitle="We'll start with injection tracking — change anytime"
          icon={<Icon name="help-circle" size={22} color={theme.colors.warning} />}
          selected={value === 'unsure'}
          onPress={() => onChange('unsure')}
        />
      </View>
    </OnboardingScaffold>
  );
}
