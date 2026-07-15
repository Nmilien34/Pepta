// Onboarding — Concentration (T7b, syringe & vial users only). Dose +
// concentration = draw-to units on day one ("1 mg = 10 units"). The schema
// field already exists on the compound. "Not sure yet" skips gracefully —
// the calculator asks again later. Precise input → sticky chips + Continue.

import React from 'react';
import { ConvoButton, ConvoScreen } from '../../components';

export type ConcentrationValue = number | 'unsure';

export interface ConcentrationScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  value?: ConcentrationValue;
  onSelect(value: ConcentrationValue): void;
  onContinue(): void;
}

const COMMON_MG_PER_ML = [5, 10, 15, 20, 25, 30];

export function ConcentrationScreen({
  progress,
  onBack,
  context,
  value,
  onSelect,
  onContinue,
}: ConcentrationScreenProps) {
  return (
    <ConvoScreen<ConcentrationValue>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What’s the concentration?"
      sub="It’s on your vial or mixing notes — this turns doses into exact draw-to units."
      options={[
        ...COMMON_MG_PER_ML.map((mg) => ({ label: `${mg} mg/mL`, value: mg as ConcentrationValue })),
        { label: 'Not sure yet', value: 'unsure' as ConcentrationValue },
      ]}
      value={value}
      onSelect={onSelect}
      footer={<ConvoButton label="Continue" disabled={value === undefined} onPress={onContinue} />}
    />
  );
}
