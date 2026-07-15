// Onboarding — Journey stage (T3). Where the user is on their GLP-1 journey;
// gates the medication block. A spoken answer: tap → sent bubble → auto-advance.
//
// NOTE: there is no `medicationStatus` field mismatch here — the navigator maps
// this to profile.medicationStatus at payload time.

import React from 'react';
import { ConvoScreen } from '../../components';

export type JourneyStage = 'active' | 'starting_soon' | 'none';

export interface JourneyStageScreenProps {
  progress: number;
  onBack?(): void;
  onAnswer(value: JourneyStage): void;
}

export function JourneyStageScreen({ progress, onBack, onAnswer }: JourneyStageScreenProps) {
  return (
    <ConvoScreen<JourneyStage>
      progress={progress}
      onBack={onBack}
      context="Good. Let’s get to know each other."
      question="Where are you in your GLP-1 journey?"
      options={[
        { label: 'Already dosing', sub: 'shots or oral, underway', value: 'active' },
        { label: 'Starting soon', sub: 'prescription on the way', value: 'starting_soon' },
        { label: 'Just exploring', sub: 'no medication yet', value: 'none' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
