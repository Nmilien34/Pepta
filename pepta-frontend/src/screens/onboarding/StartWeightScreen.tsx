// Onboarding screen 13 — Start weight + date (the GLP-1 baseline). Two
// tappable fields that reveal an inline picker each: starting weight (wheel) and
// start date (date wheel, past-only). Maps to baselineWeight{value,unit} +
// profile.journeyStartDate. The Pep note derives "X down already" live.

import React, { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import {
  AppText,
  Button,
  Card,
  DateWheel,
  Mascot,
  OnboardingScaffold,
  WheelPicker,
  type WheelItem,
} from '../../components';
import { formatLongDate, numberRange, recentYears, type DateParts } from '../../utils/dateParts';
import type { UnitSystem } from '../../utils/units';

type OpenField = 'weight' | 'date' | null;

export interface StartWeightScreenProps {
  progress: number;
  onBack?(): void;
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
  units,
  currentWeight,
  startWeight,
  onStartWeightChange,
  startDate,
  onStartDateChange,
  onContinue,
}: StartWeightScreenProps) {
  const theme = useTheme();
  const [open, setOpen] = useState<OpenField>(null);
  const unitLabel = units === 'metric' ? 'kg' : 'lb';

  const years = useMemo(() => recentYears(new Date(), 5), []);
  const minYear = years[0] ?? new Date().getFullYear() - 5;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear();

  const weightItems: WheelItem[] = (units === 'metric' ? numberRange(32, 180) : numberRange(70, 400)).map(
    (value) => ({ label: `${value} ${unitLabel}`, value }),
  );

  const lost = startWeight - currentWeight;
  const note =
    lost > 0
      ? `${lost} ${unitLabel} down already — we’ll chart every step from here.`
      : 'We’ll chart every step from here.';

  const toggle = (field: OpenField) => setOpen((current) => (current === field ? null : field));

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} />}
    >
      <AppText variant="obTitle">Where did you start?</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        Your weight when you began your GLP-1.
      </AppText>

      <AppText variant="sectionHeader" color="textTertiary" style={{ marginTop: theme.spacing.xl }}>
        Starting weight
      </AppText>
      <PickerField
        icon={<MaterialCommunityIcons name="scale-bathroom" size={18} color={theme.colors.textSecondary} />}
        value={`${startWeight} ${unitLabel}`}
        open={open === 'weight'}
        onPress={() => toggle('weight')}
      />
      {open === 'weight' ? (
        <Card style={{ marginTop: theme.spacing.sm }} padding={theme.spacing.sm}>
          <WheelPicker items={weightItems} value={startWeight} onChange={onStartWeightChange} />
        </Card>
      ) : null}

      <AppText variant="sectionHeader" color="textTertiary" style={{ marginTop: theme.spacing.lg }}>
        Start date
      </AppText>
      <PickerField
        icon={<Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />}
        value={formatLongDate(startDate)}
        open={open === 'date'}
        onPress={() => toggle('date')}
      />
      {open === 'date' ? (
        <Card style={{ marginTop: theme.spacing.sm }} padding={theme.spacing.sm}>
          <DateWheel value={startDate} onChange={onStartDateChange} minYear={minYear} maxYear={maxYear} maxToday />
        </Card>
      ) : null}

      <Card style={{ marginTop: theme.spacing.lg, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }} flat>
        <Mascot pose="idle" size={40} />
        <AppText variant="caption" color="textPrimary" style={{ flex: 1 }}>
          {note}
        </AppText>
      </Card>
    </OnboardingScaffold>
  );
}

interface PickerFieldProps {
  icon: React.ReactNode;
  value: string;
  open: boolean;
  onPress(): void;
}

function PickerField({ icon, value, open, onPress }: PickerFieldProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.sm,
        padding: 15,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      {icon}
      <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '700' }}>
        {value}
      </AppText>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}
