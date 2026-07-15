// Onboarding — Also tracking? (T11b). Honest scope: only what the app actually
// tracks (compounds beyond the GLP-1 — recovery & healing peptides), no
// lifestyle chips we can't serve. Navigator-local; picking peptides seeds the
// second-compound offer inside the app.

import React from 'react';
import { ConvoScreen } from '../../components';

export type AlsoTracking = 'peptides' | 'glp1_only';

export interface AlsoTrackingScreenProps {
  progress: number;
  onBack?(): void;
  context?: string;
  onAnswer(value: AlsoTracking): void;
}

export function AlsoTrackingScreen({ progress, onBack, context, onAnswer }: AlsoTrackingScreenProps) {
  return (
    <ConvoScreen<AlsoTracking>
      progress={progress}
      onBack={onBack}
      context={context}
      question="Anything riding along?"
      options={[
        {
          label: 'Recovery & healing peptides',
          sub: 'BPC-157 and friends — tracked side by side',
          value: 'peptides',
        },
        { label: 'Just the GLP-1 journey', value: 'glp1_only' },
      ]}
      onAnswer={onAnswer}
    />
  );
}
