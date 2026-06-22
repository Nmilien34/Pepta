// Onboarding screen 14 — Goal weight ("dream weight"). A big hero number driven
// by a horizontal ruler, with an lb/kg toggle. Maps to goalWeight +
// goalWeightUnit (not in the current @pepta/shared schema yet → navigator-local).

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import {
  AppText,
  Button,
  OnboardingScaffold,
  RulerPicker,
  SegmentedToggle,
} from '../../components';

export type WeightUnit = 'lb' | 'kg';

export interface GoalWeightScreenProps {
  progress: number;
  onBack?(): void;
  value: number;
  unit: WeightUnit;
  onValueChange(value: number): void;
  onUnitChange(unit: WeightUnit): void;
  onContinue(): void;
}

const UNIT_OPTIONS: { label: string; value: WeightUnit }[] = [
  { label: 'lb', value: 'lb' },
  { label: 'kg', value: 'kg' },
];

export function GoalWeightScreen({
  progress,
  onBack,
  value,
  unit,
  onValueChange,
  onUnitChange,
  onContinue,
}: GoalWeightScreenProps) {
  const theme = useTheme();
  const min = unit === 'kg' ? 32 : 70;
  const max = unit === 'kg' ? 180 : 400;

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle">Set your dream weight</AppText>

      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing['2xl'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: theme.spacing.sm }}>
          <AppText
            variant="statBig"
            color="weight"
            style={{ fontSize: 62, lineHeight: 64, letterSpacing: -2 }}
          >
            {value}
          </AppText>
          <AppText variant="cardTitle" color="textSecondary">
            {unit}
          </AppText>
        </View>

        <RulerPicker key={unit} value={value} onChange={onValueChange} min={min} max={max} />

        <View style={{ alignItems: 'center' }}>
          <SegmentedToggle options={UNIT_OPTIONS} value={unit} onChange={onUnitChange} />
        </View>
      </View>
    </OnboardingScaffold>
  );
}
