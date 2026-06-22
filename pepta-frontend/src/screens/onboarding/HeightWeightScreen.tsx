// Onboarding screen 12 — Height & weight. Two wheels + an Imperial/Metric toggle.
// Toggling converts both values (convertBody) and remounts the wheels (keyed on
// units) so they re-center. Each scroll fires the haptic + tick (WheelPicker).

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, SegmentedToggle, WheelPicker, type WheelItem } from '../../components';
import { numberRange } from '../../utils/dateParts';
import { convertBody, type BodyMeasure, type UnitSystem } from '../../utils/units';

export interface HeightWeightScreenProps {
  progress: number;
  onBack?(): void;
  value: BodyMeasure;
  onChange(value: BodyMeasure): void;
  onContinue(): void;
}

const UNIT_OPTIONS: { label: string; value: UnitSystem }[] = [
  { label: 'Imperial', value: 'imperial' },
  { label: 'Metric', value: 'metric' },
];

export function HeightWeightScreen({ progress, onBack, value, onChange, onContinue }: HeightWeightScreenProps) {
  const theme = useTheme();
  const metric = value.units === 'metric';

  const heightItems: WheelItem[] = metric
    ? numberRange(120, 220).map((cm) => ({ label: `${cm} cm`, value: cm }))
    : numberRange(48, 84).map((inches) => ({ label: `${Math.floor(inches / 12)}'${inches % 12}"`, value: inches }));
  const weightItems: WheelItem[] = metric
    ? numberRange(32, 180).map((kg) => ({ label: `${kg} kg`, value: kg }))
    : numberRange(70, 400).map((lb) => ({ label: `${lb} lb`, value: lb }));

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle">Your height & weight</AppText>

      <View style={{ alignItems: 'center', marginTop: theme.spacing.lg }}>
        <SegmentedToggle
          options={UNIT_OPTIONS}
          value={value.units}
          onChange={(units) => onChange(convertBody(value, units))}
        />
      </View>

      <View style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="sectionHeader" color="textTertiary" align="center" style={{ marginBottom: theme.spacing.sm }}>
            Height
          </AppText>
          <WheelPicker
            key={`height-${value.units}`}
            items={heightItems}
            value={value.height}
            onChange={(height) => onChange({ ...value, height })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="sectionHeader" color="textTertiary" align="center" style={{ marginBottom: theme.spacing.sm }}>
            Weight
          </AppText>
          <WheelPicker
            key={`weight-${value.units}`}
            items={weightItems}
            value={value.weight}
            onChange={(weight) => onChange({ ...value, weight })}
          />
        </View>
      </View>
    </OnboardingScaffold>
  );
}
