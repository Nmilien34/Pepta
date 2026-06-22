// Onboarding screen 5 — Current dose. Chips come from the selected medication's
// commonDoses (falling back to a sensible set for compounded/custom), plus a
// Custom option. Single-select → compound.plannedDose + doseUnit later.

import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { AppText, Button, Chip, Mascot, OnboardingScaffold } from '../../components';
import type { MedicationOption } from '../../data/medicationCatalog';

export type DoseValue = number | 'custom';

export interface DoseScreenProps {
  progress: number;
  onBack?(): void;
  medication?: MedicationOption;
  value?: DoseValue;
  onChange(value: DoseValue): void;
  onContinue(): void;
}

const FALLBACK_DOSES = [2.5, 5, 7.5, 10, 12.5, 15];

export function DoseScreen({ progress, onBack, medication, value, onChange, onContinue }: DoseScreenProps) {
  const theme = useTheme();
  const doses = medication && medication.commonDoses.length > 0 ? medication.commonDoses : FALLBACK_DOSES;
  const unit = medication?.doseUnit ?? 'mg';

  return (
    <OnboardingScaffold
      progress={progress}
      onBack={onBack}
      footer={<Button label="Continue" onPress={onContinue} disabled={value === undefined} />}
    >
      <AppText variant="obTitle">Your current dose</AppText>
      <AppText variant="caption" color="textSecondary" style={{ marginTop: theme.spacing.sm }}>
        {medication?.name ? `${medication.name} · pick what you’re on now.` : 'Pick what you’re on now.'}
      </AppText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: theme.spacing.xl }}>
        {doses.map((dose) => (
          <Chip
            key={dose}
            label={`${dose} ${unit}`}
            selected={value === dose}
            onPress={() => onChange(dose)}
          />
        ))}
        <Chip label="Custom" selected={value === 'custom'} onPress={() => onChange('custom')} />
      </View>

      <View style={{ flex: 1, minHeight: 60, justifyContent: 'flex-end', alignItems: 'center', paddingTop: theme.spacing['2xl'] }}>
        <Mascot pose="idle" size={92} />
      </View>
    </OnboardingScaffold>
  );
}
