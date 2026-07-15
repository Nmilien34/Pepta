// Onboarding — Sex (T12). Disarmed: the question names WHY before asking
// ("Calorie math needs this"). The schema only has profile.sex (male|female);
// the 4-way identity lives in navigator state. Auto-advance.

import React from 'react';
import { ConvoScreen } from '../../components';

export type GenderIdentity = 'woman' | 'man' | 'nonbinary' | 'prefer_not_to_say';

export interface SexGenderScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: GenderIdentity): void;
}

export function SexGenderScreen({ progress, onBack, context, onAnswer }: SexGenderScreenProps) {
  return (
    <ConvoScreen<GenderIdentity>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Calorie math needs this"
      questionAccent
      sub="Sex is only used to estimate your calorie needs."
      options={[
        { label: 'Woman', value: 'woman' },
        { label: 'Man', value: 'man' },
        { label: 'Non-binary', value: 'nonbinary' },
        { label: 'Prefer not to say', value: 'prefer_not_to_say' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
