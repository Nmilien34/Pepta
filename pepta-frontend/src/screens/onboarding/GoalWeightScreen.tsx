// Onboarding — Goal weight (T16). "Where are we headed?" — the big number rides
// the ruler; the context line echoes their current weight forward ("226 today.
// Thanks for trusting me with that."). Precise input → Continue.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConvoButton, ConvoScreen, RulerPicker, SegmentedToggle, convo } from '../../components';
import { typography } from '../../theme/typography';

export type WeightUnit = 'lb' | 'kg';

export interface GoalWeightScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
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
  context,
  value,
  unit,
  onValueChange,
  onUnitChange,
  onContinue,
}: GoalWeightScreenProps) {
  const min = unit === 'kg' ? 32 : 70;
  const max = unit === 'kg' ? 180 : 400;

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Where are we headed?"
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          <Text style={styles.hero}>{value}</Text>
          <Text style={styles.heroUnit}>{unit}</Text>
        </View>

        <RulerPicker key={unit} value={value} onChange={onValueChange} min={min} max={max} />

        <View style={{ alignItems: 'center' }}>
          <SegmentedToggle options={UNIT_OPTIONS} value={unit} onChange={onUnitChange} />
        </View>
      </View>
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  hero: { fontFamily: typography.fonts.heavy, fontSize: 62, lineHeight: 66, letterSpacing: -2, color: convo.ink },
  heroUnit: { fontFamily: typography.fonts.bold, fontSize: 18, color: convo.soft },
});
