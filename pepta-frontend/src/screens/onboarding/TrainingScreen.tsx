// Onboarding — Training (T19) → profile.trainingStatus (real schema field).
// The muscle-retention input. "Not yet" pre-reassures in its own sub-line —
// no guilt mechanics anywhere.

import React from 'react';
import type { TrainingStatus } from '@pepta/shared';
import { ConvoScreen } from '../../components';

export interface TrainingScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: TrainingStatus): void;
}

export function TrainingScreen({ progress, onBack, context, onAnswer }: TrainingScreenProps) {
  return (
    <ConvoScreen<TrainingStatus>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Lifting these days?"
      options={[
        { label: 'Regularly', sub: '2+ sessions a week', value: 'consistent' },
        { label: 'Getting back into it', value: 'returning' },
        { label: 'Just starting', value: 'beginner' },
        { label: 'Not yet', sub: 'that’s fine — protein still protects', value: 'not_training' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
