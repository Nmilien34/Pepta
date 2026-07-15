// Onboarding — Goal type (T11). Single-select → profile.goalType (a real
// @pepta/shared field). A spoken answer: tap → sent bubble → auto-advance.

import React from 'react';
import type { UserProfileInput } from '@pepta/shared';
import { ConvoScreen } from '../../components';

export type GoalType = UserProfileInput['goalType'];

export interface GoalTypeScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: GoalType): void;
}

export function GoalTypeScreen({ progress, onBack, context, onAnswer }: GoalTypeScreenProps) {
  return (
    <ConvoScreen<GoalType>
      progress={progress}
      onBack={onBack}
      context={context}
      question="What’s the goal?"
      options={[
        { label: 'Lose fat', sub: 'and keep the muscle', value: 'lose_fat' },
        { label: 'Build & recomp', sub: 'trade fat for lean mass', value: 'recomp' },
        { label: 'Maintain', sub: 'hold the line', value: 'maintain' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
