// Onboarding — Frequency (T8). How often the user doses. A spoken answer that
// auto-advances; the last-shot date moved to its own turn (T9, LastShotScreen).
// Daily/custom answers skip the shot-day turns downstream.

import React from 'react';
import { ConvoScreen } from '../../components';

export type DoseFrequency = 'weekly' | 'biweekly' | 'daily' | 'custom';

export interface FrequencyScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  oral?: boolean;
  onAnswer(value: DoseFrequency): void;
}

export function FrequencyScreen({ progress, onBack, context, oral, onAnswer }: FrequencyScreenProps) {
  return (
    <ConvoScreen<DoseFrequency>
      progress={progress}
      onBack={onBack}
      context={context}
      question={oral ? 'How often do you take it?' : 'How often do you dose?'}
      options={[
        { label: 'Weekly', value: 'weekly' },
        { label: 'Every 2 weeks', value: 'biweekly' },
        { label: 'Daily', value: 'daily' },
        { label: 'Custom', value: 'custom' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
