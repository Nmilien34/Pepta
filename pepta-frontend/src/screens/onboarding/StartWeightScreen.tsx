// Onboarding — Start weight (T15). Where they began: weight + start date, each
// a tappable field revealing an inline wheel. The context line echoes their
// current numbers forward ("5'10", 226 today."). Maps to baselineWeight +
// profile.journeyStartDate.

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/Icon';
import { ConvoButton, ConvoScreen, DateWheel, WheelPicker, convo, type WheelItem } from '../../components';
import { typography } from '../../theme/typography';
import { formatLongDate, numberRange, recentYears, type DateParts } from '../../utils/dateParts';
import type { UnitSystem } from '../../utils/units';

type OpenField = 'weight' | 'date' | null;

export interface StartWeightScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  units: UnitSystem;
  currentWeight: number;
  startWeight: number;
  onStartWeightChange(value: number): void;
  startDate: DateParts;
  onStartDateChange(parts: DateParts): void;
  onContinue(): void;
}

export function StartWeightScreen({
  progress,
  onBack,
  context,
  units,
  currentWeight,
  startWeight,
  onStartWeightChange,
  startDate,
  onStartDateChange,
  onContinue,
}: StartWeightScreenProps) {
  const [open, setOpen] = useState<OpenField>(null);
  const unitLabel = units === 'metric' ? 'kg' : 'lb';

  const years = useMemo(() => recentYears(new Date(), 5), []);
  const minYear = years[0] ?? new Date().getFullYear() - 5;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear();

  const weightItems: WheelItem[] = (units === 'metric' ? numberRange(32, 180) : numberRange(70, 400)).map(
    (value) => ({ label: `${value} ${unitLabel}`, value }),
  );

  const lost = startWeight - currentWeight;
  const sub =
    lost > 0
      ? `${lost} ${unitLabel} down already — that's real. Every step gets charted from here.`
      : 'Your weight when you began your GLP-1.';

  const toggle = (field: OpenField) => setOpen((current) => (current === field ? null : field));

  return (
    <ConvoScreen
      progress={progress}
      onBack={onBack}
      context={context}
      question="Where did you start?"
      sub={sub}
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    >
      <View style={{ marginTop: 26 }}>
        <Text style={styles.fieldLabel}>STARTING WEIGHT</Text>
        <PickerField
          icon="scale-bathroom"
          value={`${startWeight} ${unitLabel}`}
          open={open === 'weight'}
          onPress={() => toggle('weight')}
        />
        {open === 'weight' ? (
          <View style={styles.panel}>
            <WheelPicker items={weightItems} value={startWeight} onChange={onStartWeightChange} />
          </View>
        ) : null}

        <Text style={[styles.fieldLabel, { marginTop: 18 }]}>START DATE</Text>
        <PickerField
          icon="calendar-outline"
          value={formatLongDate(startDate)}
          open={open === 'date'}
          onPress={() => toggle('date')}
        />
        {open === 'date' ? (
          <View style={styles.panel}>
            <DateWheel value={startDate} onChange={onStartDateChange} minYear={minYear} maxYear={maxYear} maxToday />
          </View>
        ) : null}
      </View>
    </ConvoScreen>
  );
}

interface PickerFieldProps {
  icon: string;
  value: string;
  open: boolean;
  onPress(): void;
}

function PickerField({ icon, value, open, onPress }: PickerFieldProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={18} color={convo.soft} />
      <Text style={styles.fieldValue}>{value}</Text>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={convo.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { fontFamily: typography.fonts.semiBold, fontSize: 12, letterSpacing: 0.6, color: convo.faint, marginBottom: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: convo.hairline,
    backgroundColor: convo.surface,
  },
  fieldValue: { fontFamily: typography.fonts.bold, fontSize: 15.5, color: convo.ink, flex: 1 },
  panel: {
    marginTop: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: convo.hairline,
    backgroundColor: convo.surface,
    paddingVertical: 6,
  },
});
