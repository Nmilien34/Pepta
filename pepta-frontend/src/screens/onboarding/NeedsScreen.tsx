// Onboarding — Needs (T3c, multi-select). What would help most. The conversion
// goldmine: these exact words come back — crafting checks them off one by one
// and the paywall's value stack leads with the user's own picks. Also our
// clearest product-priority signal in aggregate. Navigator-local for now.

import React from 'react';
import { ConvoButton, ConvoScreen } from '../../components';

export type NeedType =
  | 'whats_working'
  | 'logging'
  | 'schedule'
  | 'multiple_compounds'
  | 'dose_math'
  | 'doctor_reports';

export const NEED_LABELS: Record<NeedType, string> = {
  whats_working: 'Knowing what’s working',
  logging: 'Logging consistently',
  schedule: 'My schedule',
  multiple_compounds: 'Multiple compounds',
  dose_math: 'Dose & mixing math',
  doctor_reports: 'Reports for my doctor',
};

export interface NeedsScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  values: NeedType[];
  onToggle(value: NeedType): void;
  onContinue(): void;
}

const OPTIONS = (Object.keys(NEED_LABELS) as NeedType[]).map((value) => ({
  label: NEED_LABELS[value],
  value,
}));

export function NeedsScreen({ progress, onBack, context, values, onToggle, onContinue }: NeedsScreenProps) {
  return (
    <ConvoScreen<NeedType>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What would help most?"
      sub="Pick as many as you like."
      multi
      options={OPTIONS}
      values={values}
      onToggle={onToggle}
      footer={<ConvoButton label="Continue" disabled={values.length === 0} onPress={onContinue} />}
    />
  );
}
