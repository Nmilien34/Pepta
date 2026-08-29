// Onboarding — start weight and goal weight on ONE turn (merged 2026-08-28 from
// the former `startWeight` (T15) and `goalWeight` (T16) steps).
//
// WHY THEY MERGED. They asked for the same kind of number, in the same unit,
// back to back — and with two different pickers: startWeight used a WheelPicker,
// goalWeight a RulerPicker. The split showed most clearly in the echo, where
// goalWeight had to open by quoting startWeight back ("Down 24 lb already") to
// make its own question make sense. That is the layout asking the copy to
// compensate for it.
//
// ONE PICKER, TWO FIELDS. Tap a field to focus it; the ruler edits whichever is
// focused. GOAL is focused on mount because it is the number the user came to
// set — started-at is usually a confirmation of something they already know.
//
// THE START DATE IS GONE. startWeight also collected a start DATE, which
// anchored the progress chart's x-axis. It was the weakest input in the flow:
// recalled rather than known, and a wrong month silently changes the slope of
// every projection built on it. The baseline now defaults to the onboarding
// date. That is a real loss for someone who started months ago — their chart
// begins today instead of then — and the honest place to recover it is in-app,
// beside the chart that makes the ask obvious.

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ConvoButton, ConvoScreen, RulerPicker, SegmentedToggle, convo } from '../../components';
import { typography } from '../../theme/typography';

export type { WeightUnit } from './weightJourney';
import { journeyLine, type WeightUnit } from './weightJourney';

/** Which field the ruler is currently driving. */
type Focus = 'start' | 'goal';

export interface WeightJourneyScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  startWeight: number;
  goalWeight: number;
  unit: WeightUnit;
  /** Today's weight, for the live "down / to go" line. Never edited here. */
  currentWeight: number;
  onStartWeightChange(value: number): void;
  onGoalWeightChange(value: number): void;
  onUnitChange(unit: WeightUnit): void;
  onContinue(): void;
  /**
   * Whether to show the started-at field at all. False for anyone not already
   * dosing — they started today, and heightWeight already has that number.
   * Mirrors the gate the standalone startWeight step carried.
   */
  showStart?: boolean;
}

const UNIT_OPTIONS: { label: string; value: WeightUnit }[] = [
  { label: 'lb', value: 'lb' },
  { label: 'kg', value: 'kg' },
];

export function WeightJourneyScreen({
  progress,
  onBack,
  context,
  startWeight,
  goalWeight,
  unit,
  currentWeight,
  onStartWeightChange,
  onGoalWeightChange,
  onUnitChange,
  onContinue,
  showStart = true,
}: WeightJourneyScreenProps) {
  const [focus, setFocus] = useState<Focus>('goal');
  const min = unit === 'kg' ? 32 : 70;
  const max = unit === 'kg' ? 180 : 400;

  const focused = focus === 'start' ? startWeight : goalWeight;
  const onFocusedChange = focus === 'start' ? onStartWeightChange : onGoalWeightChange;
  const line = journeyLine(startWeight, currentWeight, goalWeight, unit, showStart);

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question={showStart ? 'Where did you start, and where are you headed?' : 'Where are we headed?'}
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    >
      {/* flexGrow, never flex — a flex-basis-0 child inside ConvoScreen's
          flexGrow:1 scroll container collapses to zero once the content above
          fills the viewport, which is how the birthday wheel disappeared. */}
      <View style={styles.body}>
        {showStart ? (
          <Field
            label="STARTED AT"
            value={startWeight}
            unit={unit}
            active={focus === 'start'}
            onPress={() => setFocus('start')}
          />
        ) : null}
        <Field
          label="GOAL"
          value={goalWeight}
          unit={unit}
          active={focus === 'goal'}
          onPress={() => setFocus('goal')}
        />

        {/* Keyed by unit AND focus: the ruler is a controlled scroll view, so
            it has to remount when the number underneath it changes identity. */}
        <RulerPicker
          key={`${unit}-${focus}`}
          value={focused}
          onChange={onFocusedChange}
          min={min}
          max={max}
        />

        <View style={styles.toggleRow}>
          <SegmentedToggle options={UNIT_OPTIONS} value={unit} onChange={onUnitChange} />
        </View>

        {line ? <Text style={styles.live}>{line}</Text> : null}
      </View>
    </ConvoScreen>
  );
}

function Field({
  label,
  value,
  unit,
  active,
  onPress,
}: {
  label: string;
  value: number;
  unit: WeightUnit;
  active: boolean;
  onPress(): void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        // Announces the state, since the visual cue is a border colour.
        accessibilityLabel={`${label}, ${value} ${unit}`}
        accessibilityState={{ selected: active }}
        style={[styles.field, active && styles.fieldActive]}
      >
        <Text style={styles.fieldValue}>
          {value}
          <Text style={styles.fieldUnit}> {unit}</Text>
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingTop: 4 },
  fieldLabel: {
    fontFamily: typography.fonts.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: convo.faint,
    marginBottom: 5,
  },
  field: {
    backgroundColor: convo.surface,
    borderWidth: 1.5,
    borderColor: convo.hairline,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  // Selection is neutral ink, never purple — the app's OptionCard convention.
  fieldActive: { borderColor: convo.ink },
  fieldValue: {
    fontFamily: typography.fonts.heavy,
    fontSize: 20,
    letterSpacing: -0.5,
    color: convo.ink,
  },
  fieldUnit: { fontFamily: typography.fonts.bold, fontSize: 14, color: convo.soft },
  toggleRow: { alignItems: 'center' },
  live: {
    fontFamily: typography.fonts.heavy,
    fontSize: 13,
    color: convo.primary,
    textAlign: 'center',
  },
});
