// Onboarding — activity level and training status on ONE turn (merged
// 2026-08-28 from the former `dailyRoutine` (T18) and `training` (T19) steps).
//
// WHY THEY MERGED. They were adjacent, both single-tap pickers, and both feed
// the same thing: the muscle-retention risk score behind the reveal. Asking
// "how do you move" and "do you lift" as two separate turns treated one
// picture of someone's week as two unrelated facts.
//
// WHY IT NEEDED A COMPONENT CHANGE FIRST. Both were auto-advance ConvoScreens
// with a single `options` list, and ConvoScreen had no way to render two
// labelled question groups — nor did it export its card. Merging them by hand
// would have meant copying that card's styling, which drifts. `ConvoGroup`
// exists so this screen uses the SAME cards as every other turn.
//
// SELECTION HOLDS, IT DOES NOT ADVANCE. With two questions on screen the first
// tap cannot mean "done", so Continue is gated on both being answered — an
// unanswered group is a silently incomplete risk score, and the score is what
// the reveal is built from.

import React from 'react';
import type { ActivityLevel, TrainingStatus } from '@pepta/shared';
import { ConvoButton, ConvoScreen, type ConvoGroup } from '../../components';

export interface LifestyleScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  activityLevel?: ActivityLevel;
  trainingStatus?: TrainingStatus;
  onActivityChange(value: ActivityLevel): void;
  onTrainingChange(value: TrainingStatus): void;
  onContinue(): void;
}

/**
 * `ActivityLevel | TrainingStatus` rather than two typed groups: ConvoScreen
 * is generic over ONE value type per screen. The union is safe because the
 * two option sets share no values, and each group's onSelect narrows back.
 */
type LifestyleValue = ActivityLevel | TrainingStatus;

export function LifestyleScreen({
  progress,
  onBack,
  context,
  activityLevel,
  trainingStatus,
  onActivityChange,
  onTrainingChange,
  onContinue,
}: LifestyleScreenProps) {
  const groups: ConvoGroup<LifestyleValue>[] = [
    {
      label: 'MOST DAYS LOOK LIKE',
      value: activityLevel,
      onSelect: (value) => onActivityChange(value as ActivityLevel),
      options: [
        { label: 'Mostly sitting', sub: 'desk, car, couch', value: 'sedentary' },
        { label: 'Lightly active', sub: 'on your feet a fair bit', value: 'light' },
        { label: 'Active', sub: 'moving most of the day', value: 'moderate' },
        { label: 'Very active', sub: 'physical job or daily training', value: 'active' },
      ],
    },
    {
      label: 'LIFTING THESE DAYS',
      value: trainingStatus,
      onSelect: (value) => onTrainingChange(value as TrainingStatus),
      options: [
        { label: 'Regularly', sub: '2+ sessions a week', value: 'consistent' },
        { label: 'Getting back into it', value: 'returning' },
        { label: 'Just starting', value: 'beginner' },
        { label: 'Not yet', sub: 'that’s fine, protein still protects', value: 'not_training' },
      ],
    },
  ];

  return (
    <ConvoScreen<LifestyleValue>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Now, your week"
      groups={groups}
      footer={
        <ConvoButton
          label="Continue"
          onPress={onContinue}
          // Both, because training carries the heaviest weight in the risk
          // score (0.30) and activity the lightest — letting either through
          // unanswered ships a score that looks computed and is not.
          disabled={activityLevel == null || trainingStatus == null}
        />
      }
    />
  );
}
