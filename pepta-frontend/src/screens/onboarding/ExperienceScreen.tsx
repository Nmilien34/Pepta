// Onboarding — Experience (T3b). How deep the user is in the peptide world.
// Expertise ≠ timeline: this routes copy depth for later turns and tunes Pep
// chat's register. No schema field yet → navigator-local (like journeyStage).

import React from 'react';
import { ConvoScreen } from '../../components';

export type ExperienceLevel = 'new' | 'starting' | 'experienced' | 'advanced';

export interface ExperienceScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: ExperienceLevel): void;
}

export function ExperienceScreen({ progress, onBack, context, onAnswer }: ExperienceScreenProps) {
  return (
    <ConvoScreen<ExperienceLevel>
      progress={progress}
      onBack={onBack}
      context={context}
      question="How deep are you in the peptide world?"
      options={[
        { label: 'Brand new', sub: 'still learning the ropes', value: 'new' },
        { label: 'Getting started', sub: 'researched, ready to go', value: 'starting' },
        { label: 'Experienced', sub: 'followed a protocol before', value: 'experienced' },
        { label: 'Advanced', sub: 'multiple compounds, no hand-holding', value: 'advanced' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
