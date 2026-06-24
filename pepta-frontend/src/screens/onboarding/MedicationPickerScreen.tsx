// Onboarding screen 4 — Medication picker. A searchable, single-select catalog
// list. The chosen item's `route` drives later gating (oral hides injection
// site; daily-default frequency). Selection is held in navigator flow state for
// now and mapped to the typed `compound` draft once dose/start-date are captured.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Icon } from "../../components/Icon";
import { useTheme } from '../../theme';
import { AppText, Button, OnboardingScaffold, OptionCard, SearchField } from '../../components';
import { MEDICATION_CATALOG, searchMedications, type MedicationOption } from '../../data/medicationCatalog';

export interface MedicationPickerScreenProps {
  progress: number;
  onBack?(): void;
  value?: MedicationOption;
  onChange(item: MedicationOption): void;
  onContinue(): void;
}

export function MedicationPickerScreen({
  progress,
  onBack,
  value,
  onChange,
  onContinue,
}: MedicationPickerScreenProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchMedications(MEDICATION_CATALOG, query), [query]);

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={!value} />}
    >
      <AppText variant="obTitle">What are you taking?</AppText>
      <View style={{ marginTop: theme.spacing.md }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search medications" />
      </View>

      <View style={{ gap: 9, marginTop: theme.spacing.md }}>
        {results.map((item) => (
          <OptionCard
            key={item.id}
            title={item.name}
            subtitle={item.subtitle}
            icon={<MedIcon item={item} />}
            selected={value?.id === item.id}
            onPress={() => onChange(item)}
          />
        ))}
        {results.length === 0 ? (
          <AppText variant="caption" color="textSecondary" align="center" style={{ paddingVertical: theme.spacing.lg }}>
            No matches. You can add it later in Settings.
          </AppText>
        ) : null}
      </View>
    </OnboardingScaffold>
  );
}

function MedIcon({ item }: { item: MedicationOption }) {
  if (item.kind === 'brand' && item.initial) {
    return (
      <AppText variant="statMedium" style={{ fontSize: 18, color: item.tintColor }}>
        {item.initial}
      </AppText>
    );
  }
  const name: 'pill' | 'flask-outline' | 'dots-horizontal' =
    item.kind === 'oral' ? 'pill' : item.kind === 'compound' ? 'flask-outline' : 'dots-horizontal';
  return <Icon name={name} size={22} color={item.tintColor} />;
}
