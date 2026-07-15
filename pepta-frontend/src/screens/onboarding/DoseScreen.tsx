// Onboarding — Current dose (T6). Precise input: chips keep their selection and
// Continue confirms (never auto-advance on numbers). Chips come from the
// selected medication's commonDoses, falling back to a sensible set.

import React from 'react';
import { ConvoButton, ConvoScreen } from '../../components';
import type { MedicationOption } from '../../data/medicationCatalog';

export type DoseValue = number | 'custom';

export interface DoseScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  medication?: MedicationOption;
  value?: DoseValue;
  onSelect(value: DoseValue): void;
  onContinue(): void;
}

const FALLBACK_DOSES = [2.5, 5, 7.5, 10, 12.5, 15];

export function DoseScreen({ progress, onBack, context, medication, value, onSelect, onContinue }: DoseScreenProps) {
  const doses = medication && medication.commonDoses.length > 0 ? medication.commonDoses : FALLBACK_DOSES;
  const unit = medication?.doseUnit ?? 'mg';

  return (
    <ConvoScreen<DoseValue>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What’s your current dose?"
      options={[
        ...doses.map((dose) => ({ label: `${dose} ${unit}`, value: dose as DoseValue })),
        { label: 'Custom', value: 'custom' as DoseValue },
      ]}
      value={value}
      onSelect={onSelect}
      footer={<ConvoButton label="Continue" disabled={value === undefined} onPress={onContinue} />}
    />
  );
}
