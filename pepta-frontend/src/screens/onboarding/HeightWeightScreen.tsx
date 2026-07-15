// Onboarding — Height & weight (T14). Two wheels + an Imperial/Metric toggle
// inside the conversation turn. Toggling converts both values and remounts the
// wheels (keyed on units) so they re-center.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConvoButton, ConvoScreen, SegmentedToggle, WheelPicker, convo, type WheelItem } from '../../components';
import { typography } from '../../theme/typography';
import { numberRange } from '../../utils/dateParts';
import { convertBody, type BodyMeasure, type UnitSystem } from '../../utils/units';

export interface HeightWeightScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  value: BodyMeasure;
  onChange(value: BodyMeasure): void;
  onContinue(): void;
}

const UNIT_OPTIONS: { label: string; value: UnitSystem }[] = [
  { label: 'Imperial', value: 'imperial' },
  { label: 'Metric', value: 'metric' },
];

export function HeightWeightScreen({ progress, onBack, context, value, onChange, onContinue }: HeightWeightScreenProps) {
  const metric = value.units === 'metric';

  const heightItems: WheelItem[] = metric
    ? numberRange(120, 220).map((cm) => ({ label: `${cm} cm`, value: cm }))
    : numberRange(48, 84).map((inches) => ({ label: `${Math.floor(inches / 12)}'${inches % 12}"`, value: inches }));
  const weightItems: WheelItem[] = metric
    ? numberRange(32, 180).map((kg) => ({ label: `${kg} kg`, value: kg }))
    : numberRange(70, 400).map((lb) => ({ label: `${lb} lb`, value: lb }));

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Height and weight, today?"
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    >
      <View style={{ alignItems: 'center', marginTop: 24 }}>
        <SegmentedToggle
          options={UNIT_OPTIONS}
          value={value.units}
          onChange={(units) => onChange(convertBody(value, units))}
        />
      </View>

      <View style={{ flex: 1, flexDirection: 'row', gap: 18, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wheelLabel}>HEIGHT</Text>
          <WheelPicker
            key={`height-${value.units}`}
            items={heightItems}
            value={value.height}
            onChange={(height) => onChange({ ...value, height })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.wheelLabel}>WEIGHT</Text>
          <WheelPicker
            key={`weight-${value.units}`}
            items={weightItems}
            value={value.weight}
            onChange={(weight) => onChange({ ...value, weight })}
          />
        </View>
      </View>
    </ConvoScreen>
  );
}

const styles = StyleSheet.create({
  wheelLabel: {
    fontFamily: typography.fonts.semiBold,
    fontSize: 12,
    letterSpacing: 0.6,
    color: convo.faint,
    textAlign: 'center',
    marginBottom: 8,
  },
});
