// Onboarding — Side effects (T20, multi) → sideEffectBaseline[] (real schema
// field). Multi-select chips with an exclusive "None yet" (= empty array);
// Continue is always allowed (no effects is valid). Their picks echo into T21.

import React from 'react';
import type { OnboardingCompleteInput } from '@pepta/shared';
import { ConvoButton, ConvoScreen, type ConvoOption } from '../../components';

export type SideEffectType = OnboardingCompleteInput['sideEffectBaseline'][number];

export interface SideEffectsScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  value: SideEffectType[];
  onToggle(effect: SideEffectType): void;
  onClear(): void;
  onContinue(): void;
}

type SideEffectChoice = SideEffectType | 'none';

const EFFECTS: { value: SideEffectType; label: string }[] = [
  { value: 'nausea', label: 'Nausea' },
  { value: 'constipation', label: 'Constipation' },
  { value: 'diarrhea', label: 'Diarrhea' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'headache', label: 'Headache' },
  { value: 'reflux', label: 'Heartburn' },
  { value: 'appetite_suppression', label: 'Appetite loss' },
  { value: 'injection_site_reaction', label: 'Injection-site reaction' },
  { value: 'other', label: 'Other' },
];

export function SideEffectsScreen({
  progress,
  onBack,
  context,
  value,
  onToggle,
  onClear,
  onContinue,
}: SideEffectsScreenProps) {
  const options: ConvoOption<SideEffectChoice>[] = [
    { label: 'None yet', value: 'none' },
    ...EFFECTS.map((effect) => ({ label: effect.label, value: effect.value as SideEffectChoice })),
  ];

  return (
    <ConvoScreen<SideEffectChoice>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Any side effects so far?"
      sub="The log ties them to doses, so you can see what triggers what."
      multi
      options={options}
      values={value.length === 0 ? ['none'] : value}
      onToggle={(choice) => (choice === 'none' ? onClear() : onToggle(choice as SideEffectType))}
      footer={<ConvoButton label="Continue" onPress={onContinue} />}
    />
  );
}
