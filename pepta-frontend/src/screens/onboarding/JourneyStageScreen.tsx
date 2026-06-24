// Onboarding screen 3 — Journey stage. Sets where the user is on their GLP-1
// journey; this gates which medication steps appear later. Single-select with an
// explicit Continue (disabled until a choice is made), matching the design lab.
//
// NOTE: there is no `medicationStatus` field in the current @pepta/shared
// onboarding schema, so the navigator holds this in local flow state for now.
// TODO: persist to the typed draft once the schema gains the field.

import React from 'react';
import { View } from 'react-native';
import { Icon } from "../../components/Icon";
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard } from '../../components';

export type JourneyStage = 'active' | 'starting_soon' | 'none';

export interface JourneyStageScreenProps {
  progress: number;
  onBack?(): void;
  value?: JourneyStage;
  onChange(value: JourneyStage): void;
  onContinue(): void;
}

export function JourneyStageScreen({
  progress,
  onBack,
  value,
  onChange,
  onContinue,
}: JourneyStageScreenProps) {
  const theme = useTheme();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={!value} />}
    >
      <AppText variant="obTitle">Where are you in your journey?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        This tailors your setup.
      </AppText>

      <View style={{ gap: 11, marginTop: theme.spacing.xl }}>
        <OptionCard
          title="Already on a GLP-1"
          subtitle="Tracking shots & progress"
          icon={<Icon name="needle" size={22} color={theme.colors.primary} />}
          selected={value === 'active'}
          onPress={() => onChange('active')}
        />
        <OptionCard
          title="Starting soon"
          subtitle="Prescription on the way"
          icon={<Icon name="calendar-plus" size={22} color={theme.colors.fiber} />}
          selected={value === 'starting_soon'}
          onPress={() => onChange('starting_soon')}
        />
        <OptionCard
          title="Just exploring"
          subtitle="Not on one yet"
          icon={<Icon name="compass-outline" size={22} color={theme.colors.warning} />}
          selected={value === 'none'}
          onPress={() => onChange('none')}
        />
      </View>
    </OnboardingScaffold>
  );
}
