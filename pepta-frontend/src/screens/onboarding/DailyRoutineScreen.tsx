// Onboarding — Routine (T18) → profile.activityLevel (real schema field).
// Feeds the calorie + step targets. A spoken answer: tap → auto-advance.

import React from 'react';
import type { ActivityLevel } from '@pepta/shared';
import { ConvoScreen } from '../../components';

export interface DailyRoutineScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: ActivityLevel): void;
}

export function DailyRoutineScreen({ progress, onBack, context, onAnswer }: DailyRoutineScreenProps) {
  return (
    <ConvoScreen<ActivityLevel>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Most days look like…"
      options={[
        { label: 'Mostly sitting', sub: 'desk, car, couch', value: 'sedentary' },
        { label: 'Lightly active', sub: 'on your feet a fair bit', value: 'light' },
        { label: 'Active', sub: 'moving most of the day', value: 'moderate' },
        { label: 'Very active', sub: 'physical job or daily training', value: 'active' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
