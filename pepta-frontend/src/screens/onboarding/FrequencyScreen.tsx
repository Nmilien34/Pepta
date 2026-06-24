// Onboarding screen 6 — Frequency + last shot. A 2x2 grid of frequency tiles
// plus a "last shot taken" date field that reveals an inline wheel picker. For
// oral meds the copy shifts to "how often do you take it" / "last dose".

import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from "../../components/Icon";
import { useTheme } from '../../theme';
import { AppText, Button, Card, DateWheel, OnboardingScaffold, SelectTile } from '../../components';
import { formatLongDate, recentYears, type DateParts } from '../../utils/dateParts';

export type DoseFrequency = 'weekly' | 'biweekly' | 'daily' | 'custom';

export interface FrequencyScreenProps {
  progress: number;
  onBack?(): void;
  oral?: boolean;
  frequency?: DoseFrequency;
  onFrequencyChange(value: DoseFrequency): void;
  lastShot: DateParts;
  onLastShotChange(parts: DateParts): void;
  onContinue(): void;
}

interface FreqOption {
  value: DoseFrequency;
  label: string;
  icon: 'calendar-week' | 'calendar-range' | 'white-balance-sunny' | 'tune-variant';
}

const FREQUENCIES: FreqOption[] = [
  { value: 'weekly', label: 'Weekly', icon: 'calendar-week' },
  { value: 'biweekly', label: 'Every 2 weeks', icon: 'calendar-range' },
  { value: 'daily', label: 'Daily', icon: 'white-balance-sunny' },
  { value: 'custom', label: 'Custom', icon: 'tune-variant' },
];

export function FrequencyScreen({
  progress,
  onBack,
  oral,
  frequency,
  onFrequencyChange,
  lastShot,
  onLastShotChange,
  onContinue,
}: FrequencyScreenProps) {
  const theme = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const years = useMemo(() => recentYears(new Date(), 5), []);
  const minYear = years[0] ?? new Date().getFullYear() - 5;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear();

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={frequency === undefined} />}
    >
      <AppText variant="obTitle">{oral ? 'How often do you take it?' : 'How often?'}</AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: theme.spacing.lg }}>
        {FREQUENCIES.map((option) => {
          const selected = frequency === option.value;
          return (
            <View key={option.value} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <SelectTile
                label={option.label}
                selected={selected}
                onPress={() => onFrequencyChange(option.value)}
                icon={
                  <Icon
                    name={option.icon}
                    size={21}
                    color={selected ? theme.colors.primary : theme.colors.textSecondary}
                  />
                }
              />
            </View>
          );
        })}
      </View>

      <AppText variant="sectionHeader" color="textTertiary" style={{ marginTop: theme.spacing.xl }}>
        {oral ? 'Last dose taken' : 'Last shot taken'}
      </AppText>
      <Pressable
        onPress={() => setPickerOpen((open) => !open)}
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
        <Icon name="calendar-outline" size={18} color={theme.colors.textSecondary} />
        <AppText variant="bodyStrong" style={{ flex: 1, fontWeight: '700' }}>
          {formatLongDate(lastShot)}
        </AppText>
        <Icon name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textTertiary} />
      </Pressable>

      {pickerOpen ? (
        <Card style={{ marginTop: theme.spacing.sm }} padding={theme.spacing.sm}>
          <DateWheel value={lastShot} onChange={onLastShotChange} minYear={minYear} maxYear={maxYear} maxToday />
        </Card>
      ) : null}
    </OnboardingScaffold>
  );
}
