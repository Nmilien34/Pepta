// Onboarding — Worry (T21) → profile.biggestWorry (real schema field). The
// emotional turn: their answer is replayed and answered directly by Beat C
// (FearAnsweredScreen) right after. A spoken answer: tap → auto-advance.

import React from 'react';
import type { BiggestWorry } from '@pepta/shared';
import { ConvoScreen } from '../../components';

export interface BiggestWorryScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: BiggestWorry): void;
}

export function BiggestWorryScreen({ progress, onBack, context, onAnswer }: BiggestWorryScreenProps) {
  return (
    <ConvoScreen<BiggestWorry>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What worries you most?"
      options={[
        { label: 'Losing muscle', value: 'losing_muscle' },
        { label: '“Ozempic face”', value: 'ozempic_face' },
        { label: 'Side effects', value: 'side_effects' },
        { label: 'Stalling out', value: 'stalling' },
        { label: 'Regaining it', value: 'rebound' },
        { label: 'Low energy', value: 'energy' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
